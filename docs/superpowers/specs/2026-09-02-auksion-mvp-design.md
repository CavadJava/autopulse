# AutoPulse Auksion — MVP Design

## Məqsəd

carsandbids.com-un UX-ini (baxış + canlı hərraj) referans alaraq, AutoPulse repo-su daxilində **AutoPulse Auksion** adlı, öz frontend tətbiqi olan, amma mövcud `avtopulse-backend` üzərində qurulan bir hərraj (auction/bidding) saytı qurmaq. Bu MVP yalnız **nəzər salma + canlı bidding çəkirdəyinə** fokuslanır; digər Cars & Bids xüsusiyyətləri (Watch List, Collections, Events, FAQ, USDC ödənişi, açıq satıcı təqdimetmə forması, şərhlər) qəsdən kənarda saxlanılır (bax "Bu fazadan kənarda qalanlar").

## Kontekst

- `carsandbids/` qovluğunda (untracked, `me-github/autopulse` reposunda) carsandbids.com-dan saxlanmış tam səhifə HTML-lər var (ana səhifə, bir elan detalı, Collections, Events, Watch List, FAQ, USDC səhifəsi). Bunlar **yalnız dizayn/UX referansı** kimi istifadə olunur — heç bir məzmun (şəkil/təsvir/qiymət) koddan çıxarılıb seed data kimi istifadə edilmir (mənbə/hüquq məsələsi nəzərə alınmadan).
- AutoPulse hazırda fiqe qiymətli maşın marketplace-dir (`Listings`, `NewListing`, `Compare`, `CheckoutPage` və s.) — hərraj/bidding funksiyası yoxdur.
- `auto-parts` presedenti: AutoPulse-un rebrand-lanmış kopyası olaraq tam ayrı repo/backend/DB ilə qurulmuşdu. Auksion üçün bu yanaşma **qəsdən seçilmədi** — bax "Arxitektura qərarı".

## Arxitektura qərarı

**Backend və DB ayrıca deyil.** İki seçim müzakirə olundu:

- A — Tam ayrı kopya (auto-parts kimi): öz Go module, öz binary, öz DB.
- B — Mövcud `avtopulse-backend` üzərində yeni paket/schema (seçilən).

B seçildi: yeni `internal/auksion/` Go paketi mövcud `avtopulse-backend` binary-sinə daxil olur (`cmd/server/main.go`-da `r.Mount("/api/auksion", auksion.NewHandler(...))`), eyni port (8090), eyni systemd service (`avtopulse-backend`), eyni deploy prosesi (`deploy/deploy.sh`). Bu, artıq mövcud domen-paket konvensiyasına (`internal/listings`, `internal/parts`, `internal/shop`, `internal/user`, `internal/chat`, `internal/admin`) tam uyğundur.

**DB ayrıca deyil, schema ayrıcadır.** avtopulse-backend artıq öz cədvəllərini `avto444` Postgres schema-sında saxlayır (flat `public` deyil). Auksion üçün yeni `auksion` schema-sı əlavə olunur — eyni `avtopulse` bazasında, eyni connection pool, sadəcə məntiqi olaraq ayrı schema-da. Əlavə DSN/tunnel/credential lazım deyil; mövcud DataGrip connection-dan yeni cədvəllər görünəcək.

**Frontend ayrıcadır.** `auksion/` (əvvəlki `carsandbids/`, referans HTML-lər `auksion/reference/`-ə daşınıb) tam müstəqil bir React/TS (Vite) tətbiqi kimi qurulur — öz `package.json`, öz route-ları, "AutoPulse Auksion" brendi ilə. Amma **backend çağırışları eyni `avtopulse-backend`-in `/api/auksion/*` endpoint-lərinədir** — ayrı backend deploy/DB idarəetməsi yoxdur. Local dev-də vite proxy `localhost:8090`-a yönəlir (autopulse frontend-in etdiyi kimi).

## Data modeli

Yeni migrasiya `avtopulse-backend/migrations/0015_auksion.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS auksion;

CREATE TABLE auksion.listings (
    id              BIGSERIAL PRIMARY KEY,
    -- mövcud NewListing sahələrinə bənzər əsas maşın məlumatı
    make            TEXT NOT NULL,
    model           TEXT NOT NULL,
    year            INT NOT NULL,
    description     TEXT,
    images          JSONB NOT NULL DEFAULT '[]',
    -- hərraj-spesifik sahələr
    starting_bid    NUMERIC(12,2) NOT NULL,
    current_bid     NUMERIC(12,2),          -- ilk bid-ə qədər NULL
    bid_count       INT NOT NULL DEFAULT 0,
    end_time        TIMESTAMPTZ NOT NULL,
    status          TEXT NOT NULL DEFAULT 'live',  -- live | ended
    created_by_admin_id BIGINT,             -- bu fazada yalnız admin yaradır
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auksion.bids (
    id              BIGSERIAL PRIMARY KEY,
    listing_id      BIGINT NOT NULL REFERENCES auksion.listings(id),
    bidder_user_id  BIGINT NOT NULL REFERENCES avto444."user"(id),
    amount          NUMERIC(12,2) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON auksion.bids (listing_id, created_at DESC);
```

Qeydlər:
- **Reserve price YOXDUR.** Hər hərraj "no reserve" sayılır — bitmə vaxtında ən yüksək bid avtomatik qalib olur. Seller accept/decline axını sonrakı fazaya qalır.
- **Minimum artım:** MVP-də sabit qayda (məs. +100 AZN), tier-based artımlar (Cars & Bids-dəki kimi qiymət diapazonuna görə dəyişən) sonrakı fazaya.
- **Son-dəqiqə uzatma (soft close):** son 2 dəqiqədə bid gələrsə, `end_time` avtomatik 2 dəqiqə uzadılır. Bu, bid yerləşdirmə tranzaksiyası daxilində serverdə hesablanır (client-side deyil).
- **Valyuta:** AZN, mövcud AutoPulse konvensiyasına uyğun (Cars & Bids USD istifadə etsə də).
- Yalnız `avto444."user"` (OTP-based fərdi istifadəçilər) bid verə bilər — mağazalar/dealer-lər bu fazada yalnız satıcı tərəfdə deyil, ümumiyyətlə iştirak etmir (elanları admin yaradır).

## Backend API (`internal/auksion/`)

- `GET /api/auksion/listings` — aktiv (`status=live`) hərrajlar grid üçün (thumbnail, cari bid, `end_time`).
- `GET /api/auksion/listings/{id}` — detal: bütün maşın məlumatı + cari bid + son N bid (bid tarixçəsi) + `end_time`. Frontend bunu polling ilə çağırır.
- `POST /api/auksion/listings/{id}/bids` — login (`avto444."user"` sessiyası) tələb olunur. Body: `{amount}`. Validasiya: `amount >= current_bid (və ya starting_bid) + minimum artım`, `status = 'live'`, `end_time` keçməyib. Bir DB tranzaksiyası daxilində sətir kilidi (`SELECT ... FOR UPDATE`) ilə `current_bid`/`bid_count` yenilənir və lazım gələrsə `end_time` uzadılır — paralel bid race-condition-dan qorunmaq üçün.
- Admin (mövcud `/api/admin/...` altında və ya yeni `/api/auksion/admin/listings`): hərraj elanı yaratma — `starting_bid`, `end_time` daxil, mövcud `NewListing` axınına bənzər sahələrlə. **Açıq satıcı təqdimetmə forması bu fazada yoxdur.**

## Frontend (`auksion/`)

- **Ana səhifə:** aktiv hərrajlar grid-i (mövcud `ListingGrid`/`ListingCard`-a bənzər struktur, cari qiymət + geri sayma badge ilə).
- **Elan detalı:** şəkil qalereyası + təsvir (mövcud `ListingDetail`-ə bənzər) + yeni **Bid Box** komponenti:
  - cari qiymət, canlı geri sayma taymer (`end_time`-dan client-side hesablanır, hər saniyə yenilənir)
  - "Bid ver" forması (minimum icazəli məbləğ göstərilir)
  - bid tarixçəsi siyahısı (istifadəçi adı gizlədilə bilər/qismən maskalana bilər, məs. "user***")
- **Canlı yeniləmə:** polling — səhifə açıq olduğu müddətdə hər 3-5 saniyədə bir `GET /api/auksion/listings/{id}` çağırılır, cari qiymət/bid sayı/`end_time` yenilənir. WebSocket YOXDUR.
- **Auth:** mövcud AutoPulse OTP-based istifadəçi login axını təkrar istifadə olunur (eyni `avto444.user` sessiya mexanizmi, eyni backend-dən).

## Bu fazadan kənarda qalanlar

Watch List, Collections, Events, FAQ, USDC ödənişi, açıq şərhlər/Q&A, açıq satıcı təqdimetmə forması, reserve-price/accept-decline axını, tier-based bid artımları, WebSocket, deploy/domain konfiqurasiyası (Caddy/DNS).

## Test

Mövcud AutoPulse konvensiyasına uyğun:
- Frontend: `BidBox`/`CountdownTimer` üçün Vitest komponent testləri (mövcud `Parts.test.tsx`, `Header.test.tsx`, `ModelTabs.test.tsx` nümunəsi ilə).
- Backend: `internal/auksion` üçün Go testləri, xüsusilə paralel bid tranzaksiya/race-condition ssenarisi. Postgres inteqrasiya testləri `-p 1` ilə işlədilməlidir (auto-parts-da tapılan paralel-paket DB paylaşımı gotcha-sı bura da aiddir).
