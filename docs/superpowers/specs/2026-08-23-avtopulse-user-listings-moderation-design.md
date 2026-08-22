# AutoPulse — İstifadəçi Elanları + Superadmin Moderasiya dizayn sənədi

**Tarix:** 2026-08-23
**Status:** Təsdiqlənib (istifadəçi tərəfindən), implementasiya planı gözlənilir

## Kontekst

Bu sənəd əvvəlki `2026-08-23-avtopulse-personal-listings-design.md` sənədini **əvəz edir** — istifadəçi daha dəqiq tələblər verdi: konkret cədvəl adları (`user`, `user_products`, `user_products_images`, `user_session`), aydın moderasiya axını (yeni elan `gözləmədə` statusundan başlayır, superadmin təsdiqləyir/ləğv edir), və mağaza-tərəfli davranışın (limitsiz, moderasiyasız, dinamik) aydın izahı.

Sistemdə üç iştirakçı olacaq, tam ayrı domenlərdə:
- **Mağaza (shop)** — mövcud, artıq tam işlək sistem (`internal/shop`, `shop_session` cookie). Bu spesin hədəfi deyil, dəyişməz qalır. Mağaza sahibi limitsiz və dinamik şəkildə elan yerləşdirə/redaktə edə/ləğv edə bilər — **moderasiyasız**, birbaşa `saytda` statusu ilə (Faza 3/4-də artıq tikilib).
- **İstifadəçi (user)** — YENİ, bu spesin əsas hədəfi. Fərdi istifadəçi telefon nömrəsi ilə qeydiyyatdan keçir/daxil olur, elan yerləşdirir, elanı **moderasiyadan keçir**.
- **Superadmin** — YENİ. İstifadəçi elanlarını (`user_products`) təsdiqləyir/rədd edir (moderasiya). Əlavə olaraq, mağaza elanlarına (`shop_products`) da baxa bilər və istəsə onları ləğv edə bilər — mağaza elanları moderasiyasız qalır (superadmin təsdiqi tələb olunmur), amma superadmin nəzarət/müdaxilə hüququna malikdir.

**İstifadəçi (user) ilə mağaza (shop) cədvəlləri VƏ autentifikasiyaları tam ayrıdır** — heç bir ortaq cədvəl, heç bir ortaq cookie yoxdur. Hər ikisində "cookie anlayışı" var, amma fərqli cookie adları ilə (`shop_session` vs `user_session`), fərqli sessiya cədvəllərində saxlanılır.

## Miqyas

**Daxildir:**
- Yeni Go paketləri: `internal/user` (istifadəçi hesabı + elan CRUD), `internal/admin` (superadmin moderasiya) və `internal/listings` (açıq bazar üçün birləşdirilmiş lent)
- İstifadəçi qeydiyyatı/girişi: telefon + sabit test-kodu (`1234`) OTP axını, real SMS inteqrasiyası yoxdur
- İstifadəçi elan CRUD-u: yarat (→ `gözləmədə`), redaktə et, ləğv et (→ `legv_edilib`)
- Superadmin: ayrı, sadə env-based giriş (`ADMIN_USERNAME`/`ADMIN_PASSWORD`), `gözləmədə` istifadəçi elanlarını siyahılayır, təsdiq/rədd edir
- Superadmin: bütün mağaza elanlarına (`shop_products`, statusundan asılı olmayaraq) baxış imkanı + istəyə görə mövcud soft-delete mexanizmi ilə ləğv etmə imkanı (mağaza sahibinin özünün "Sil" düyməsi ilə eyni backend əməliyyatı — `status='legv_edilib'`)
- "Mənim elanlarım" (istifadəçi tərəfi) — bütün statuslar (gözləmədə/saytda/ləğv edilib/**müddəti başa çatmış**) göstərilir, hər elan öz statusunda özünü tapa bilməlidir
- Açıq bazar lenti (`GET /api/listings`) — `user_products` və `shop_products`-dan yalnız `saytda` statuslu elanları birləşdirir
- Şəkil upload — mövcud `storage.Client.UploadDual` təkrar istifadə olunur, `user/{userId}/product/{productId}/...` path prefiksi ilə
- **Profil, statistika, aktiv-elan-limiti, kart CRUD, balans artırma — həm istifadəçi, həm mağaza tərəfi üçün paralel struktur** (ətraflı aşağıda, "Data model" və "Backend" bölmələrində)
- **Elanların avtomatik müddət bitməsi** (`saytda` → 30 gün sonra `muddeti_basa_catmis`) — həm `user_products`, həm `shop_products` üçün
- Mağaza (shop) elanlarının admin-təsdiq axını — mağaza elanları olduğu kimi moderasiyasız qalır (yaradılan kimi birbaşa `saytda`); superadmin-in mağaza elanına baxış/ləğv hüququ isə DAXİLDİR (yuxarıya bax) — fərq budur ki, mağaza elanı ÖNCƏDƏN təsdiq tələb etmir, superadmin YALNIZ SONRADAN (lazım gələrsə) ləğv edə bilər


**Xaricində:**
- Real SMS inteqrasiyası (gələcək fazaya saxlanılır)
- "Reklam et" (VIP/promote) — frontend-only kosmetik davranış olaraq qalır, real backend-ə bağlanmır
- Biznes hesab tipi (əvvəlki spesdə var idi) — istifadəçi bu spesdə yalnız fərdi (telefon-əsaslı) istifadəçidən danışdı, biznes-hesab konsepti bu spesə daxil edilmir (mağaza artıq "biznes"in qarşılığıdır)
- **Real bank/ödəniş provideri inteqrasiyası** — kart CRUD-u və balans artırma tamamilə mock/DB-qeydi səviyyəsindədir (son 4 rəqəm, müddət, sahibin adı saxlanılır; real kart nömrəsi/CVV heç vaxt saxlanılmır; balans artırma real pul köçürməsi etmir, sadəcə `balance` sütununu artırır) — real Stripe/Payriff və s. inteqrasiyası tamamilə ayrı, gələcək bir layihədir
- Elan limitinin ödənişlə artırılması (dinamik/pullu limit artımı) — limit sabit, `.env`-based ədəddir bu mərhələdə
- Ayrıca xarici cron/systemd-timer prosesi — müddət-bitmə yoxlaması Go serverin öz daxilində, prosesin ömrü boyu işləyən bir background goroutine ilə həll olunur (aşağıya bax), xarici planlaşdırıcıya ehtiyac yoxdur

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
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT NOT NULL REFERENCES avto444.user(id),
    marka          TEXT NOT NULL DEFAULT '',
    model          TEXT NOT NULL DEFAULT '',
    il             INT NOT NULL DEFAULT 0,
    qiymet         INT NOT NULL DEFAULT 0,
    yurus          INT NOT NULL DEFAULT 0,
    yanacaq        TEXT NOT NULL DEFAULT '',
    ban            TEXT NOT NULL DEFAULT '',
    title          TEXT NOT NULL DEFAULT '',
    details        TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'gozlemede' CHECK (status IN ('gozlemede', 'saytda', 'legv_edilib', 'muddeti_basa_catmis')),
    expires_at     TIMESTAMPTZ,              -- saytda-ya kecende teyin olunur (approve vaxti + 30 gun)
    view_count     INT NOT NULL DEFAULT 0,
    contact_count  INT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.user_products_images (
    id              BIGSERIAL PRIMARY KEY,
    user_product_id BIGINT NOT NULL REFERENCES avto444.user_products(id),
    minio_url       TEXT NOT NULL,
    s3_url          TEXT,
    sira            INT NOT NULL DEFAULT 0
);

ALTER TABLE avto444.user ADD COLUMN balance INT NOT NULL DEFAULT 0;

CREATE TABLE avto444.user_cards (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES avto444.user(id),
    last4       TEXT NOT NULL,
    expiry      TEXT NOT NULL,               -- "MM/YY" formatinda, mock deyer
    holder_name TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Movcud shop_products-a paralel elaveler (magaza terefi ucun eyni 5 imkan):
ALTER TABLE avto444.shop_products
  DROP CONSTRAINT shop_products_status_check,
  ADD CONSTRAINT shop_products_status_check CHECK (status IN ('saytda', 'legv_edilib', 'muddeti_basa_catmis')),
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD COLUMN view_count INT NOT NULL DEFAULT 0,
  ADD COLUMN contact_count INT NOT NULL DEFAULT 0;

ALTER TABLE avto444.shop ADD COLUMN balance INT NOT NULL DEFAULT 0;

CREATE TABLE avto444.shop_cards (
    id          BIGSERIAL PRIMARY KEY,
    shop_id     BIGINT NOT NULL REFERENCES avto444.shop(id),
    last4       TEXT NOT NULL,
    expiry      TEXT NOT NULL,
    holder_name TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Naming/pattern mövcud `shop`/`shop_products`/`shop_product_images`/`shop_sessions` konvensiyasını (COALESCE-based NULL-safe oxuma, named-method handler-lər) güdür, sadəcə cədvəl adları istifadəçinin verdiyi dəqiq adlarla (`user`, `user_products`, `user_products_images`, `user_session`) uyğunlaşdırılıb.

**Real dəyər saxlanmayan sahələr:** `user_cards`/`shop_cards`-da yalnız son 4 rəqəm (`last4`), müddət (`expiry`) və kart sahibinin adı saxlanılır — real kart nömrəsi, CVV, PIN heç vaxt heç bir cədvəldə saxlanılmır. Bu, mock/DB-qeydi səviyyəsindədir, real bir ödəniş provideri (Stripe, Payriff və s.) yoxdur.

### Status maşını (hər iki tərəf üçün, `muddeti_basa_catmis` əlavəsi ilə)

```
[yeni user elanı] → gözləmədə → (admin təsdiq) → saytda → (expires_at keçib) → müddəti başa çatmış
                             └→ (admin rədd)   → legv_edilib
[yeni shop elanı] → saytda (moderasiyasız, birbaşa) → (expires_at keçib) → müddəti başa çatmış

saytda      → (istifadəçi/mağaza ləğv edir, ya da superadmin şop elanını ləğv edir) → legv_edilib
legv_edilib → (istifadəçi elanını redaktə edib yenidən göndərir) → gözləmədə  (birbaşa saytda-ya YOX; yalnız user_products üçün — shop_products-da mövcud "Bərpa et" mexanizmi olduğu kimi qalır)
```

Ləğv edilmiş bir **istifadəçi** elanını bərpa etmək üçün ayrıca "bərpa" düyməsi yoxdur (mağaza sistemindən fərqli olaraq) — istifadəçi formu yenidən doldurub göndərməlidir, bu da yenidən moderasiya tələb edir. Bu, istifadəçinin öz sözü ilə təsdiqlənib: "müştəri yenidən elan doldurmalıdır və sorğu göndərməlidir." **Mağaza** elanları üçün mövcud "Bərpa et" (Faza 4) mexanizmi olduğu kimi qalır — dəyişmir.

**Müddət bitmə mexanizmi (real-vaxt background ticker):** `cmd/server/main.go`-da server başlayanda bir background goroutine işə salınır — `time.NewTicker(5 * time.Minute)` ilə hər 5 dəqiqədə bir (konfiqurasiya edilə bilən, `.env`-dəki `EXPIRY_CHECK_INTERVAL`) iki sadə SQL sorğusu icra olunur:

```sql
UPDATE avto444.user_products  SET status = 'muddeti_basa_catmis' WHERE status = 'saytda' AND expires_at < now();
UPDATE avto444.shop_products  SET status = 'muddeti_basa_catmis' WHERE status = 'saytda' AND expires_at < now();
```

Bu, real-vaxt yaxınlaşmasıdır — sorğu gözləmədən, prosesin işlədiyi müddətdə statuslar öz-özünə (ən çox 5 dəqiqə gecikmə ilə) düzəlir. Xarici cron/systemd-timer lazım deyil, hər şey Go serverin öz prosesi daxilində, `context.Context`-lə düzgün dayandırılan (server `SIGTERM` alanda ticker də dayanır) bir goroutine-də işləyir. Bu, əvvəlki dizaynda planlaşdırılan "lazy expiry" (yalnız sorğu zamanı yoxlama) yanaşmasını əvəz edir — istifadəçinin özünün tələbi ilə.

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
9. `PUT /api/users/me/profile` — body `{name, phone}`, cari istifadəçinin öz profilini yeniləyir
10. `GET /api/users/me/stats` — `{byStatus: {gozlemede, saytda, legv_edilib, muddeti_basa_catmis}, products: [{id, title, status, viewCount, contactCount, expiresAt, daysRemaining}]}`
11. `GET /api/users/me/cards`, `POST /api/users/me/cards` (`{last4, expiry, holderName}`), `PUT /api/users/me/cards/{id}`, `DELETE /api/users/me/cards/{id}` — ownership yoxlanılır
12. `POST /api/users/me/balance/topup` — body `{amount}`, mock (heç bir real ödəniş provideri çağırılmır, sadəcə `balance += amount`), yeni balansı qaytarır
13. Yeni elan yaradanda (`POST /me/products`) aktiv (`gozlemede`+`saytda`) elan sayı `.env`-dəki `USER_ACTIVE_LISTING_LIMIT`-i keçərsə → 403 `{"error": "limit"}`

**Superadmin (`admin_session` cookie, ayrı, sadə):**
14. `POST /api/admin/login` — body `{username, password}`; `.env`-dəki `ADMIN_USERNAME`/`ADMIN_PASSWORD` ilə düz müqayisə (bcrypt-siz, sadə sabit dəyər — bu daxili alət, ictimai qeydiyyat yoxdur)
15. `POST /api/admin/logout`
16. `GET /api/admin/products/pending` — `status='gozlemede'` olan bütün `user_products`
17. `POST /api/admin/products/{id}/approve` — `status='saytda'`-ya keçirir, `expires_at = now() + 30 gün` təyin edir
18. `POST /api/admin/products/{id}/reject` — `status='legv_edilib'`-ə keçirir
19. `GET /api/admin/shop-products` — bütün `shop_products` (statusundan asılı olmayaraq, bütün mağazalar üzrə) — superadmin baxış üçün
20. `POST /api/admin/shop-products/{id}/cancel` — mövcud `shop.Repository.DeleteProduct` (soft-delete) çağırır, mağaza sahibinin özünün "Sil" düyməsi ilə eyni əməliyyat — superadmin ownership yoxlaması olmadan istənilən mağazanın istənilən elanını ləğv edə bilər

**Mağaza tərəfi — eyni 5 imkan (`shop_session` cookie, mövcud domenə əlavələr):**
21. `PUT /api/shops/me/profile` — body `{title, details, workTimes}` (mövcud `Shop` strukturunun redaktə edilə bilən sahələri)
22. `GET /api/shops/me/stats` — eyni forma: `{byStatus: {saytda, legv_edilib, muddeti_basa_catmis}, products: [{id, title, status, viewCount, contactCount, expiresAt, daysRemaining}]}`
23. `GET /api/shops/me/cards`, `POST /api/shops/me/cards`, `PUT /api/shops/me/cards/{id}`, `DELETE /api/shops/me/cards/{id}` — eyni struktur, `shop_cards` cədvəlinə
24. `POST /api/shops/me/balance/topup` — body `{amount}`, mock, eyni struktur
25. Yeni məhsul yaradanda (`POST /me/products`) aktiv (`saytda`) elan sayı `.env`-dəki `SHOP_ACTIVE_LISTING_LIMIT`-i keçərsə → 403 `{"error": "limit"}`

**Açıq bazar lenti:**
26. `GET /api/listings` — autentifikasiyasız, `user_products` (status='saytda') və `shop_products` (status='saytda') birləşdirilmiş siyahısı, hər elementdə mənbəni ayırd etmək üçün bir sahə (məs. `source: 'user' | 'shop'`)
27. `GET /api/listings/{source}/{id}` — ictimai, tək-elan görünüşü, çağırıldıqda müvafiq cədvəldə `view_count++`
28. `POST /api/listings/{source}/{id}/contact` — ictimai, "Əlaqə" düyməsi basılanda çağırılır, `contact_count++`

### Go strukturu

- `internal/user/model.go` — `User{ID, Name, Phone, Balance}`, `UserProduct{ID, UserID, Marka, Model, Il, Qiymet, Yurus, Yanacaq, Ban, Title, Details, Status, ExpiresAt, ViewCount, ContactCount, Images []UserProductImage}`, `UserProductImage{ID, MinioURL, S3URL, Sira}`, `CreateUserProductInput`, `UserCard{ID, Last4, Expiry, HolderName}`
- `internal/user/repository.go` — `Repository` interfeysi: `FindOrCreateByPhone`, `ListMyProducts(userID)`, `ListPublicProducts` (yalnız saytda), `CreateProduct` (aktiv-limit yoxlaması ilə), `UpdateProduct` (status-preserving/reset məntiqi ilə), `DeleteProduct` (soft), `GetProductUserID`, `AddProductImage`, `IncrementViewCount`, `IncrementContactCount`, `UpdateProfile`, `GetStats(userID)`, `ListCards`, `AddCard`, `UpdateCard`, `DeleteCard`, `TopUpBalance`, `ExpireOverdueProducts(ctx) error` (background ticker-in çağırdığı, yuxarıdakı `UPDATE` sorğusunu icra edən metod)
- `internal/user/session.go` — mövcud `auth.SessionStore`-un eyni forması, `user_session` cədvəlinə yazır
- `internal/user/handler.go` — `userHandlers` struct, adlandırılmış metodlar: `RequestOTP`, `VerifyOTP`, `Logout`, `MeProducts`, `CreateProduct`, `UpdateProduct`, `DeleteProduct`, `UploadProductImages`, `UpdateProfile`, `MeStats`, `ListCards`, `AddCard`, `UpdateCard`, `DeleteCard`, `TopUpBalance` — ownership-check nümunəsi `shop.UploadProductImages`-dəki ilə eyni struktur
- `internal/shop/` (mövcud) — `Repository` interfeysinə eyni əlavələr: `UpdateProfile`, `GetStats`, `ListCards`, `AddCard`, `UpdateCard`, `DeleteCard`, `TopUpBalance`, `IncrementViewCount`, `IncrementContactCount`, `ExpireOverdueProducts(ctx) error`; `authHandlers`-ə (mövcud `internal/auth/handler.go`) paralel adlandırılmış metodlar əlavə olunur: `UpdateProfile`, `MeStats`, `ListCards`, `AddCard`, `UpdateCard`, `DeleteCard`, `TopUpBalance`
- `internal/admin/handler.go` — `adminHandlers` struct, adlandırılmış metodlar: `Login`, `Logout`, `PendingProducts`, `ApproveProduct`, `RejectProduct`, `ListShopProducts`, `CancelShopProduct` — sadə env-based müqayisə, ownership-check yoxdur (superadmin hər şeyi görür/idarə edir). `adminHandlers` struct-ı `user.Repository`-dən əlavə `shop.Repository`-ni də alır (`ListShopProducts` mövcud `shop.Repository`-nin bütün mağazalar üzrə status-filtrsiz bir siyahılama metodunu — yeni `ListAllProducts(ctx) ([]Product, error)` — çağırır; `CancelShopProduct` mövcud `shop.Repository.DeleteProduct(ctx, productID)`-i birbaşa çağırır, heç bir yeni mağaza-tərəfli kod yazılmır)
- `internal/listings/` (yeni, kiçik) — yalnız ictimai birləşdirilmiş lent üçün: `handler.go` ilə `GET /api/listings`, `GET /api/listings/{source}/{id}`, `POST /api/listings/{source}/{id}/contact` — `source` parametrinə görə ya `user.Repository`, ya `shop.Repository`-ni çağırır

`cmd/server/main.go`-a bu yeni handler-lərin route-ları əlavə olunur, mövcud `storage.Client` instance (dual MinIO+S3) `internal/user`-ə də ötürülür, mövcud `shop.Repository` instance-ı isə `internal/admin` və `internal/listings`-ə də ötürülür. Server başlayanda iki `ExpireOverdueProducts` çağırışını (user + shop) hər `EXPIRY_CHECK_INTERVAL` (default 5 dəqiqə) bir dəfə icra edən bir background goroutine işə salınır, `context.Context` vasitəsilə server `Shutdown`-u ilə düzgün dayandırılır.

## Frontend

**İstifadəçi tərəfi:**
- `src/api/auth.ts`: `requestOtp`, `verifyOtp`, `logout`, `getMyListings`, `createListing`, `updateListing`, `deleteListing`, `updateProfile`, `getMyStats`, `getMyCards`, `addCard`, `updateCard`, `deleteCard`, `topUpBalance` — real `fetch` (`src/api/shop.ts` nümunəsi ilə eyni struktur, `credentials: 'include'`, GET-lərdə `cache: 'no-store'`)
- `Login.tsx` / `LoginVerify.tsx`: sahələr dəyişmir (fərdi tab: telefon+OTP), submit-lər real API-a bağlanır
- `NewListing.tsx`: `handleSubmit` real `createListing`/`updateListing` + (varsa) şəkil upload çağırır; limit aşılarsa (403) aydın xəta mesajı göstərir
- `KabinetElanlarim.tsx`: real `getMyListings()`-dən **5 tab** göstərilir ("Bütün elanlar" / "Saytda" / "Gözləmədə" / "Ləğv edilib" / "Müddəti başa çatmış" — mövcud `/magazam`-dakı tab modelinə bənzər), hər kartda baxış/əlaqə sayı və (saytda-dırsa) qalan gün sayı göstərilir
- **Yeni:** `KabinetProfil.tsx` — profil redaktə formu (mövcud "Profil" naviqasiya tab-ı, hazırda mock — real API-a keçirilir)
- **Yeni:** `KabinetStatistika.tsx` — status-üzrə saylıq kartları + elan-üzrə cədvəl (baxış/əlaqə/qalan gün)
- **Yeni:** `KabinetKartlarim.tsx` — kart siyahısı + əlavə/redaktə/sil formu (mövcud "Kartlarım" naviqasiya tab-ı, hazırda mock — real API-a keçirilir), balans göstəricisi + "Artır" formu

**Mağaza tərəfi — eyni struktur, `/magazam` altında:**
- `src/api/shop.ts`-ə paralel funksiyalar: `updateShopProfile`, `getShopStats`, `getShopCards`, `addShopCard`, `updateShopCard`, `deleteShopCard`, `topUpShopBalance`
- `MyShop.tsx`-ə yeni alt-naviqasiya/tab-lar: Profil, Statistika, Kartlar+Balans — istifadəçi tərəfindəki səhifələrlə eyni komponent strukturu, fərqli API çağırışları ilə

**Superadmin:**
- **Yeni: sadə superadmin panel** (`/admin`) — login formu + 2 bölmə/tab: (1) `gözləmədə` istifadəçi elanları + Təsdiqlə/Rədd Et düymələri, (2) bütün mağaza elanları (statusu ilə birlikdə göstərilir) + "Ləğv et" düyməsi hər elanın yanında

**Açıq bazar:**
- Açıq bazar lenti (`getListings()` istifadə edən yerlər) — yeni birləşdirilmiş `/api/listings` endpoint-inə keçir, tək-elan səhifəsi `GET /api/listings/{source}/{id}` çağırır (baxış sayğacı üçün), "Əlaqə" düyməsi `POST /api/listings/{source}/{id}/contact` çağırır

## Test və yoxlama

- Backend: `internal/user`, `internal/admin`, `internal/listings` üçün httptest (OTP uğurlu/səhv kod, ownership 404, status-keçid məntiqi — yarat→gözləmədə, admin-təsdiq→saytda+expires_at təyini, admin-rədd→legv_edilib, istifadəçi-redaktə-legv_edilib-üzərində→gözləmədə, superadmin-mağaza-ləğv→legv_edilib, `ExpireOverdueProducts`-un `saytda`+keçmiş-`expires_at`-i `muddeti_basa_catmis`-ə keçirdiyi, aktiv-limit aşılanda 403, kart CRUD-un ownership-check-i, balans artırmanın düzgün toplandığı)
- Frontend: `npx tsc -b --noEmit`, `npm run build`, korrupsiya scan
- Manual/live: bir dəfəlik test istifadəçisi (sınaq telefon nömrəsi) yaradıb real elan yarat (gözləmədə statusunda), superadmin kimi daxil olub təsdiqlə (saytda-ya keçdiyini yoxla), sonra istifadəçi kimi ləğv et (legv_edilib), sonra redaktə edib yenidən göndər (gözləmədə-yə qayıtdığını yoxla), profil yenilə, kart əlavə et, balans artır, statistika səhifəsində baxış/əlaqə saylarının göründüyünü yoxla — mövcud `avto444` mağaza datasına (10+ real məhsul) toxunmadan
