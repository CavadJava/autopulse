# AutoPulse — Mağaza Qeydiyyatı + Email/Parol Girişi dizayn sənədi

**Tarix:** 2026-08-23
**Status:** Təsdiqlənib (istifadəçi tərəfindən), implementasiya planı gözlənilir

## Kontekst

Hazırda mağaza (`shop`) hesabları yalnız birbaşa DB-yə SQL insert ilə yaradılır (məs. `avto444` seed migrasiyada) — heç bir ictimai qeydiyyat forması/endpoint-i yoxdur. Giriş isə `name` (mağaza adı) + `password` ilə işləyir, `email` sütunu ümumiyyətlə mövcud deyil.

İstifadəçi indi bunu istəyir: (1) istənilən kəs yeni mağaza hesabı yarada bilsin (ictimai qeydiyyat), (2) giriş email+parol ilə olsun (mağaza adı ilə yox).

## Miqyas

**Daxildir:**
- `avto444.shop` cədvəlinə yeni `email TEXT UNIQUE` sütunu
- Yeni ictimai qeydiyyat endpoint-i: `POST /api/shops/register` — body `{name, title, email, password}`, yeni mağaza hesabı yaradır, avtomatik giriş edir (sessiya cookie qoyulur)
- Giriş dəyişikliyi: `POST /api/shops/login` artıq `{email, password}` qəbul edir (`{name, password}` əvəzinə) — **breaking change**, mövcud `name`-based giriş sistemi tamamilə əvəz olunur
- Yeni frontend səhifəsi: `/magaza-qeydiyyat` — mağaza adı, başlıq, email, parol daxil edən forma
- `ShopLogin.tsx` yenilənir: "Mağaza adı" sahəsi "Email" ilə əvəz olunur

**Xaricində:**
- Email təsdiqi (verification link/kod) — qeydiyyatdan sonra email təsdiqi tələb olunmur, hesab dərhal aktivdir
- Parol bərpası ("parolu unutmusunuz") axını — bu fazanın hədəfi deyil
- Mövcud `avto444` hesabının email-i avtomatik təyin edilməsi frontend-dən deyil, deploy zamanı əl ilə bir dəfəlik SQL `UPDATE` ilə ediləcək (aşağıya bax)

## Data model

```sql
ALTER TABLE avto444.shop ADD COLUMN email TEXT;
-- Mövcud avto444 hesabına deploy zamanı bir email teyin edilir, sonra:
ALTER TABLE avto444.shop ALTER COLUMN email SET NOT NULL;
ALTER TABLE avto444.shop ADD CONSTRAINT shop_email_unique UNIQUE (email);
```

İki addımlı miqrasiya seçilib (əvvəlcə nullable, mövcud sətir üçün dəyər təyin edilir, sonra NOT NULL+UNIQUE) ki, mövcud `avto444` sətri miqrasiya zamanı pozulmasın.

**Mövcud `avto444` hesabı üçün email:** deploy zamanı `UPDATE avto444.shop SET email = 'avto444@autopulse.local' WHERE name = 'avto444';` icra olunur (miqrasiya faylının özündə, `ALTER ... SET NOT NULL`-dan əvvəl) — istifadəçi bunu müvəqqəti/placeholder dəyər kimi təsdiqlədi, istəsə sonra dəyişdirə bilər. Bu addım olmadan mövcud hesab email NOT NULL constraint-i ilə miqrasiyanı sındırar.

## Backend

### API

1. **`POST /api/shops/register`** — body `{name, title, email, password}`; `name` (mağaza adı, URL-slug kimi istifadə olunur, unikal), `email` (unikal), `password` (bcrypt-hash olunur, mövcud `GetPasswordHash`/bcrypt konvensiyası ilə eyni). Uğurlu olarsa yeni `shop` sətri yaradılır, sessiya yaradılır, `shop_session` cookie qoyulur, `ShopSummary` qaytarılır (mövcud login-in uğurlu cavabı ilə eyni forma). `name` və ya `email` artıq mövcuddursa → 409.
2. **`POST /api/shops/login`** — **dəyişdirilib**: body indi `{email, password}` (əvvəlki `{name, password}` əvəzinə). `GetShopByEmail` (yeni repository metodu) ilə tapılır, bcrypt yoxlanılır, qalan hər şey olduğu kimi qalır.

### Go strukturu

- `shop.Repository`-yə yeni metodlar: `CreateShop(ctx, input CreateShopInput) (*Shop, error)` (unikal-pozuntusu → `ErrDuplicate` yeni sentinel xəta), `GetShopByEmail(ctx, email string) (*Shop, error)`.
- `Shop` strukturuna `Email string` sahəsi əlavə olunur.
- `internal/auth/handler.go`-ya yeni `Register` metodu, `loginRequest`-in `Name`-i `Email`-ə dəyişir.

## Frontend

- `src/pages/shop/ShopRegister.tsx` (yeni) — 4 sahəli forma (mağaza adı, başlıq, email, parol), uğurlu qeydiyyatdan sonra `/magazam`-a yönləndirir (avtomatik giriş).
- `src/pages/shop/ShopLogin.tsx` — "Mağaza adı" sahəsi "Email" ilə əvəz olunur, altında "Hesabınız yoxdur? Qeydiyyatdan keçin" linki `/magaza-qeydiyyat`-a.
- `src/api/shop.ts` — `shopLogin(email, password)` (imza dəyişir), yeni `registerShop(name, title, email, password)`.

## Test və yoxlama

- Backend: httptest (qeydiyyat uğurlu, təkrar email/ad → 409, email+parol ilə giriş uğurlu, səhv parol → 401)
- Frontend: `npx tsc -b --noEmit`, `npm run build`, korrupsiya scan
- Manual/live: **mövcud `avto444` hesabına email təyin ediləndən sonra**, yeni bir test mağazası qeydiyyatdan keçirilir, email+parol ilə giriş edilir, sonra `avto444`-un özünün yeni email+mövcud parolla giriş edə bildiyi təsdiqlənir (breaking change-in mövcud hesabı sındırmadığının sübutu)
