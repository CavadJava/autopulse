# AutoPulse — İstifadəçi Elanları + Superadmin Moderasiya dizayn sənədi

**Tarix:** 2026-08-23
**Status:** Təsdiqlənib (istifadəçi tərəfindən), implementasiya planı gözlənilir

## Kontekst

Bu sənəd əvvəlki `2026-08-23-avtopulse-personal-listings-design.md` sənədini **əvəz edir** — istifadəçi daha dəqiq tələblər verdi: konkret cədvəl adları (`user`, `user_products`, `user_products_images`, `user_session`), aydın moderasiya axını (yeni elan `gözləmədə` statusundan başlayır, superadmin təsdiqləyir/ləğv edir), və mağaza-tərəfli davranışın (limitsiz, moderasiyasız, dinamik) aydın izahı.

Sistemdə üç iştirakçı olacaq, tam ayrı domenlərdə:
- **Mağaza (shop)** — mövcud, artıq tam işlək sistem (`internal/shop`, `shop_session` cookie). Bu spesin hədəfi deyil, dəyişməz qalır. Mağaza sahibi limitsiz və dinamik şəkildə elan yerləşdirə/redaktə edə/ləğv edə bilər — **moderasiyasız**, birbaşa `saytda` statusu ilə (Faza 3/4-də artıq tikilib).
- **İstifadəçi (user)** — YENİ, bu spesin əsas hədəfi. Fərdi istifadəçi telefon nömrəsi ilə qeydiyyatdan keçir/daxil olur, elan yerləşdirir, elanı **moderasiyadan keçir**.
- **Superadmin** — YENİ. Yalnız istifadəçi elanlarını (`user_products`) təsdiqləyir/ləğv edir. Mağaza elanlarına toxunmur.

**İstifadəçi (user) ilə mağaza (shop) cədvəlləri VƏ autentifikasiyaları tam ayrıdır** — heç bir ortaq cədvəl, heç bir ortaq cookie yoxdur. Hər ikisində "cookie anlayışı" var, amma fərqli cookie adları ilə (`shop_session` vs `user_session`), fərqli sessiya cədvəllərində saxlanılır.

## Miqyas

**Daxildir:**
- Yeni Go paketləri: `internal/user` (istifadəçi hesabı + elan CRUD) və `internal/admin` (superadmin moderasiya)
- İstifadəçi qeydiyyatı/girişi: telefon + sabit test-kodu (`1234`) OTP axını, real SMS inteqrasiyası yoxdur
- İstifadəçi elan CRUD-u: yarat (→ `gözləmədə`), redaktə et, ləğv et (→ `legv_edilib`)
- Superadmin: ayrı, sadə env-based giriş (`ADMIN_USERNAME`/`ADMIN_PASSWORD`), `gözləmədə` elanları siyahılayır, təsdiq/rədd edir
- "Mənim elanlarım" (istifadəçi tərəfi) — bütün statuslar (gözləmədə/saytda/ləğv edilib) göstərilir, hər elan öz statusunda özünü tapa bilməlidir
- Açıq bazar lenti (`GET /api/listings`) — `user_products` və `shop_products`-dan yalnız `saytda` statuslu elanları birləşdirir
- Şəkil upload — mövcud `storage.Client.UploadDual` təkrar istifadə olunur, `user/{userId}/product/{productId}/...` path prefiksi ilə

**Xaricində:**
- Real SMS inteqrasiyası (gələcək fazaya saxlanılır)
- Mağaza (shop) tərəfinin moderasiyası — mağaza elanları olduğu kimi moderasiyasız qalır, bu spesin hədəfi deyil
- "Reklam et" (VIP/promote) — frontend-only kosmetik davranış olaraq qalır, real backend-ə bağlanmır
- Biznes hesab tipi (əvvəlki spesdə var idi) — istifadəçi bu spesdə yalnız fərdi (telefon-əsaslı) istifadəçidən danışdı, biznes-hesab konsepti bu spesə daxil edilmir (mağaza artıq "biznes"in qarşılığıdır)

## Data model

```sql
CREATE TABLE avto444.user (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT NOT NULL DEFAULT '',
    phone      TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.user_session (
    id         TEXT PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES avto444.user(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.user_products (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES avto444.user(id),
    marka      TEXT NOT NULL DEFAULT '',
    model      TEXT NOT NULL DEFAULT '',
    il         INT NOT NULL DEFAULT 0,
    qiymet     INT NOT NULL DEFAULT 0,
    yurus      INT NOT NULL DEFAULT 0,
    yanacaq    TEXT NOT NULL DEFAULT '',
    ban        TEXT NOT NULL DEFAULT '',
    title      TEXT NOT NULL DEFAULT '',
    details    TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'gozlemede' CHECK (status IN ('gozlemede', 'saytda', 'legv_edilib')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.user_products_images (
    id              BIGSERIAL PRIMARY KEY,
    user_product_id BIGINT NOT NULL REFERENCES avto444.user_products(id),
    minio_url       TEXT NOT NULL,
    s3_url          TEXT,
    sira            INT NOT NULL DEFAULT 0
);
```

Naming/pattern mövcud `shop`/`shop_products`/`shop_product_images`/`shop_sessions` konvensiyasını (COALESCE-based NULL-safe oxuma, named-method handler-lər) güdür, sadəcə cədvəl adları istifadəçinin verdiyi dəqiq adlarla (`user`, `user_products`, `user_products_images`, `user_session`) uyğunlaşdırılıb.

### Status maşını

```
[yeni elan] → gözləmədə → (admin təsdiq) → saytda
                       └→ (admin rədd)   → legv_edilib
saytda      → (istifadəçi ləğv edir)     → legv_edilib
legv_edilib → (istifadəçi redaktə edib yenidən göndərir) → gözləmədə  (birbaşa saytda-ya YOX)
```

Ləğv edilmiş elanı bərpa etmək üçün ayrıca "bərpa" düyməsi yoxdur (mağaza sistemindən fərqli olaraq) — istifadəçi formu yenidən doldurub göndərməlidir, bu da yenidən moderasiya tələb edir. Bu, istifadəçinin öz sözü ilə təsdiqlənib: "müştəri yenidən elan doldurmalıdır və sorğu göndərməlidir."

## Backend

### API-lər

**İstifadəçi (`user_session` cookie):**
1. `POST /api/users/otp/request` — body `{phone}`, həmişə `{"sent": true}` (real SMS yoxdur)
2. `POST /api/users/otp/verify` — body `{phone, code}`; `code != "1234"` → 401; uğurlu olarsa hesab tapılır/yaradılır, `user_session` cookie qoyulur
3. `POST /api/users/logout`
4. `GET /api/users/me/products` — bu istifadəçinin bütün elanları, statusundan asılı olmayaraq
5. `POST /api/users/me/products` — yeni elan, `status='gozlemede'` ilə yaradılır
6. `PUT /api/users/me/products/{id}` — ownership yoxlanılır (`GetUserProductUserID` + müqayisə, mövcud `shop`-dakı ownership-check nümunəsi ilə eyni struktur); əgər cari status `legv_edilib`-dirsə, redaktədən sonra `status='gozlemede'`-yə keçir, əks halda status dəyişmir
7. `DELETE /api/users/me/products/{id}` — ownership yoxlanılır, `status='legv_edilib'`-ə keçirir (soft, mağaza sistemindəki kimi)
8. `POST /api/users/me/products/{id}/images` — ownership yoxlanılır, multipart upload, `storage.UploadDual` çağırılır, `minioUrl`/`s3Url` hər ikisi qaytarılır

**Superadmin (`admin_session` cookie, ayrı, sadə):**
9. `POST /api/admin/login` — body `{username, password}`; `.env`-dəki `ADMIN_USERNAME`/`ADMIN_PASSWORD` ilə düz müqayisə (bcrypt-siz, sadə sabit dəyər — bu daxili alət, ictimai qeydiyyat yoxdur)
10. `POST /api/admin/logout`
11. `GET /api/admin/products/pending` — `status='gozlemede'` olan bütün `user_products`
12. `POST /api/admin/products/{id}/approve` — `status='saytda'`-ya keçirir
13. `POST /api/admin/products/{id}/reject` — `status='legv_edilib'`-ə keçirir

**Açıq bazar lenti:**
14. `GET /api/listings` — autentifikasiyasız, `user_products` (status='saytda') və `shop_products` (status='saytda') birləşdirilmiş siyahısı, hər elementdə mənbəni ayırd etmək üçün bir sahə (məs. `source: 'user' | 'shop'`)

### Go strukturu

- `internal/user/model.go` — `User{ID, Name, Phone}`, `UserProduct{ID, UserID, Marka, Model, Il, Qiymet, Yurus, Yanacaq, Ban, Title, Details, Status, Images []UserProductImage}`, `UserProductImage{ID, MinioURL, S3URL, Sira}`, `CreateUserProductInput`
- `internal/user/repository.go` — `Repository` interfeysi: `FindOrCreateByPhone`, `ListMyProducts(userID)`, `ListPublicProducts` (yalnız saytda), `CreateProduct`, `UpdateProduct` (status-preserving/reset məntiqi ilə), `DeleteProduct` (soft), `GetProductUserID`, `AddProductImage`
- `internal/user/session.go` — mövcud `auth.SessionStore`-un eyni forması, `user_session` cədvəlinə yazır
- `internal/user/handler.go` — `userHandlers` struct, adlandırılmış metodlar: `RequestOTP`, `VerifyOTP`, `Logout`, `MeProducts`, `CreateProduct`, `UpdateProduct`, `DeleteProduct`, `UploadProductImages` — ownership-check nümunəsi `shop.UploadProductImages`-dəki ilə eyni struktur
- `internal/admin/handler.go` — `adminHandlers` struct, adlandırılmış metodlar: `Login`, `Logout`, `PendingProducts`, `ApproveProduct`, `RejectProduct` — sadə env-based müqayisə, ownership-check yoxdur (superadmin hər şeyi görür)

`cmd/server/main.go`-a bu iki yeni handler-in route-ları əlavə olunur, mövcud `storage.Client` instance (dual MinIO+S3) `internal/user`-ə də ötürülür.

## Frontend

- `src/api/auth.ts`: `requestOtp`, `verifyOtp`, `logout`, `getMyListings`, `createListing`, `updateListing`, `deleteListing` — real `fetch` (`src/api/shop.ts` nümunəsi ilə eyni struktur, `credentials: 'include'`, GET-lərdə `cache: 'no-store'`)
- `Login.tsx` / `LoginVerify.tsx`: sahələr dəyişmir (fərdi tab: telefon+OTP), submit-lər real API-a bağlanır
- `NewListing.tsx`: `handleSubmit` real `createListing`/`updateListing` + (varsa) şəkil upload çağırır
- `KabinetElanlarim.tsx`: real `getMyListings()`-dən bütün statuslar göstərilir — hər status öz bölməsində/etiketi ilə göstərilməlidir ki, istifadəçi "gözləmədə" olan elanını da tapa bilsin (mövcud `/magazam`-dakı tab modelinə bənzər)
- **Yeni: sadə superadmin panel** (`/admin`) — login formu + `gözləmədə` elanların siyahısı + Təsdiqlə/Rədd Et düymələri
- Açıq bazar lenti (`getListings()` istifadə edən yerlər) — yeni birləşdirilmiş `/api/listings` endpoint-inə keçir

## Test və yoxlama

- Backend: `internal/user` və `internal/admin` üçün httptest (OTP uğurlu/səhv kod, ownership 404, status-keçid məntiqi — yarat→gözləmədə, admin-təsdiq→saytda, admin-rədd→legv_edilib, istifadəçi-redaktə-legv_edilib-üzərində→gözləmədə)
- Frontend: `npx tsc -b --noEmit`, `npm run build`, korrupsiya scan
- Manual/live: bir dəfəlik test istifadəçisi (sınaq telefon nömrəsi) yaradıb real elan yarat (gözləmədə statusunda), superadmin kimi daxil olub təsdiqlə (saytda-ya keçdiyini yoxla), sonra istifadəçi kimi ləğv et (legv_edilib), sonra redaktə edib yenidən göndər (gözləmədə-yə qayıtdığını yoxla) — mövcud `avto444` mağaza datasına (10+ real məhsul) toxunmadan
