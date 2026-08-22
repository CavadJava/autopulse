# AutoPulse Marketplace — Phase 1 (Backend + Vitrin) dizayn sənədi

**Tarix:** 2026-08-22
**Status:** Təsdiqlənib (istifadəçi tərəfindən), implementasiya planı gözlənilir

## Kontekst

AutoPulse (`autopulse.157.180.73.79.sslip.io`) — Turbo.az/Carvana-üslublu maşın elanları platformasıdır (mövcud, canlıda). İndi ona **mağaza** qatı əlavə olunur: hər avtosalon/dilerin öz mağazası olacaq (məs. `avto444`), və bunlar əsas AutoPulse saytının **öz daxilində**, yeni bir "Mağazalar" bölməsində göstəriləcək — subdomain YOXDUR, hər şey `autopulse.157.180.73.79.sslip.io` domeni altında qalır.

Bu sənəd yalnız **Faza 1**-i əhatə edir: minimal, işlək bir uçdan-uca zəncir (backend + DB + vitrin səhifələri). Mağaza sahibi üçün giriş/admin/CRUD UI-si, autentifikasiya, ödəniş, sifariş axını — **hamısı sonrakı ayrı fazalardır və bu sənədin əhatəsi xaricindədir.**

## Miqyas (bu faza)

**Daxildir:**
- Yeni, müstəqil Go backend servisi (monolit, ayrıca repo)
- Yeni PostgreSQL verilənlər bazası + `avto444` schema-sı
- 3 read-only REST API (bütün mağazalar, mağaza məlumatı, mağazaya aid məhsullar)
- Migration/seed script-i ilə `avto444` mağazasının və bir neçə nümunə məhsulun avtomatik yaradılması
- Mövcud AutoPulse React tətbiqinə: yeni `/mağazalar` (mağaza siyahısı) və `/mağazalar/:name` (tək mağaza vitrini) route-ları
- Server üzərində deploy (yeni Go binary, yeni Postgres DB, Caddy konfiqurasiyası)

**Xaricində (gələcək fazalar):**
- Mağaza sahibi login/admin paneli
- Məhsul əlavə/redaktə/silmə (CRUD) UI-si
- Mağaza-səviyyəli autentifikasiya/icazələr
- Sifariş, ödəniş, çat və s.
- Yeni mağaza yaratma axını (bu fazada yalnız `avto444` əl ilə/seed ilə yaradılır)
- Subdomain-based routing (bu fazada tamamilə çıxarıldı — mağazalar əsas domendə, öz route-larında göstərilir)

## Arxitektura

```
GitHub repo:  CavadJava/avtopulse-backend   (yeni, ayrıca repo)

  cmd/server/main.go        — HTTP server başlanğıcı, DB bağlantısı, router
  internal/shop/            — shop handler + repository
  internal/product/         — shop_products handler + repository
  internal/db/              — pgx/sqlx bağlantı + migration runner
  migrations/               — schema DDL + avto444 seed (SQL fayllar, sıra nömrələnmiş)
  go.mod / go.sum

PostgreSQL:
  Database: avtopulse
  Schema:   avto444           (hər mağaza öz schema-sına sahib olacaq modeli — bu fazada təkcə avto444)
    shop            (id, name, customer_id, title, details, work_times)
    shop_products   (id, name, title, details, shop_id → FK shop.id)

Frontend (mövcud autopulse repo, dəyişiklik):
  src/api/shop.ts               — real HTTP fetch, 3 funksiya (mövcud mock API-lərdən fərqli qat)
  src/pages/shop/ShopList.tsx   — '/mağazalar' — bütün mağazaların siyahısı (kart görünüşü)
  src/pages/shop/ShopFront.tsx  — '/mağazalar/:name' — tək mağazanın vitrini (başlıq/təsvir/iş saatları + məhsul kartları)
  App.tsx-də: yeni 2 route əlavə olunur, header-ə 'Mağazalar' linki əlavə olunur
```

## API-lər (chi router, JSON, `internal/shop` + `internal/product`)

Tələbdə açıq deyilən "2 API" — mağaza məlumatı və mağazaya aid məhsullar — qorunur; `/mağazalar` siyahı səhifəsi üçün üçüncü, kiçik bir "bütün mağazalar" endpoint-i əlavə olunur (bunsuz siyahı səhifəsi işləyə bilməz):

1. **`GET /api/shops`**
   Cavab: `[{ id, name, title }]` — "Mağazalar" siyahı səhifəsi üçün yığcam siyahı (bu fazada cəmi `avto444` qayıdacaq).

2. **`GET /api/shops/by-name/{name}`**
   Cavab: `{ id, name, title, details, workTimes }`
   404 əgər həmin adda mağaza yoxdursa.

3. **`GET /api/shops/{shopId}/products`**
   Cavab: `[{ id, name, title, details }]` (shop_id cavabda təkrarlanmır, artıq path-də var)
   Boş array əgər mağazanın məhsulu yoxdursa; 404 əgər `shopId` özü mövcud deyilsə.

Hamısı bu fazada autentifikasiyasız, yalnız oxu üçündür.

## Verilənlər bazası

```sql
-- schema: avto444
CREATE TABLE shop (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT UNIQUE NOT NULL,   -- mağaza slug-u, məs. 'avto444' (URL-də /mağazalar/avto444)
  customer_id  BIGINT NOT NULL,
  title        TEXT NOT NULL,
  details      TEXT,
  work_times   TEXT
);

CREATE TABLE shop_products (
  id       BIGSERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  title    TEXT NOT NULL,
  details  TEXT,
  shop_id  BIGINT NOT NULL REFERENCES shop(id)
);
```

Seed migration `avto444` sətrini və 3-4 nümunə məhsulu yaradır ki, vitrin səhifəsi ilk gündən boş görünməsin.

## Frontend inteqrasiyası

- `/mağazalar` — `getShops()` çağırır, qayıdan siyahını kart grid şəklində göstərir (hər kartda mağaza adı/başlığı, klikləyəndə `/mağazalar/:name`-ə keçir).
- `/mağazalar/:name` — `getShopByName(name)` ilə mağaza məlumatını, sonra `getShopProducts(shop.id)` ilə məhsul siyahısını gətirir; başlıq/təsvir/iş saatları + məhsul kartları göstərilir.
- Bu, mövcud mock-data-based marketplace kodundan **tamamilə ayrı, paralel bir qatdır** — mövcud `/elanlar`, `/elan-ver` və s. heç bir şəkildə toxunulmur; yalnız header-ə "Mağazalar" adlı yeni bir naviqasiya linki əlavə olunur.
- Backend base URL frontend-də env dəyişəni ilə konfiqurasiya olunur (məs. `VITE_AVTOPULSE_API_BASE`), local dev-də `localhost:PORT`-a, produksiyada real backend origininə işarə edəcək.

## Deploy

- Server: mövcud 157.180.73.79 (eyni server, `youtube-remote-webrtc_ed25519` SSH açarı ilə)
- Yeni Go binary `avtopulse-backend` sistemd/systemctl altında işə salınacaq (dəqiq port implementasiya zamanı seçiləcək)
- Yeni Postgres DB: `avtopulse` (mövcud Postgres instansında yeni database, java-distribution-workspace-in Postgres-i ilə paylaşılmır — ayrıca yoxlanılacaq)
- Caddy: subdomain dəyişikliyi yoxdur — mövcud `autopulse.157.180.73.79.sslip.io` konfiqurasiyasına sadəcə `/api/*` (və ya ayrıca sub-path) → yeni Go backend-ə proxy qaydası əlavə olunur

## Test və yoxlama

- Backend: `go test ./...` (handler-lər üçün httptest, repository üçün real Postgres-ə qarşı ya da bir test schema-sı)
- Manual: `curl` ilə hər üç endpoint-in düzgün JSON qaytardığının yoxlanması
- Frontend: `autopulse.157.180.73.79.sslip.io/mağazalar` və `/mağazalar/avto444` real domendə açılıb mağaza siyahısının və vitrininin göründüyünün doğrulanması
