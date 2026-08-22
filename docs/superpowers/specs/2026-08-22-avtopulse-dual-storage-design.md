# AutoPulse — dual-write storage (MinIO + real AWS S3) dizayn sənədi

**Tarix:** 2026-08-22
**Status:** Təsdiqlənib (istifadəçi tərəfindən), birbaşa tətbiq olunur (kiçik, aydın dəyişiklik)

## Kontekst

Faza 2-də `avtopulse-backend` şəkil/logo upload-larını yalnız MinIO-da (mövcud, serverdə işləyən S3-uyğun storage) saxlayır. İstifadəçi əlavə olaraq real AWS S3-ə də (paralel, hər iki storage-a) yazmaq istəyir — mövcud bucket: `autopulse.teslahubs`, region `eu-north-1`, artıq içində `shop/` və `user/` qovluqları var.

## Miqyas

**Daxildir:**
- Yükləmə (`Upload`) yolunda hər iki storage-a (MinIO + AWS S3) paralel yazma
- Yeni IAM istifadəçi/access key artıq yaradılıb (istifadəçi tərəfindən, AWS Console-da) — yalnız `autopulse.teslahubs` bucket-inə `PutObject`/`GetObject`/`ListBucket` icazəli
- Hər iki yazma uğurlu olmalıdır — biri uğursuz olarsa bütün upload sorğusu xəta (500) qaytarır

**Xaricində:**
- Oxuma/URL həlli dəyişmir — cavab olaraq qaytarılan URL həmişə MinIO-nun (əsas storage) URL-idir
- `user/` prefiksi hələ istifadə olunmur (gələcək faza, Faza 2 spesifikasiyasında olduğu kimi)

## Arxitektura

```go
// internal/storage/dual.go — yeni fayl
type dualClient struct {
    primary   Client  // MinIO — cavabda qaytarılan URL buradan gəlir
    secondary Client  // real AWS S3 — paralel yazılır
}

func (d *dualClient) Upload(ctx, path string, data io.Reader, size int64, contentType string) (string, error) {
    buf, err := io.ReadAll(data)  // Reader bir dəfə oxunduğu üçün buferlənir
    if err != nil { return "", err }

    url, err := d.primary.Upload(ctx, path, bytes.NewReader(buf), size, contentType)
    if err != nil { return "", fmt.Errorf("minio upload: %w", err) }

    if _, err := d.secondary.Upload(ctx, "shop/"+path, bytes.NewReader(buf), size, contentType); err != nil {
        return "", fmt.Errorf("aws s3 upload: %w", err)
    }

    return url, nil
}

func NewDualClient(primary, secondary Client) Client {
    return &dualClient{primary: primary, secondary: secondary}
}
```

- `NewS3Client(ctx, region, accessKey, secretKey, bucket string) (Client, error)` — mövcud `NewClient`-in AWS-uyğun variantı: `minio.New` çağırışında `endpoint = "s3." + region + ".amazonaws.com"`, `Secure: true`, `Region: region` seçimi verilir. AWS-də bucket-i "yaratmaq/mövcudluğunu yoxlamaq" addımı **atlanır** (bucket artıq var, `MakeBucket`/`SetBucketPolicy` çağırışı edilmir — real AWS hesabında proqramatik policy dəyişikliyi istənməyən əlavə risk daşıyır, bucket-in özü artıq mövcuddur və istifadəçi tərəfindən idarə olunur).
- `main.go`: yeni 4 env dəyişəni oxunur (`AVTOPULSE_AWS_ACCESS_KEY_ID`, `AVTOPULSE_AWS_SECRET_ACCESS_KEY`, `AVTOPULSE_AWS_REGION`, `AVTOPULSE_AWS_BUCKET`), hər ikisi qurulur, `storage.NewDualClient(minioClient, s3Client)` `auth.NewHandler`-ə ötürülür.
- Path konvensiyası AWS tərəfdə: `shop/{shopId}/logo/{uuid}.ext`, `shop/{shopId}/product/{productId}/{uuid}.ext` — mövcud `shop/` qovluğuna uyğun (MinIO-dakı `magaza/` prefiksinin ingiliscə qarşılığı).

## Xəta reaksiyası

- MinIO yazması uğursuz olarsa → dərhal xəta, AWS-ə yazma cəhdi edilmir
- MinIO uğurlu, AWS uğursuz olarsa → yenə də bütün funksiya xəta qaytarır (istifadəçinin seçimi: hər iki storage uğurlu olmalıdır)
- Qeyd: bu o deməkdir ki, MinIO-da fayl artıq yazılıb, amma AWS xəta versə istifadəçiyə 500 qayıdacaq — MinIO-dakı "yetim" fayl silinmir (bu fazada rollback/təmizləmə yoxdur, YAGNI — nadir hal, əl ilə təmizlənə bilər).

## Test və yoxlama

- Yeni `internal/storage/dual_test.go` — fake `Client` test double-ları ilə: hər iki uğurlu halı, MinIO-nun uğursuz halını, AWS-in uğursuz halını yoxlayan sınaqlar (real şəbəkə çağırışı olmadan)
- Manual: `curl -F` ilə real upload edib, həm MinIO-da (`docker exec minio mc ls`), həm AWS S3-də (`aws s3 ls`) faylın göründüyünün doğrulanması
