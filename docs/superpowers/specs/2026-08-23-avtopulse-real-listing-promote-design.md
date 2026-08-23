# AutoPulse — Real Elanlar üçün Promote (VIP Tier) Sistemi dizayn sənədi

**Tarix:** 2026-08-23
**Status:** Təsdiqlənib (istifadəçi tərəfindən), implementasiya planı gözlənilir

## Kontekst

`ListingDetail.tsx` (mock elan görünüşü) sidebar-da "İrəli çək / VIP / Premium" promote düymələri göstərir — istifadəçi bunlara klik edərək elanın `vipTier`-ini balansından pul çıxaraq yüksəldə bilir (`src/api/auth.ts`-də `promoteListing`, tam in-memory/mock, real backend yoxdur).

`RealListingDetail.tsx` (real `shop_products`/`user_products` elanları) artıq bu görünüşə çox yaxındır — `InteractiveGallery`/`ListingDetailTabs` istifadə edir, elan nömrəsi, baxış sayı, satıcı əlaqə kartı göstərir — lakin promote düymələri yoxdur, çünki backend-də balans və ya VIP tier konsepti mövcud deyil.

İstifadəçi real elanlarda da eyni promote funksionallığının **tam işlək** (real backend, real balans tədqədüq, DB-də saxlanılan tier) olmasını istəyir.

## Miqyas

**Daxildir:**
- `shop`/`user` sahiblərinə (mağaza/istifadəçi hesabı) `balans INT NOT NULL DEFAULT 0` sütunu
- `shop_products`/`user_products`-a `vip_tier TEXT NOT NULL DEFAULT 'standart'` sütunu (`standart`/`vip`/`premium_vip`)
- `POST /me/products/{id}/promote` endpoint-i (həm shop, həm user tərəfdə) — tier seçib balansdan tədqədüq edir, elanın `vip_tier`-ini yeniləyir, tək tranzaksiyada
- `GET /api/listings`/`GET /api/listings/{source}/{id}` cavabına `vipTier` sahəsi
- Sahibin cari balansını görmək üçün mövcud "mənim məhsullarım" cavabına `balans` sahəsi
- `RealListingDetail.tsx`-ə promote düymələri (mövcud `PromoteModal` komponentinin təkrar istifadəsi) + balans-kifayət-etməmə xətası
- VIP tier **həmişəlik** qalır (mock sistemlə eyni davranış) — müddət/expiry yoxdur

**Xaricində:**
- Real pul ödənişi/kart inteqrasiyası — balans YALNIZ admin tərəfindən əl ilə (birbaşa `psql UPDATE` ilə) artırıla bilər, bu mərhələdə heç bir top-up UI/endpoint-i yoxdur
- Admin panelinə balans idarəetmə UI-sı əlavə etmək
- VIP tier-ə görə siyahı sıralaması/bölmə filtri (Salonların VIP Elanları və s. bölmələrinin real datanı `vipTier`-ə görə süzməsi) — bu, ayrıca, sonrakı bir iş kimi qala bilər, bu spec yalnız promote əməliyyatının özünü və backend-in `vipTier`-i düzgün saxlayıb-qaytarmasını əhatə edir
- VIP tier-in müddətli/expiry-li olması

## Data model

```sql
ALTER TABLE avto444.shop ADD COLUMN balans INT NOT NULL DEFAULT 0;
ALTER TABLE avto444.user ADD COLUMN balans INT NOT NULL DEFAULT 0;

ALTER TABLE avto444.shop_products ADD COLUMN vip_tier TEXT NOT NULL DEFAULT 'standart'
  CHECK (vip_tier IN ('standart', 'vip', 'premium_vip'));
ALTER TABLE avto444.user_products ADD COLUMN vip_tier TEXT NOT NULL DEFAULT 'standart'
  CHECK (vip_tier IN ('standart', 'vip', 'premium_vip'));
```

Qiymətlər (mock sistemdəki `PROMO_PRICES` ilə eyni, dəyişməz):
```
ireli_cek: 3 AZN  →  vip_tier dəyişmir (yalnız balans tədqədüq olunur — "irəli çəkmə" listinq sırasını təsirləyən keçici effektdir, tier deyil)
vip: 5 AZN        →  vip_tier = 'vip'
premium_vip: 7 AZN → vip_tier = 'premium_vip'
```

Qeyd: mock sistemdə də `ireli_cek` tier-i `standart`-a map olunur (`promoTierToVipTier` funksiyası) — yəni "İrəli çək" heç vaxt `vip_tier`-i dəyişdirmir, sadəcə balans tədqədüq edir. Bu davranış eynilə saxlanılır.

## Backend

### Endpoint: `POST /me/products/{id}/promote` (shop tərəf, `internal/auth/handler.go`-da)

- Sessiya yoxlanılır (`requireSession`), elanın bu shop-a aid olduğu təsdiqlənir (`GetProductShopID`).
- Body: `{"tier": "ireli_cek"|"vip"|"premium_vip"}`
- Server-side qiymət cədvəli (frontend-dən gələn qiymətə etibar edilmir):
  ```go
  var promoPrices = map[string]int{"ireli_cek": 3, "vip": 5, "premium_vip": 7}
  ```
- Bir DB tranzaksiyası daxilində: `shop.balans`-ı oxu, kifayət etmirsə `402 Payment Required` qaytar (body: `{"error": "insufficient_balance", "required": N, "available": M}`), kifayət edirsə `balans -= price`, `ireli_cek` olmayan tier-lər üçün `shop_products.vip_tier = tier`.
- Uğurlu cavab: yenilənmiş `Product` (yeni `vip_tier`, yeni balans opsional olaraq).

### Endpoint: `POST /me/products/{id}/promote` (user tərəf, `internal/user/handler.go`-da)

Eyni məntiq, `avto444.user.balans` və `user_products.vip_tier` üzərində.

### Repository dəyişiklikləri

- `shop.Repository`/`user.Repository`-ə `PromoteProduct(ctx, productID int64, tier string) (*Product, error)` metodu — daxilində `pgx.Tx` ilə tranzaksiya, balans yoxlama, iki `UPDATE` (balans + vip_tier).
- Balans kifayət etməməsi üçün ayrıca `ErrInsufficientBalance` xəta tipi (hər iki paketdə).
- `Product`/`ProductWithShopName` struct-larına `VipTier string` sahəsi (`json:"vipTier"`).
- Sahibin balansını qaytarmaq üçün: mövcud "mənim məhsullarım" list endpoint-i cavabına ayrıca `balans` sahəsi əlavə olunur (məs. `{"balans": N, "products": [...]}`, ya da hazırkı sadə array cavabı `{"balans": N, "products": [...]}` şəklinə keçir — implementasiya planı bunu dəqiqləşdirsin, geriyə uyğunluğu qorumaqla).

### `listings` paketi

- `PublicListing`-ə `VipTier string json:"vipTier"` sahəsi əlavə olunur, `ListActiveProducts`/`PublicListingDetail`-in map etdiyi yerlərə ötürülür.

### Migrasiya

- `avtopulse-backend/migrations/0009_promote_and_balance.sql`
- Serverdə tətbiq zamanı **mütləq** `public.schema_migrations`-a tracking sətri əlavə edilməlidir (2026-08-23-də tapılan gotcha — əl ilə `psql -f` tətbiqi backend-in öz migrasiya runner-i üçün "tətbiq olunmayıb" kimi görünür, restart zamanı crash-loop yaradır).

## Frontend

- `RealListingDetail.tsx`: `apiListingToMockShape`-ə `vipTier: l.vipTier` əlavə olunur (indi `'standart'` hardcode edilib).
- Sidebar-a mövcud `PromoteModal` komponenti inteqrasiya olunur — `handlePromote` funksiyası mock `promoteListing`-i real bir yeni funksiya (`promoteRealListing(source, id, tier)`, `src/api/listings.ts`-də) ilə əvəz edir.
- `promoteRealListing`: `POST /api/{shops|users}/me/products/{id}/promote`, `credentials: 'include'`. `402` cavabında xüsusi `InsufficientBalanceError` atır.
- Xəta halında: modal daxilində "Balansınız kifayət etmir (N AZN lazımdır, M AZN mövcuddur)" mesajı göstərilir, əməliyyat ləğv olunmur.
- Uğurlu promote sonrası: `listing` state-i yeni `vipTier` ilə yenilənir, sidebar-dakı promote düymələri yenidən render olunur (hazırkı tier vurğulana bilər — bu, mock `ListingDetail.tsx`-in etdiyi kimi minimal olaraq saxlanılır, əlavə vizual dəyişiklik tələb olunmur).

## Test və yoxlama

- Backend: httptest — kifayət qədər balans olduqda uğurlu promote + balans azalması + vip_tier dəyişməsi; kifayət etməyən balans halında `402` və heç bir dəyişiklik olmaması; `ireli_cek`-in vip_tier-i dəyişdirməməsi, yalnız balans tədqədüq etməsi; başqa sahibin elanını promote etməyə cəhd zamanı `404`.
- Frontend: `npx tsc -b --noEmit`, `npm run build`, korrupsiya scan.
- Manual/live: admin/DB-dən test şəxsə/mağazaya balans əlavə et, real bir elanı VIP-ə yüksəlt, balansın azaldığını və `vip_tier`-in `GET /api/listings/{source}/{id}` cavabında düzgün göründüyünü təsdiqlə, kifayət etməyən balansla cəhd edib xəta mesajının göründüyünü təsdiqlə. Test balansı/dəyişiklikləri sonda təmizlə (və ya real test istifadəçisi/mağazası üzərində saxla, aydın qeyd et).
