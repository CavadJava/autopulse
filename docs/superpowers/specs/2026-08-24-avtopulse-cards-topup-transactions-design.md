# Kartlar, Balans Artırma və Əməliyyat Tarixçəsi — Dizayn Sənədi

**Tarix:** 2026-08-24
**Status:** Təsdiqlənib (dizayn mərhələsi)

## Məqsəd

Fərdi istifadəçi (`/kabinet`) və mağaza (`/magazam`) tərəfində, hazırda mock olan kart-əlavəetmə (`getMyCards`) və balans-artırma (`topUpBalance`) funksionallığını real backend+DB-yə bağlamaq, üstəlik hər iki tərəf üçün **ayrı-ayrı** əməliyyat tarixçəsi (balans artırıldı / istifadə edildi, əvvəlki→sonrakı balans) əlavə etmək.

## Scope-dan kənar

- **Real ödəniş provayderi (Stripe və s.) inteqrasiyası yoxdur.** Kart nömrəsi/CVV/son istifadə tarixi DB-də **heç vaxt** saxlanılmır, heç bir yerə göndərilmir/loglanmır — yalnız son 4 rəqəm + kart növü (ilk rəqəmdən müəyyən olunur) saxlanılır. Balans artırma tam demo əməliyyatdır (DB-də ədədi artırma), real pul köçürülmür.
- İstifadəçi və mağaza tərəfinin tranzaksiya cədvəlləri **ayrı-ayrı** cədvəllərdədir — ortaq/paylaşılan tranzaksiya cədvəli YOXDUR.
- Mock `AuthContext`/`useAuth()` ilə bağlı digər hissələr (hero greeting, plan badge və s.) dəyişmir.

## Data Model

```sql
CREATE TABLE avto444.user_saved_cards (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES avto444.user(id),
  last4       TEXT NOT NULL,
  card_type   TEXT NOT NULL CHECK (card_type IN ('Visa', 'Mastercard')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.shop_saved_cards (
  id          BIGSERIAL PRIMARY KEY,
  shop_id     BIGINT NOT NULL REFERENCES avto444.shop(id),
  last4       TEXT NOT NULL,
  card_type   TEXT NOT NULL CHECK (card_type IN ('Visa', 'Mastercard')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.user_balance_transactions (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES avto444.user(id),
  type           TEXT NOT NULL CHECK (type IN ('topup', 'promote_spend')),
  amount         INT NOT NULL,          -- topup: müsbət, promote_spend: mənfi
  balance_before INT NOT NULL,
  balance_after  INT NOT NULL,
  description    TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.shop_balance_transactions (
  id             BIGSERIAL PRIMARY KEY,
  shop_id        BIGINT NOT NULL REFERENCES avto444.shop(id),
  type           TEXT NOT NULL CHECK (type IN ('topup', 'promote_spend')),
  amount         INT NOT NULL,
  balance_before INT NOT NULL,
  balance_after  INT NOT NULL,
  description    TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_balance_tx ON avto444.user_balance_transactions (user_id, created_at DESC);
CREATE INDEX idx_shop_balance_tx ON avto444.shop_balance_transactions (shop_id, created_at DESC);
```

## Paket Strukturu

Yeni `internal/billing` Go paketi, iki paralel amma tam müstəqil repository/handler seti:
- `UserRepository`/`userHandlers` — `user_saved_cards` + `user_balance_transactions` üzərində işləyir, `user_session` cookie ilə qorunur.
- `ShopRepository`/`shopHandlers` — `shop_saved_cards` + `shop_balance_transactions` üzərində işləyir, `shop_session` cookie ilə qorunur.

Kod strukturca simmetrikdir (eyni method adları, eyni davranış), lakin DB-də heç bir ortaq cədvəl yoxdur.

## Backend API

**İstifadəçi tərəfi (`/api/users/me/...`):**
- `GET /cards` — kart siyahısı (`{id, last4, cardType, createdAt}[]`)
- `POST /cards` — body `{cardNumber, expiry}` → backend son 4 rəqəmi çıxarır, növü ilk rəqəmdən müəyyən edir (Visa: `4`, Mastercard: `5`), yalnız bunları saxlayır
- `DELETE /cards/{id}` — yalnız öz kartını silə bilər (ownership yoxlanılır)
- `POST /topup` — body `{cardId, amount}` → kartın bu user-ə aid olduğunu yoxlayır, `avto444.user.balans`-ı artırır, eyni DB tranzaksiyasında `user_balance_transactions`-a `type='topup', amount=+N` sətri yazır
- `GET /transactions` — tarixçə, `created_at DESC`

**Mağaza tərəfi (`/api/shops/me/...`):** yuxarıdakının eyni strukturda təkrarı, `shop_saved_cards`/`shop_balance_transactions` üzərində.

**Mövcud kodda dəyişiklik (promote xərcinin tarixçəyə yazılması):**
- `internal/user/repository.go`-nun `PromoteProduct` metodu: balansı azaldan mövcud `UPDATE avto444.user SET balans = balans - $1` sətirindən dərhal sonra, EYNİ DB tranzaksiyası daxilində, `user_balance_transactions`-a `type='promote_spend', amount=-price` sətri yazılır.
- `internal/shop/repository.go`-nun `PromoteProduct` metodu: eyni məntiq, `shop_balance_transactions`-a.

## Kart Nömrəsi Emalı (Backend)

```go
func cardTypeFromNumber(number string) (string, error) {
    if len(number) < 4 {
        return "", errors.New("card number too short")
    }
    switch number[0] {
    case '4':
        return "Visa", nil
    case '5':
        return "Mastercard", nil
    default:
        return "", errors.New("unsupported card type")
    }
}
```
Yalnız `last4 := number[len(number)-4:]` və `cardType` DB-yə yazılır; `number`, `expiry`, hər hansı CVV sahəsi request body-dən oxunandan sonra heç bir dəyişənə uzunmüddətli saxlanmır və loglanmır.

## Frontend

**İstifadəçi tərəfi:**
- `KabinetKartlarim.tsx` — "Yeni kart əlavə et" düyməsi real form açır (kart nömrəsi, son istifadə tarixi, kart növü avtomatik göstərilir), hər kartda "Sil" düyməsi.
- `KabinetOverview.tsx` — top-up modalı indi kart seçimi tələb edir (kart yoxdursa, "əvvəlcə kart əlavə edin" mesajı + `/kabinet/kartlarim` linki); boş "Əməliyyat tarixçəsi" bölməsi real siyahı ilə əvəzlənir (tarix, təsvir, məbləğ `+`/`-` işarəli, "əvvəl: X AZN → indi: Y AZN").

**Mağaza tərəfi:**
- Yeni `MyShopKartlarim.tsx` (`/magazam/kartlarim`) — `KabinetKartlarim` ilə eyni struktur, mağaza API-lərinə bağlı.
- Yeni `MyShopTranzaksiyalar.tsx` (`/magazam/tranzaksiyalar`) — tarixçə siyahısı.
- `MyShop.tsx`-in header-inə "Kartlarım" və "Tranzaksiyalar" linkləri (mövcud "Mesajlar"/"Bildirişlər" link pattern-i ilə).

**Ortaq API client:** `src/api/billing.ts` — user və shop üçün ayrı funksiya dəstləri (`getMyCards`/`addCard`/`deleteCard`/`topUpWithCard`/`getMyTransactions` və `getShopCards`/`addShopCard`/`deleteShopCard`/`topUpShopWithCard`/`getShopTransactions`), `src/api/chat.ts`-in split-by-session pattern-i ilə.

## Xəta İdarəetməsi

- Kart nömrəsi 13-19 rəqəm aralığında deyilsə və ya dəstəklənməyən növdürsə → 400.
- Top-up: `cardId` bu user/shop-a aid deyilsə → 403; kart tapılmadısa → 404.
- Kart silmə: başqasının kartını silməyə cəhd → 403.
- Balans mənfi ola bilməz (top-up yalnız artırır; promote-spend balansı azaldan yerdə onsuz da mövcud `balans < price` yoxlaması var).

## Test Planı

- Backend: `cardTypeFromNumber` unit testləri (Visa/Mastercard/naməlum/qısa nömrə); repository-level inteqrasiya testləri (DSN varsa) — kart əlavə/sil, top-up sonrası balans+tranzaksiya sətri, promote-spend sonrası tranzaksiya sətri.
- Frontend: mövcud pattern (tsc + build), corruption scan (`Ɛ|Ɔ`).
- Canlı yoxlama: disposable test user/shop ilə tam dövrə (kart əlavə → topup → tranzaksiya siyahısında görünmə → kart silmə), test datası təmizlənməsi.
