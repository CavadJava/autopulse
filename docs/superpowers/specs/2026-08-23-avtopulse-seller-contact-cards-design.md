# AutoPulse — Fərdi/Biznes Satıcı Əlaqə Kartları dizayn sənədi

**Tarix:** 2026-08-23
**Status:** Təsdiqlənib (istifadəçi tərəfindən), implementasiya planı gözlənilir

## Kontekst

`RealListingDetail.tsx` hazırda bütün real elanlar (mağaza + istifadəçi) üçün tək, sadə bir `contactCard` göstərir (qiymət, Kredit/Barter, satıcı badge, telefon-varsa-göstər, Mesaj yaz, promote-kart yalnız sahib üçün). İstifadəçi bunu iki fərqli, zəngin komponentə bölmək istəyir — biri fərdi (şəxsi) satıcı elanları, biri biznes (mağaza) elanları üçün — skrinşot və mətn təsviri ilə dəqiq sahələr göstərərək.

## Miqyas

**Daxildir:**
- İki yeni komponent: `IndividualSellerCard` (`source === 'user'`) və `BusinessSellerCard` (`source === 'shop'`)
- Hər iki komponent bütün real elan detalı səhifələrində (`RealListingDetail.tsx`) istifadə olunur, `source`-a görə seçilir
- Yeni backend sahələri: `qiymet_usd` (hər iki məhsul cədvəlində), `address`/`contact_name`/`created_at` (`shop`-da), `created_at` (`user`-da)
- Mövcud promote-kart məntiqi (yalnız sahib görür) hər iki yeni komponentə inteqrasiya olunur, dəyişməz qalır
- Mövcud "nömrə-varsa-göstər" davranışı (boşdursa düymə görünmür) hər iki kartda qorunur

**Xaricində:**
- Real messaging/chat sistemi — "Mesaj yaz" düyməsi hər iki kartda hazırkı kimi funksionalsız qalır (heç yerə aparmır). Bu, ayrıca, sonrakı bir spec/plan olacaq.
- Real-vaxt valyuta məzənnəsi — `qiymet_usd` satıcının özü tərəfindən əl ilə daxil edilir, avtomatik hesablanmır.
- Elan sayına görə sıralama/filtrasiya dəyişikliyi.

## Data model

Yeni migrasiya `avtopulse-backend/migrations/0010_seller_contact_fields.sql`:

```sql
ALTER TABLE avto444.shop ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE avto444.shop ADD COLUMN contact_name TEXT NOT NULL DEFAULT '';
ALTER TABLE avto444.shop ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE avto444.user ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE avto444.shop_products ADD COLUMN qiymet_usd INT NOT NULL DEFAULT 0;
ALTER TABLE avto444.user_products ADD COLUMN qiymet_usd INT NOT NULL DEFAULT 0;
```

Qeyd: mövcud sətirlər üçün `created_at DEFAULT now()` migrasiya anını "üzvlük tarixi" kimi alacaq — real, dəqiq tarix deyil, amma boş/saxta doldurmaqdan üstündür və istifadəçi tərəfindən qəbul edilib.

## Backend

- `shop.Shop`/`user.User` struct-larına: `Address string`, `ContactName string`, `CreatedAt time.Time` (Shop); `CreatedAt time.Time` (User).
- `shop.Product`/`user.Product` struct-larına: `QiymetUSD int json:"qiymetUsd"`.
- `CreateProductInput`/`createProductRequest`-ə `QiymetUSD int json:"qiymetUsd"`, `CreateProduct`/`UpdateProduct` bunu saxlayır.
- Mağazanın `address`/`contact_name` redaktəsi üçün: heç bir mövcud "shop profilini yenilə" endpoint-i yoxdur (yalnız `SetShopLogo`/`me/logo` var) — yeni `PUT /me` endpoint-i əlavə olunur (`internal/auth/handler.go`-da, `UpdateShopProfile` handler-i, body `{"address": "...", "contactName": "..."}`), `shop.Repository`-ə uyğun `UpdateShopProfile(ctx, shopID, address, contactName string) error` metodu. `MyShop.tsx`-in loqo-yükləmə bölməsinin yanına iki yeni input sahəsi (ünvan, əlaqə şəxsi adı) əlavə olunur, eyni "yüklə" düyməsi pattern-i ilə.
- `listings.PublicListing`-ə əlavə sahələr:
  - `qiymetUsd int` (məhsulun özündən)
  - `sellerCreatedAt string` (RFC3339, `shop.CreatedAt`/`user.CreatedAt`-dən)
  - Yalnız `source === 'shop'` üçün: `sellerContactName string`, `sellerWorkTimes string`, `sellerAddress string`, `sellerActiveListingCount int` (bu mağazanın `status='saytda'` məhsullarının sayı, `ListActiveProducts`-dan hesablanır)
- `handler.go`-nun 4 `PublicListing{}` literalına bu sahələr əlavə olunur (shop qollarında tam, user qollarında yalnız `qiymetUsd`/`sellerCreatedAt`).

## Frontend

### `IndividualSellerCard` (`src/components/IndividualSellerCard.tsx` + `.module.css`)

Props: `listing: Listing` (mövcud adapter tipindən), `isOwner: boolean`, `onPromote: (tier) => Promise<void>`.

Göstərir: qiymət (AZN), satıcı adı (`satıcıAd`), Şəxsi badge, şəhər, "Satıcı MM.YYYY-dan AutoPulse-da" (`sellerCreatedAt`-dan formatlanır), nömrə-varsa-göstər (boşdursa gizli), "Mesaj yaz" (passiv düymə), promote kartı (yalnız `isOwner`).

### `BusinessSellerCard` (`src/components/BusinessSellerCard.tsx` + `.module.css`)

Props: `listing: Listing`, `isOwner: boolean`, `onPromote: (tier) => Promise<void>`, `sellerName: string` (mağaza adı, link üçün).

Göstərir: qiymət AZN + qiymət USD (`qiymetUsd` > 0 olduqda), loqo (`Shop.LogoURL`) + şirkət adı + Diler/Salon badge, əlaqə şəxsi adı (`contactName`), şəhər, üzvlük tarixi, nömrə-varsa-göstər, "Mesaj yaz" (passiv), elan sayı (`sellerActiveListingCount`), iş saatları (`sellerWorkTimes`), ünvan (`sellerAddress`), "Mağazaya bax" linki (`/magazalar/{sellerName}`), promote kartı (yalnız `isOwner`).

### `RealListingDetail.tsx`

`source === 'shop'` isə `BusinessSellerCard`, `source === 'user'` isə `IndividualSellerCard` render edir — mövcud `isOwner`/`promoteOpen`/`handlePromote` state-i hər iki komponentə eyni şəkildə ötürülür (dəyişməz qalır, sadəcə hədəf komponent dəyişir).

## Test və yoxlama

- Backend: httptest — `qiymetUsd`/`address`/`contactName`/`createdAt`/`activeListingCount` sahələrinin düzgün oxunub-yazıldığı, mövcud sətirlərin (boş defolt dəyərlərlə) xəta vermədən işlədiyi.
- Frontend: `npx tsc -b --noEmit`, `npm run build`, korrupsiya scan.
- Manual/live: real bir mağaza profilinə address/contact_name əlavə et, bir məhsula `qiymet_usd` əlavə et, elan detalında `BusinessSellerCard`-ın bütün sahələri (loqo, əlaqə şəxsi, ünvan, iş saatları, elan sayı, AZN+USD) düzgün göstərdiyini doğrula; real bir istifadəçi elanında `IndividualSellerCard`-ın düzgün göründüyünü doğrula; hər ikisində promote kartının yalnız sahibə göründüyünü, mövcud 12+ real elanın (yeni sahələr boş/defolt) xəta vermədən göründüyünü təsdiqlə.
