# AutoPulse Marketplace — Phase 1 (Backend + Vitrin) dizayn sənədi

**Tarix:** 2026-08-22
**Status:** Təsdiqlənib (istifadəçi tərəfindən), implementasiya planı gözlənilir

## Kontekst

AutoPulse (`autopulse.157.180.73.79.sslip.io`) — Turbo.az/Carvana-üslublu maşın elanları platformasıdır (mövcud, canlıda). İndi ona **çoxarendarlı (multi-tenant) mağaza** qatı əlavə olunur: hər avtosalon/dilerdə öz alt-domeni (subdomain) olacaq, məsələn `avto444.157.180.73.79.sslip.io`, və orada həmin mağazanın öz məhsul/elan siyahısı görünəcək.

Bu sənəd yalnız **Faza 1**-i əhatə edir: minimal, işlək bir uçdan-uca zəncir (backend + DB + vitrin səhifəsi). Mağaza sahibi üçün giriş/admin/CRUD UI-si, autentifikasiya, ödəniş, sifariş axını — **hamısı sonrakı ayrı fazalardır və bu sənədin əhatəsi xaricindədir.**

## Miqyas (bu faza)

**Daxildir:**
- Yeni, müstəqil Go backend servisi (monolit, ayrıca repo)
- Yeni PostgreSQL verilənlər bazası + `avto444` schema-sı
- 2 read-only REST API (mağaza məlumatı, mağazaya aid məhsullar)
- Migration/seed script-i ilə `avto444` mağazasının və bir neçə nümunə məhsulun avtomatik yaradılması
- Mövcud AutoPulse React tətbiqinə: subdomain-i oxuyub mağaza vitrini render edən yeni bir route/səhifə
- Server üzərində deploy (yeni Go binary, yeni Postgres DB, Caddy konfiqurasiyası)

**Xaricində (gələcək fazalar):**
- Mağaza sahibi login/admin paneli
- Məhsul əlavə/redaktə/silmə (CRUD) UI-si
- Mağaza-səviyyəli autentifikasiya/icazələr
- Sifariş, ödəniş, çat və s.
- Yeni mağaza yaratma axını (bu fazada yalnız `avto444` əl ilə/seed ilə yaradılır)

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
  src/api/shop.ts            — real HTTP fetch, 2 funksiya (mövcud mock API-lərdən fərqli qat)
  src/pages/shop/ShopFront.tsx — yeni vitrin səhifəsi
  App.tsx-də: subdomain aşkarlanması (window.location.hostname-dən 'avto444' çıxarılır) →
              subdomain varsa ShopFront render olunur, yoxdursa mövcud əsas marketplace UI-si davam edir
```

## API-lər (chi router, JSON, `internal/shop` + `internal/product`)

1. **`GET /api/shops/by-name/{name}`**
   Cavab: `{ id, name, title, details, workTimes }`
   404 əgər həmin adda mağaza yoxdursa.

2. **`GET /api/shops/{shopId}/products`**
   Cavab: `[{ id, name, title, details }]` (shop_id cavabda təkrarlanmır, artıq path-də var)
   Boş array əgər mağazanın məhsulu yoxdursa; 404 əgər `shopId` özü mövcud deyilsə.

Hər ikisi bu fazada autentifikasiyasız, yalnız oxu üçündür.

## Verilənlər bazası

```sql
-- schema: avto444
CREATE TABLE shop (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT UNIQUE NOT NULL,   -- subdomain slug, məs. 'avto444'
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

- Subdomain aşkarlanması: `window.location.hostname.split('.')[0]` — əgər bu `autopulse`-dan fərqlidirsə (yəni `avto444` kimi bir şeydirsə), tətbiq mağaza rejiminə keçir.
- Mağaza rejimində: `src/api/shop.ts`-dəki `getShopByName(name)` və `getShopProducts(shopId)` çağırılır, nəticə `ShopFront.tsx`-də göstərilir (mağaza başlığı, təsviri, iş saatları, məhsul kartları siyahısı).
- Bu, mövcud mock-data-based marketplace kodundan **tamamilə ayrı, paralel bir qatdır** — mövcud `/elanlar`, `/elan-ver` və s. heç bir şəkildə toxunulmur.
- Backend base URL frontend-də env dəyişəni ilə konfiqurasiya olunur (məs. `VITE_AVTOPULSE_API_BASE`), local dev-də `localhost:PORT`-a, produksiyada real backend origininə işarə edəcək.

## Deploy

- Server: mövcud 157.180.73.79 (eyni server, `youtube-remote-webrtc_ed25519` SSH açarı ilə)
- Yeni Go binary `avtopulse-backend` sistemd/systemctl altında işə salınacaq (dəqiq port implementasiya zamanı seçiləcək)
- Yeni Postgres DB: `avtopulse` (mövcud Postgres instansında yeni database, java-distribution-workspace-in Postgres-i ilə paylaşılmır — ayrıca yoxlanılacaq)
- Caddy: `avto444.157.180.73.79.sslip.io` → mövcud AutoPulse frontend-inin eyni statik build-inə işarə edir (subdomain-fərqləndirmə JS-də olur, Caddy səviyyəsində deyil); `/api/*` (və ya ayrıca sub-path) → yeni Go backend-ə proxy

## Test və yoxlama

- Backend: `go test ./...` (handler-lər üçün httptest, repository üçün real Postgres-ə qarşı ya da bir test schema-sı)
- Manual: `curl` ilə hər iki endpoint-in düzgün JSON qaytardığının yoxlanması
- Frontend: `avto444.157.180.73.79.sslip.io` real domendə açılıb mağaza vitrininin göründüyünün doğrulanması
