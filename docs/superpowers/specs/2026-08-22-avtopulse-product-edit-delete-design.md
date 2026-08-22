# AutoPulse Marketplace — Faza 3 (Məhsul redaktə/silmə + dual-storage görünürlüyü + no-cache) dizayn sənədi

**Tarix:** 2026-08-22
**Status:** Təsdiqlənib (istifadəçi tərəfindən), implementasiya planı gözlənilir

## Kontekst

Faza 2 (`docs/superpowers/specs/2026-08-22-avtopulse-marketplace-phase2-design.md`) mağaza sahibinin `/magazam`-da yeni məhsul (avtomobil) yarada bilməsini, şəkil/logo yükləməsini tətbiq etdi — amma **yalnız əlavə etmə**, redaktə/silmə açıq şəkildə gələcək fazaya saxlanılmışdı. İstifadəçi indi mövcud elanlarını redaktə/silmək istəyir.

Paralel olaraq iki kiçik, əlaqəli məsələ də bu fazaya daxil edilir:
1. Real AWS S3 dual-write (əvvəlki tur) tətbiq olunandan sonra, upload cavabında yalnız MinIO URL-i görünür — istifadəçi hər ikisinin (MinIO/S3) URL-inin ayrıca görünməsini istəyir.
2. Brauzer keşi bəzən köhnə/qarışıq elan sayı göstərməsinə səbəb olur — fetch sorğularına cache-busting əlavə olunur.

## Miqyas

**Daxildir:**
- `PUT /api/shops/me/products/{id}` — bütün sahələrin redaktəsi (ad/başlıq/təsvir/marka/model/il/qiymət/yürüş/yanacaq/ban)
- `DELETE /api/shops/me/products/{id}` — məhsulu (və ona aid bütün şəkil sətirlərini) silir
- `DELETE /api/shops/me/products/{id}/images/{imageId}` — tək bir şəkli silir (redaktə zamanı mövcud şəkilləri idarə etmək üçün)
- `/magazam`-da hər kartda "Redaktə et" və "Sil" düymələri
- Upload cavabında `minioUrl` və `s3Url` ayrıca sahələr kimi
- `shop_product_images` cədvəlində `url` sütunu `minio_url`-a çevrilir, yeni `s3_url` (nullable) sütunu əlavə olunur
- Bütün `src/api/shop.ts` GET sorğularına `cache: 'no-store'` əlavə olunur

**Xaricində:**
- Mağaza logosunun redaktəsi/dəyişdirilməsi tarixçəsi (yalnız yenidən yükləmə mövcuddur, bu kifayətdir)
- Şəkillərin sırasının (drag-and-drop) dəyişdirilməsi
- Çoxlu istifadəçi/rol

## Backend

### Verilənlər bazası miqrasiyası (`0004_...`)

```sql
ALTER TABLE avto444.shop_product_images RENAME COLUMN url TO minio_url;
ALTER TABLE avto444.shop_product_images ADD COLUMN s3_url TEXT;
```

### API-lər

1. **`PUT /api/shops/me/products/{id}`**
   Body (JSON): `{ name, title, details, marka, model, il, qiymet, yurus, yanacaq, ban }` (Task 3-ün `createProductRequest`-i ilə eyni forma)
   Ownership: `GetProductShopID` ilə yoxlanılır (Faza 2-dəki `UploadProductImages`-in eyni nümunəsi) — 404 əgər məhsul başqa mağazaya aiddirsə
   Cavab (200): yenilənmiş `shop.Product` (şəkilləri daxil)

2. **`DELETE /api/shops/me/products/{id}`**
   Ownership yoxlanılır (eyni nümunə)
   Sıra: əvvəlcə `shop_product_images`-dan bu `product_id`-ə aid bütün sətirlər silinir (FK), sonra `shop_products`-dan məhsulun özü
   Cavab (200): `{}`

3. **`DELETE /api/shops/me/products/{id}/images/{imageId}`**
   Ownership: `imageId`-nin əslində `id`-yə aid `shop_product_images` sətri olduğu yoxlanılır (yeni bir `GetImageProductID` repository metodu ilə, `GetProductShopID`-yə bənzər)
   Cavab (200): `{}`

Bu 3 endpoint də `auth.authHandlers`-ə yeni adlandırılmış metodlar kimi əlavə olunur (Faza 1/2-dəki inline-closure bug-ının təkrarlanmaması üçün).

### Dual-storage görünürlüyü

`storage.Client.Upload` imzası dəyişir:

```go
type UploadResult struct {
    URL string // primary (MinIO) URL — geriyə uyğunluq üçün saxlanılır
}

// dualClient üçün yeni bir metod, ya da Upload-un özü bir struct qaytarır:
type DualUploadResult struct {
    MinioURL string
    S3URL    string // boş qalır əgər secondary configured deyilsə
}
```

Sadələşdirilmiş yanaşma: `Client` interfeysi dəyişmir (`Upload(...) (string, error)` olaraq qalır, geriyə uyğunluq üçün), amma `dualClient`-in özü **əlavə bir metod** (`UploadDual`) təqdim edir, `authHandlers.UploadProductImages`/`UploadLogo` bunu çağırır (type assertion və ya interfeysin genişləndirilməsi ilə). `shop.ProductImage` strukturuna `S3URL string` sahəsi əlavə olunur, JSON tag `s3Url`; mövcud `URL` sahəsi `MinioURL`-a çevrilir, JSON tag `minioUrl`-a dəyişir (**breaking change** — frontend bu adları uyğunlaşdırmalıdır).

## Frontend

- `src/api/shop.ts`-ə: `updateShopProduct(id, input)`, `deleteShopProduct(id)`, `deleteProductImage(productId, imageId)` funksiyaları
- `ProductImage` interfeysi: `url` → `minioUrl`, yeni `s3Url?: string`
- Bütün GET sorğularına (`getShops`, `getShopByName`, `getShopProducts`, `getMyShopProducts`) `cache: 'no-store'` əlavə olunur
- `/magazam` (`MyShop.tsx`):
  - Hər məhsul kartında "✎ Redaktə et" və "🗑 Sil" düymələri
  - "Redaktə et" basılanda, kartın yerində (və ya modal-da) mövcud "Yeni məhsul" formunun eyni komponenti açılır, sahələr məhsulun cari dəyərləri ilə doldurulur, submit `updateShopProduct`-a gedir
  - Mövcud şəkillər kiçik miniatür siyahısında göstərilir, hər birinin üstündə "✕" — basılanda `deleteProductImage` çağırılır, siyahı yenilənir
  - Hər şəklin altında kiçik etiket: "MinIO" və (əgər `s3Url` varsa) "AWS S3" — hər ikisi göstərilir ki, hansı storage-ların işlədiyi aydın olsun
  - "Sil" (bütün məhsul) — `window.confirm`-lə təsdiq alınır, sonra `deleteShopProduct`

## Test və yoxlama

- Backend: yeni 3 endpoint üçün httptest (ownership 404, uğurlu 200, silinmə ardıcıllığının düzgünlüyü)
- Frontend: `npx tsc --noEmit`, `npm run build`, korrupsiya scan
- Manual: real bir məhsulu redaktə edib, bir şəklini silib, sonra bütün məhsulu silərək `/magazalar/avto444`-da dəyişikliyin əks olunduğunun doğrulanması
