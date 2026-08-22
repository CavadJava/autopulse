# AutoPulse Marketplace — Phase 2 (Mağaza Admin CRUD + Şəkillər) dizayn sənədi

**Tarix:** 2026-08-22
**Status:** Təsdiqlənib (istifadəçi tərəfindən), implementasiya planı gözlənilir

## Kontekst

Faza 1-də (`docs/superpowers/specs/2026-08-22-avtopulse-marketplace-phase1-design.md`) mağazalar üçün oxu-yalnaz vitrin (`/mağazalar`, `/mağazalar/:name`) və mağaza sahibinin cookie-based login-i (`/magaza-giris`, `/magazam` — yalnız görmə) quruldu. Product CRUD UI-si o sənəddə açıq şəkildə **gələcək fazaya** saxlanılmışdı.

Bu sənəd həmin gələcək fazanın ilk dilimidir: `avto444` mağazasının öz login-i ilə daxil olub **yeni məhsul (avtomobil elanı) yarada bilməsi**, məhsula və mağazanın özünə aid **real şəkil upload** dəstəyi ilə.

## Miqyas (bu faza)

**Daxildir:**
- `/magazam` səhifəsinə "Yeni məhsul əlavə et" formu (yalnız əlavə — redaktə/silmə yoxdur)
- Zəngin form sahələri: Ad(slug), Başlıq, Təsvir, Marka, Model, İl, Qiymət, Yürüş, Yanacaq, Ban növü
- Məhsula aid bir neçə şəkil upload-u (real fayl, multipart/form-data)
- Mağazanın özünün logo/vitrin şəklinin upload-u
- Yeni əlavə edilmiş məhsullar və şəkillər `/mağazalar/avto444` vitrinində dərhal görünür
- MinIO-da (mövcud, serverdə artıq işləyən S3-uyğun storage) yeni `avtopulse-public` bucket-i

**Xaricində (sonrakı fazalar):**
- Məhsul redaktə/silmə
- Çoxlu istifadəçi/rol bir mağazaya bağlana bilməsi
- Real production-səviyyəli auth sərtləşdirilməsi (Faza 1-in minimal cookie-session modeli davam edir)
- Yeni mağaza yaratma axını

## Verilənlər bazası (`avto444` schema-sına genişləndirmə)

```sql
ALTER TABLE avto444.shop ADD COLUMN logo_url TEXT;

ALTER TABLE avto444.shop_products
  ADD COLUMN marka TEXT,
  ADD COLUMN model TEXT,
  ADD COLUMN il INTEGER,
  ADD COLUMN qiymet INTEGER,
  ADD COLUMN yurus INTEGER,
  ADD COLUMN yanacaq TEXT,
  ADD COLUMN ban TEXT;

CREATE TABLE avto444.shop_product_images (
  id          BIGSERIAL PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES avto444.shop_products(id),
  url         TEXT NOT NULL,
  sira        INTEGER NOT NULL DEFAULT 0
);
```

(Sütun adları ASCII saxlanılır — `qiymet`/`yurus`/`ban`, Azərbaycan hərfsiz — mövcud `shop`/`shop_products` cədvəllərinin adlandırma konvensiyasına uyğun, DB sütun adlarında `ə/ü/ş` kimi hərflər Faza 1-də də istifadə olunmayıb.)

## Obyekt saxlama (MinIO)

- Server: `157.180.73.79`, MinIO konteyneri artıq işləyir (`docker ps` təsdiqlədi), S3 API `127.0.0.1:9000`, konsol `127.0.0.1:9001` (mövcud `minio-console.157.180.73.79.sslip.io` Caddy-dən proxy olunur)
- Mövcud bucket-lər: `turbo-private`, `turbo-public` (başqa layihəyə aiddir)
- Yeni bucket: **`avtopulse-public`** — public-read policy (şəkillər ictimai olaraq göstəriləcək, autentifikasiya tələb etmir oxumaq üçün)
- Path konvensiyası — iki paralel kök, mağaza (bu faza) və gələcək fərdi/biznes istifadəçi elanları (sonrakı faza, indi yalnız sənədləşdirilir, tətbiq olunmur):

  ```
  magaza/{shopId}/logo/{uuid}.{ext}
  magaza/{shopId}/product/{productId}/{uuid}.{ext}

  user/{userId}/product/{listingId}/{uuid}.{ext}   ← YALNIZ gələcək faza üçün konvensiya,
                                                       bu fazada istifadə OLUNMUR (/elan-ver
                                                       hələ tam mock-data-dır, real backend-ə
                                                       qoşulmayıb — həmin iş ayrıca bir fazadır)
  ```

  Bu fazada faktiki yazılan yeganə path-lər: `magaza/{shopId}/logo/{uuid}.{ext}` və `magaza/{shopId}/product/{productId}/{uuid}.{ext}`.
- Backend Go SDK: `github.com/minio/minio-go/v7` (rəsmi MinIO Go klienti, AWS S3 SDK-a alternativ, MinIO ilə birbaşa uyğun)

## API-lər (yeni, 3 ədəd — hamısı `shop_session` cookie ilə autentifikasiyalı)

1. **`POST /api/shops/me/products`**
   Body (JSON): `{ name, title, details, marka, model, il, qiymet, yurus, yanacaq, ban }`
   Cavab (201): yaradılan `shop_products` sətri, `id` daxil
   401 əgər cookie yoxdursa/etibarsızdırsa

2. **`POST /api/shops/me/products/{id}/images`**
   Body: `multipart/form-data`, bir və ya bir neçə `images` sahəsi
   Cavab (200): `[{ id, url, sira }]` — yüklənən şəkillərin siyahısı
   404 əgər `{id}` login olmuş mağazaya aid deyilsə (başqa mağazanın məhsuluna şəkil yükləməyə cəhd)
   401 əgər cookie yoxdursa/etibarsızdırsa

3. **`POST /api/shops/me/logo`**
   Body: `multipart/form-data`, tək `logo` sahəsi
   Cavab (200): `{ logoUrl }`
   401 əgər cookie yoxdursa/etibarsızdırsa

Mövcud oxu-yalnaz endpoint-lər (`GET /api/shops`, `/by-name/{name}`, `/{shopId}/products`) genişləndirilir ki, cavablarına yeni sahələr (marka/model/il/qiymet/yurus/yanacaq/ban, images massivi, shop-un logo_url-u) daxil olsun.

## Frontend inteqrasiyası

- `/magazam` — mövcud "öz məhsullarını görmə" siyahısının üstünə yeni bir "+ Yeni məhsul əlavə et" bölməsi/toggle əlavə olunur: zəngin form (yuxarıdakı sahələr) + şəkil seçici (bir neçə fayl) → `POST /api/shops/me/products`, sonra qayıdan `id` ilə `POST /api/shops/me/products/{id}/images`. Uğurlu olduqda siyahı yenilənir (yeni məhsul görünür).
- `/magazam`-a həmçinin bir "Mağaza logosu" upload sahəsi əlavə olunur → `POST /api/shops/me/logo`.
- `/mağazalar/avto444` (`ShopFront.tsx`) indi: mağazanın `logo_url`-unu (varsa) başlıq yanında göstərir; hər məhsul kartında ilk şəklini (varsa) göstərir.
- `src/api/shop.ts`-ə yeni funksiyalar: `createShopProduct(payload)`, `uploadProductImages(productId, files)`, `uploadShopLogo(file)` — hamısı `credentials: 'include'`.

## Test və yoxlama

- Backend: yeni handler-lər üçün httptest (auth-qorunması, 401/404 halları), `internal/storage` üçün real MinIO-ya qarşı inteqrasiya testi (mövcud `AVTOPULSE_TEST_DSN` nümunəsinə bənzər, `AVTOPULSE_TEST_MINIO_ENDPOINT` kimi bir env-gate ilə)
- Manual: `curl -F` ilə multipart upload-un işlədiyinin yoxlanması, MinIO konsolunda (`minio-console.157.180.73.79.sslip.io`) yüklənən faylların görünməsi
- Frontend: `npx tsc --noEmit`, `npm run build`, korrupsiya scan, `/magazam`-da real bir avtomobil məhsulu yaradılıb şəkil yükləməklə, sonra `/mağazalar/avto444`-da göründüyünün doğrulanması
