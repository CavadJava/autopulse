# AutoPulse — Fərdi/Biznes Şəxsi Elanlar (Elan Ver → Real DB) dizayn sənədi

**Tarix:** 2026-08-23
**Status:** Təsdiqlənib (istifadəçi tərəfindən), implementasiya planı gözlənilir

## Kontekst

"Elan Ver" (`/elan-ver`, `NewListing.tsx`) formunu doldurub submit edəndə heç bir şey baş vermir — `handleSubmit`-in create-mode qolu sadəcə `clearDraft(); setSubmitted(true);` icra edir, formda doldurulan məlumat heç yerdə saxlanılmır. "Mənim elanlarım" (`KabinetElanlarim.tsx`) də real data deyil, `src/api/auth.ts`-dəki sabit `mockUserListingsByAccount` seed-ini göstərir (`ul-1`/`ul-2` fərdi üçün, `ul-3` biznes üçün) — bu, "Elan Ver"lə heç əlaqəli deyil.

Bu, avtopulse-backend-in mövcud `internal/shop` (mağaza/biznes-shop) domenindən **tamamilə ayrı** bir sahədir — `shop_products` mağaza sahibinin (bir `shop_id`-yə bağlı) kataloq elementləridir, fərdi/biznes **istifadəçi hesabına** bağlı şəxsi avtomobil elanları deyil. Bu iki domeni qarışdırmaq (shop_products-u yenidən istifadə etmək) səhv olardı — fərdi vs biznes hesabların ayrı saxlanılması artıq `mockUserListingsByAccount`-da (AccountKind ilə) qorunan bir prinsipdir və bu backend-də də qorunmalıdır.

Login UI-ı artıq mövcuddur (mock-backed): `/giris` (fərdi: telefon+OTP, biznes: email+ünvan+parol tab-ları), `/giris/kod` (OTP təsdiq addımı). Qeydiyyat/register üçün ayrıca səhifə yoxdur — fərdi OTP axını de-fakto qeydiyyatsız/ilk-girişdə-avtomatik-hesab-yaradan bir modeldir, bu spec bunu olduğu kimi saxlayır.

## Miqyas

**Daxildir:**
- Yeni, `shop`-dan tam ayrı Go paketləri: `internal/account` (fərdi/biznes hesab + sessiya) və `internal/listing` (şəxsi elanlar)
- Fərdi giriş: `POST /api/accounts/otp/request` (real SMS yox, həmişə "göndərildi" qaytarır) + `POST /api/accounts/otp/verify` (sabit test-kodu `1234`, ilk dəfədirsə hesab avtomatik yaradılır)
- Biznes giriş: `POST /api/accounts/login` (email+ünvan+parol, mövcud hesaba qarşı bcrypt yoxlaması)
- `POST /api/accounts/logout`
- Elan CRUD: `GET/POST /api/listings/me`, `PUT /api/listings/me/{id}`, `POST /api/listings/me/{id}/images` — hamısı `account_session` cookie ilə qorunur, mövcud `shop`-dakı ownership-check nümunəsi (`GetProductShopID`-yə bənzər `GetListingAccountID`) təkrar istifadə olunur
- Açıq bazar lenti: `GET /api/listings` (yalnız `status='saytda'`, autentifikasiyasız) — mövcud `mockListings`-i əvəz edir
- Şəkil upload: mövcud `storage.Client.UploadDual` təkrar istifadə olunur, yeni path prefiksi `user/{accountId}/listing/{listingId}/{uuid}.{ext}`
- Frontend: `src/api/auth.ts` və `src/api/listings.ts`-in real API-a keçirilməsi, `NewListing.tsx`-in submit-inin real `createListing`/`updateListing` çağırması, `KabinetElanlarim.tsx`-in real `getMyListings`-dən oxuması

**Xaricində:**
- Real SMS inteqrasiyası (gələcək fazaya saxlanılır — sabit test-kodu kifayətdir)
- Admin moderasiya axını ("Gözləmədə" statusu, admin təsdiq/imtina) — yeni elan birbaşa `saytda` statusu ilə yaradılır
- "Reklam et" (promote/VIP satın alma)-nin real backend-ə bağlanması — frontend-only kosmetik davranış olaraq qalır
- Yeni qeydiyyat/register səhifəsi — mövcud OTP-ilə-avtomatik-hesab modeli saxlanılır
- Kartlarım (ödəniş kartları) — bu sənədin əhatəsindən kənardır

## Backend

### Verilənlər bazası miqrasiyası (`0005_...`)

```sql
CREATE TABLE avto444.accounts (
    id            BIGSERIAL PRIMARY KEY,
    account_kind  TEXT NOT NULL CHECK (account_kind IN ('fərdi', 'biznes')),
    phone         TEXT UNIQUE,
    email         TEXT UNIQUE,
    password_hash TEXT,
    address       TEXT,
    name          TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.account_sessions (
    token      TEXT PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES avto444.accounts(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.listings (
    id         BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES avto444.accounts(id),
    marka      TEXT NOT NULL DEFAULT '',
    model      TEXT NOT NULL DEFAULT '',
    il         INT NOT NULL DEFAULT 0,
    qiymet     INT NOT NULL DEFAULT 0,
    yurus      INT NOT NULL DEFAULT 0,
    yanacaq    TEXT NOT NULL DEFAULT '',
    ban        TEXT NOT NULL DEFAULT '',
    title      TEXT NOT NULL DEFAULT '',
    details    TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'saytda' CHECK (status IN ('saytda', 'muddeti_basa_catmis', 'imtina_olunmus')),
    vip_tier   TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.listing_images (
    id         BIGSERIAL PRIMARY KEY,
    listing_id BIGINT NOT NULL REFERENCES avto444.listings(id),
    minio_url  TEXT NOT NULL,
    s3_url     TEXT,
    sira       INT NOT NULL DEFAULT 0
);
```

Naming/pattern hər yerdə mövcud `shop`/`shop_products`/`shop_product_images`/`shop_sessions` konvensiyasını güdür (bcrypt password hash, COALESCE-based NULL-safe oxuma, named-method handler-lər, chi router).

### API-lər

1. **`POST /api/accounts/otp/request`** — body `{phone}`, həmişə `{"sent": true}` qaytarır (real SMS yoxdur).
2. **`POST /api/accounts/otp/verify`** — body `{phone, code}`; `code != "1234"` → 401; uğurlu olarsa, `phone`-a görə hesab tapılır, tapılmazsa `account_kind='fərdi'` ilə avtomatik yaradılır, `account_session` cookie qoyulur, `{account: AccountSummary}` qaytarılır.
3. **`POST /api/accounts/login`** — body `{email, address, password}`; email-ə görə hesab tapılır (yoxdursa 401), bcrypt yoxlaması, uğurlu olarsa `account_session` cookie qoyulur.
4. **`POST /api/accounts/logout`** — sessiyanı silir, cookie-ni təmizləyir (mövcud `shop`-un `Logout`-u ilə eyni forma).
5. **`GET /api/listings/me`** — cookie-authenticated, bu hesaba aid bütün elanlar (statusundan asılı olmayaraq).
6. **`POST /api/listings/me`** — cookie-authenticated, yeni elan yaradır, `status='saytda'` ilə.
7. **`PUT /api/listings/me/{id}`** — ownership yoxlanılır (`GetListingAccountID` + müqayisə, `shop`-dakı `UpdateProduct`-a bənzər), bütün sahələr redaktə olunur.
8. **`POST /api/listings/me/{id}/images`** — ownership yoxlanılır, multipart upload, `storage.UploadDual` çağırılır, `minioUrl`/`s3Url` hər ikisi qaytarılır (Faza 3-dəki `shop`-un eyni nümunəsi).
9. **`GET /api/listings`** — açıq, autentifikasiyasız, yalnız `status='saytda'` olan elanlar (mövcud `mockListings`-in yerini tutur).

### Go strukturu

- `internal/account/model.go` — `Account{ID, Kind, Phone, Email, Address, Name}`, `AccountSummary{ID, Kind, Name}`
- `internal/account/repository.go` — `Repository` interfeysi: `FindOrCreateByPhone`, `GetByEmail`, `GetPasswordHash`, `GetByID`
- `internal/account/session.go` — mövcud `auth.SessionStore`-un eyni forması, amma `account_sessions` cədvəlinə yazır (kodun özü təkrarlana bilər və ya `auth.SessionStore` generic ediləcək — plan mərhələsində qərarlaşdırılacaq)
- `internal/account/handler.go` — `accountHandlers` struct, adlandırılmış metodlar: `RequestOTP`, `VerifyOTP`, `Login`, `Logout`
- `internal/listing/model.go` — `Listing{ID, AccountID, Marka, Model, Il, Qiymet, Yurus, Yanacaq, Ban, Title, Details, Status, VipTier, Images []ListingImage}`, `ListingImage{ID, MinioURL, S3URL, Sira}`, `CreateListingInput`
- `internal/listing/repository.go` — `Repository` interfeysi: `ListPublicListings` (yalnız saytda), `ListMyListings(accountID)`, `CreateListing`, `UpdateListing`, `GetListingAccountID`, `AddListingImage`
- `internal/listing/handler.go` — `listingHandlers` struct, adlandırılmış metodlar: `MeListings`, `CreateListing`, `UpdateListing`, `UploadListingImages`, `PublicListings` — ownership-check nümunəsi `shop.UploadProductImages`-dəki ilə eyni struktur

`cmd/server/main.go`-a bu iki yeni handler-in route-ları əlavə olunur, `storage.Client` eyni instance (dual MinIO+S3) hər iki domenə ötürülür.

## Frontend

- `src/api/auth.ts`: `requestOtp`, `verifyOtp`, `loginBusiness`, `logout`, `getMyListings`, `promoteListing` (bu sonuncu frontend-only qalır, yalnız state) — real `fetch` (`src/api/shop.ts` nümunəsi ilə eyni struktur, `credentials: 'include'`, GET-lərdə `cache: 'no-store'`)
- `src/api/listings.ts`: `getListings` → `GET /api/listings`, yeni `createListing` əlavə olunur, `updateListing` → `PUT /api/listings/me/{id}`, `uploadListingImages` əlavə olunur
- `Login.tsx` / `LoginVerify.tsx`: sahələr dəyişmir, submit-lər real API-a bağlanır
- `NewListing.tsx`: `handleSubmit`-in create-mode qolu `createListing` + (varsa) `uploadListingImages` çağırır, uğurlu olduqda `setSubmitted(true)`; edit-mode `updateListing` çağırır
- `KabinetElanlarim.tsx`: `mockUserListingsByAccount` yerinə real `getMyListings()` nəticəsini göstərir

## Test və yoxlama

- Backend: `internal/account` və `internal/listing` üçün httptest (OTP uğurlu/səhv kod, biznes login uğurlu/səhv parol, ownership 404, CRUD uğurlu ssenarilər) — mövcud `shop`/`auth` test nümunələri ilə eyni struktur
- Frontend: `npx tsc -b --noEmit`, `npm run build`, korrupsiya scan
- Manual/live: bir dəfəlik test hesabı (fərdi, sınaq telefon nömrəsi) yaradıb real elan yarat, redaktə et, şəkil yüklə (`minioUrl`/`s3Url` hər ikisinin göründüyünü təsdiqlə), sonra `GET /api/listings`-də göründüyünü yoxla — mövcud `avto444` mağaza datasına (10 real məhsul) toxunulmadan
