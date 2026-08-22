# AutoPulse Marketplace — Phase 1 (Backend + Vitrin) dizayn sənədi

**Tarix:** 2026-08-22
**Status:** Təsdiqlənib (istifadəçi tərəfindən), implementasiya planı gözlənilir

## Kontekst

AutoPulse (`autopulse.157.180.73.79.sslip.io`) — Turbo.az/Carvana-üslublu maşın elanları platformasıdır (mövcud, canlıda). İndi ona **mağaza** qatı əlavə olunur: hər avtosalon/dilerin öz mağazası olacaq (məs. `avto444`), və bunlar əsas AutoPulse saytının **öz daxilində**, yeni bir "Mağazalar" bölməsində göstəriləcək — subdomain YOXDUR, hər şey `autopulse.157.180.73.79.sslip.io` domeni altında qalır.

Bu sənəd yalnız **Faza 1**-i əhatə edir: minimal, işlək bir uçdan-uca zəncir (backend + DB + vitrin səhifələri + mağaza sahibinin sadə girişi). Məhsul əlavə/redaktə/silmə (CRUD) UI-si, ödəniş, sifariş axını — **hamısı sonrakı ayrı fazalardır və bu sənədin əhatəsi xaricindədir.**

## Miqyas (bu faza)

**Daxildir:**
- Yeni, müstəqil Go backend servisi (monolit, ayrıca repo)
- Yeni PostgreSQL verilənlər bazası + `avto444` schema-sı
- 4 REST API: 3 read-only (bütün mağazalar, mağaza məlumatı, mağazaya aid məhsullar) + 1 login (mağaza adı+parol)
- Migration/seed script-i ilə `avto444` mağazasının (parolu daxil) və bir neçə nümunə məhsulun avtomatik yaradılması
- Mövcud AutoPulse React tətbiqinə: yeni `/mağazalar` (mağaza siyahısı), `/mağazalar/:name` (tək mağaza vitrini), `/magaza-giris` (mağaza login formu) və `/magazam` (giriş etmiş mağaza sahibinin öz məhsullarını gördüyü səhifə) route-ları
- Server üzərində deploy (yeni Go binary, yeni Postgres DB, Caddy konfiqurasiyası)

**Xaricində (gələcək fazalar):**
- Məhsul əlavə/redaktə/silmə (CRUD) UI-si (mağaza sahibi bu fazada yalnız öz məhsullarını **görür**, dəyişə bilmir)
- Real, təhlükəsizlik-səviyyəli autentifikasiya (parol hashing/JWT-dən artıq mexanizm, refresh token və s.) — bu fazada sadə, minimal bir sessiya modeli kifayətdir
- Mağaza-səviyyəli icazə sistemi (rol/permission), çoxlu istifadəçi bir mağazaya bağlana bilməsi
- Sifariş, ödəniş, çat və s.
- Yeni mağaza yaratma axını (bu fazada yalnız `avto444` əl ilə/seed ilə yaradılır)
- Subdomain-based routing (bu fazada tamamilə çıxarıldı — mağazalar əsas domendə, öz route-larında göstərilir)

## Arxitektura

```
GitHub repo:  CavadJava/avtopulse-backend   (yeni, ayrıca repo)

  cmd/server/main.go        — HTTP server başlanğıcı, DB bağlantısı, router
  internal/shop/            — shop handler + repository (siyahı, by-name, login)
  internal/product/         — shop_products handler + repository
  internal/auth/            — sadə token yaratma/yoxlama (bcrypt parol + təsadüfi opaque token, DB-də saxlanılır)
  internal/db/              — pgx/sqlx bağlantı + migration runner
  migrations/               — schema DDL + avto444 seed (SQL fayllar, sıra nömrələnmiş)
  go.mod / go.sum

PostgreSQL:
  Database: avtopulse
  Schema:   avto444           (hər mağaza öz schema-sına sahib olacaq modeli — bu fazada təkcə avto444)
    shop             (id, name, customer_id, title, details, work_times, password_hash)
    shop_products    (id, name, title, details, shop_id → FK shop.id)
    shop_sessions    (token, shop_id → FK shop.id, created_at, expires_at)

Frontend (mövcud autopulse repo, dəyişiklik):
  src/api/shop.ts               — real HTTP fetch (getShops, getShopByName, getShopProducts, shopLogin)
  src/pages/shop/ShopList.tsx   — '/mağazalar' — bütün mağazaların siyahısı (kart görünüşü)
  src/pages/shop/ShopFront.tsx  — '/mağazalar/:name' — tək mağazanın vitrini (başlıq/təsvir/iş saatları + məhsul kartları)
  src/pages/shop/ShopLogin.tsx  — '/magaza-giris' — mağaza adı + parol formu
  src/pages/shop/MyShop.tsx     — '/magazam' — giriş etmiş mağazanın öz məhsul siyahısı (yalnız görmə)
  src/context/ShopAuthContext.tsx — token-i localStorage-da saxlayan sadə auth context (mövcud AuthContext-dən ayrı, istifadəçi login-inə qarışdırılmır)
  App.tsx-də: yeni 4 route əlavə olunur, header-ə 'Mağazalar' linki əlavə olunur
```

## API-lər (chi router, JSON, `internal/shop` + `internal/product` + `internal/auth`)

Tələbdə açıq deyilən "2 API" (mağaza məlumatı, mağazaya aid məhsullar) qorunur; `/mağazalar` siyahı səhifəsi üçün "bütün mağazalar" endpoint-i, mağaza sahibinin girişi üçün isə bir login endpoint-i əlavə olunur:

1. **`GET /api/shops`** — açıq, autentifikasiyasız
   Cavab: `[{ id, name, title }]` — "Mağazalar" siyahı səhifəsi üçün yığcam siyahı (bu fazada cəmi `avto444` qayıdacaq).

2. **`GET /api/shops/by-name/{name}`** — açıq, autentifikasiyasız
   Cavab: `{ id, name, title, details, workTimes }`
   404 əgər həmin adda mağaza yoxdursa.

3. **`GET /api/shops/{shopId}/products`** — açıq, autentifikasiyasız
   Cavab: `[{ id, name, title, details }]` (shop_id cavabda təkrarlanmır, artıq path-də var)
   Boş array əgər mağazanın məhsulu yoxdursa; 404 əgər `shopId` özü mövcud deyilsə.

4. **`POST /api/shops/login`** — mağaza adı + parol
   Body: `{ name, password }`
   Cavab (200): `{ token, shop: { id, name, title } }` — `token` `shop_sessions`-da saxlanılan opaque random string.
   401 əgər ad/parol yanlışdırsa.

5. **`GET /api/shops/me/products`** — `Authorization: Bearer {token}` başlığı tələb edir
   Token `shop_sessions`-da tapılır → `shop_id` müəyyənləşir → o mağazanın məhsulları qaytarılır (məzmunca 3-cü endpoint-lə eynidir, sadəcə şəxsiyyət token-dən gəlir, URL-dəki `shopId`-dən yox).
   401 əgər token yoxdursa/etibarsızdırsa/vaxtı keçibsə.

1-3 açıq və autentifikasiyasızdır (mövcud vitrin üçün); 4-5 mağaza sahibinin öz girişi üçündür.

## Verilənlər bazası

```sql
-- schema: avto444
CREATE TABLE shop (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT UNIQUE NOT NULL,   -- mağaza slug-u, məs. 'avto444' (URL-də /mağazalar/avto444), həm də login adı
  customer_id    BIGINT NOT NULL,
  title          TEXT NOT NULL,
  details        TEXT,
  work_times     TEXT,
  password_hash  TEXT NOT NULL           -- bcrypt hash, açıq mətn parol heç vaxt saxlanılmır
);

CREATE TABLE shop_products (
  id       BIGSERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  title    TEXT NOT NULL,
  details  TEXT,
  shop_id  BIGINT NOT NULL REFERENCES shop(id)
);

CREATE TABLE shop_sessions (
  token       TEXT PRIMARY KEY,   -- kriptoqrafik təsadüfi (crypto/rand) opaque string
  shop_id     BIGINT NOT NULL REFERENCES shop(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL       -- məs. created_at + 7 gün
);
```

Seed migration `avto444` sətrini (bilinən bir test parolunun bcrypt hash-i ilə) və 3-4 nümunə məhsulu yaradır ki, vitrin səhifəsi və login axını ilk gündən test edilə bilsin.

## Frontend inteqrasiyası

- `/mağazalar` — `getShops()` çağırır, qayıdan siyahını kart grid şəklində göstərir (hər kartda mağaza adı/başlığı, klikləyəndə `/mağazalar/:name`-ə keçir).
- `/mağazalar/:name` — `getShopByName(name)` ilə mağaza məlumatını, sonra `getShopProducts(shop.id)` ilə məhsul siyahısını gətirir; başlıq/təsvir/iş saatları + məhsul kartları göstərilir.
- `/magaza-giris` — sadə form (mağaza adı + parol) → `shopLogin(name, password)` çağırır, uğurlu olarsa qayıdan `token`-i `ShopAuthContext` `localStorage`-a yazır və `/magazam`-a yönləndirir; 401-də "ad və ya parol yanlışdır" mesajı göstərir.
- `/magazam` — `ShopAuthContext`-dən token yoxdursa `/magaza-giris`-ə yönləndirir; token varsa `getMyShopProducts(token)` çağırıb nəticəni siyahı şəklində göstərir (yalnız görmə — əlavə/redaktə/sil düyməsi yoxdur).
- `ShopAuthContext` mövcud `AuthContext` (adi istifadəçi login-i) ilə **qarışdırılmır** — ayrı, paralel, öz `localStorage` açarına (`autopulse.shopToken`) yazan kontekstdir.
- Bu, mövcud mock-data-based marketplace kodundan **tamamilə ayrı, paralel bir qatdır** — mövcud `/elanlar`, `/elan-ver` və s. heç bir şəkildə toxunulmur; yalnız header-ə "Mağazalar" adlı yeni bir naviqasiya linki əlavə olunur.
- Backend base URL frontend-də env dəyişəni ilə konfiqurasiya olunur (məs. `VITE_AVTOPULSE_API_BASE`), local dev-də `localhost:PORT`-a, produksiyada real backend origininə işarə edəcək.

## Deploy

- Server: mövcud 157.180.73.79 (eyni server, `youtube-remote-webrtc_ed25519` SSH açarı ilə)
- Yeni Go binary `avtopulse-backend` sistemd/systemctl altında işə salınacaq (dəqiq port implementasiya zamanı seçiləcək)
- Yeni Postgres DB: `avtopulse` (mövcud Postgres instansında yeni database, java-distribution-workspace-in Postgres-i ilə paylaşılmır — ayrıca yoxlanılacaq)
- Caddy: subdomain dəyişikliyi yoxdur — mövcud `autopulse.157.180.73.79.sslip.io` konfiqurasiyasına sadəcə `/api/*` (və ya ayrıca sub-path) → yeni Go backend-ə proxy qaydası əlavə olunur

## Test və yoxlama

- Backend: `go test ./...` (handler-lər üçün httptest, repository üçün real Postgres-ə qarşı ya da bir test schema-sı; login üçün həm düzgün, həm yanlış parol ssenarisi, token vaxtının keçməsi ssenarisi)
- Manual: `curl` ilə bütün 5 endpoint-in düzgün JSON/status kod qaytardığının yoxlanması (login → token al → həmin token-lə `/api/shops/me/products` çağır)
- Frontend: `autopulse.157.180.73.79.sslip.io/mağazalar`, `/mağazalar/avto444`, `/magaza-giris` (düzgün+yanlış parol) və giriş edildikdən sonra `/magazam`-ın real domendə düzgün işlədiyinin doğrulanması
