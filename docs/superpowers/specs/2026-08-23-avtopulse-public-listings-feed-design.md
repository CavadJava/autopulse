# AutoPulse — Açıq Bazar Lenti (Mağaza + İstifadəçi Elanları Birləşdirilmiş Görünüş) dizayn sənədi

**Tarix:** 2026-08-23
**Status:** Təsdiqlənib (istifadəçi tərəfindən), implementasiya planı gözlənilir

## Kontekst

İndiyə qədər tikilmiş sistemlərdə (mağaza CRUD, istifadəçi elanları + moderasiya) heç biri **ictimai, birləşdirilmiş görünüşə** malik deyil — istifadəçi öz elanlarını `/kabinet/elanlarim`-da, mağaza sahibi öz elanlarını `/magazam`-da görür, amma sıravi bir ziyarətçi (başqa istifadəçi və ya potensial müştəri) sistemdə olan **bütün təsdiqlənmiş** elanları (həm mağaza, həm fərdi istifadəçi) bir yerdə görə bilmir.

Mövcud `/elanlar` (`Listings.tsx`) və ana səhifə (`Home.tsx`) səhifələri artıq bir "elan lenti" konseptinə malikdir, amma bu, tamamilə **mock data**-dır (`src/api/listings.ts`-in `mockListings` massivi) — real backend-ə heç bir bağlılığı yoxdur. Bu sənəd bu lenti real, canlı `shop_products`/`user_products` datası ilə əvəz edir.

**Kritik uyğunsuzluq (aşkarlanıb, bu sənəddə həll edilir):** mövcud `Listing` mock tipi 30+ zəngin sahə saxlayır (`mühərrik`, `ötürücü`, `interyerŞəkillər`, `satıcıÜzvlükTarixi`, `vuruğuVar`, `təchizat` və s.), amma real backend cədvəlləri (`shop_products`/`user_products`) yalnız 9-10 sadə sahə saxlayır (marka/model/il/qiymət/yürüş/yanacaq/ban/title/details + şəkillər). Bu, real elan üçün `ListingDetail.tsx`-in **fərqli, daha sadə bir render yolu** ilə göstərilməsini tələb edir — mock elanlar (nümunə data) isə olduğu kimi, zəngin görünüşdə qalır.

## Miqyas

**Daxildir:**
- Yeni, kiçik Go paketi `internal/listings` — yalnız ictimai, autentifikasiyasız oxuma üçün:
  - `GET /api/listings` — `user_products` (status='saytda') və `shop_products` (status='saytda') birləşdirilmiş siyahısı, hər elementdə `source: 'shop' | 'user'` sahəsi
  - `GET /api/listings/{source}/{id}` — tək elan detalı (`source` "shop" və ya "user" olmalıdır)
- Mövcud `/elanlar` (`Listings.tsx`) və ana səhifə (`Home.tsx`) real `GET /api/listings`-ə bağlanır — mock `mockListings` əvəzinə
- `ListingDetail.tsx` real elan (mağaza və ya istifadəçi mənbəli) üçün **sadə, mövcud sahələrlə məhdud** bir görünüş göstərir — istifadəçi mağazanın və ya digər istifadəçinin elanına daxil olub mövcud detalları (marka/model/il/qiymət/yürüş/yanacaq/ban/başlıq/təsvir/şəkillər/satıcı növü) görə bilər
- Satıcı növü göstəricisi: mənbəyə görə "Diler / Salon" (mağaza) və ya "Şəxsi" (fərdi istifadəçi) — mövcud `satıcıTipi` konseptinin təbii genişlənməsi

**Xaricində:**
- Baxış sayı (`view_count`) və əlaqə-sorğusu sayı (`contact_count`) izlənməsi — bunlar ayrıca, əvvəlki spesifikasiyada təsvir olunmuş statistika fazasına aiddir, bu fazanın hədəfi deyil
- Real-vaxt müddət-bitmə ticker-i — ayrıca, əvvəlki spesifikasiyada təsvir olunmuş bir fazadır
- Backend cədvəllərinə (`shop_products`/`user_products`) mock `Listing` tipinin çatışmayan zəngin sahələrinin (mühərrik, ötürücü, interyer şəkilləri və s.) əlavə edilməsi — istifadəçi bunu istəmədi, real elanlar sadə görünüşdə qalacaq
- Mağaza vitrininə (`/magazalar/{ad}`) keçid/link — istifadəçi elan detalının özündə qalmağı seçdi, vitrinə yönləndirmə yoxdur
- Mağaza tərəfinin "Reklam et"/VIP tier sistemi ilə real elanların inteqrasiyası — real elanlarda VIP tier sahəsi yoxdur, bu fazada əlavə edilmir

## Backend

### API

1. **`GET /api/listings`** — autentifikasiyasız. `user_products` (`status='saytda'`) və `shop_products` (`status='saytda'`) sorğularını ayrı-ayrı çəkib, hər elementə `source` sahəsi əlavə edərək bir massivə birləşdirir. Yanıt formatı:
   ```json
   [
     { "source": "shop", "id": 1, "marka": "BMW", "model": "320i", "il": 2021, "qiymet": 45000, "yurus": 30000, "yanacaq": "Benzin", "ban": "Sedan", "title": "BMW 320i, 2021", "details": "...", "images": [{"minioUrl": "...", "s3Url": "...", "sira": 0}], "sellerType": "diler", "sellerName": "avto444" },
     { "source": "user", "id": 5, "marka": "Toyota", "model": "Camry", ..., "sellerType": "şəxsi", "sellerName": "" }
   ]
   ```
   `sellerName` mağaza elanları üçün mağazanın adıdır (`shop.Name`), fərdi elanlar üçün boş sətir (istifadəçi adı ictimai göstərilmir — məxfilik).

2. **`GET /api/listings/{source}/{id}`** — autentifikasiyasız, tək elan. `{source}` `"shop"` və ya `"user"` olmalıdır (əks halda 400). Uyğun repository-dən (`shop.Repository.GetProductByID` — YENİ metod, yoxdursa əlavə olunacaq — və ya `user.Repository`-də analoji YENİ metod) çəkilir, tapılmasa 404. Yalnız `status='saytda'` olan elanlar qaytarılır (başqa statuslu elan üçün 404 — ictimai görünüş yalnız aktiv elanlar üçündür).

### Go strukturu

- `internal/listings/handler.go` — `listingsHandlers` struct, `userRepo user.Repository`, `shopRepo shop.Repository` alır. 2 adlandırılmış metod: `PublicListings`, `PublicListingDetail`.
- `shop.Repository`-yə yeni metod: `GetProductByID(ctx, id int64) (*Product, error)` — ownership yoxlamasız, sadəcə ID-yə görə tək məhsul (mövcud `GetProductShopID`-dən fərqli olaraq, bütün `Product` strukturunu qaytarır).
- `user.Repository`-yə yeni metod: `GetProductByID(ctx, id int64) (*Product, error)` — eyni məntiq.
- `cmd/server/main.go`-a `GET /api/listings` və `GET /api/listings/{source}/{id}` route-ları əlavə olunur (autentifikasiya middleware-i yoxdur — tamamilə açıq).

## Frontend

- `src/api/listings.ts`: `getListings()`/`getListingById()` real API-a bağlanır. Yeni bir tip: `ApiListing` (backend-in `source`/`marka`/`model`/.../`images`/`sellerType`/`sellerName` formasını əks etdirir), köhnə mock `Listing` tipi **silinmir** (nümunə data hələ də mövcud ola bilər, başqa yerlərdə istifadə oluna bilər — yalnız real API-nın nəticəsi bu yeni tipdə olacaq).
- `Listings.tsx`/`Home.tsx`: `getListings()`-in nəticəsini render edərkən, VIP tier bölməsi (Salon VIP/VIP/Standard) real elanlar üçün mənasızdır (VIP sahəsi yoxdur) — bütün real elanlar "Standard" bölməsində göstərilir.
- `ListingDetail.tsx`: **iki fərqli render yolu**:
  - Mock elan (əvvəlki `mockListings`-dən, `id` formatı fərqli/UUID-bənzər ola bilər) — mövcud, zəngin görünüş dəyişmədən qalır.
  - Real elan (`source`+`id` URL formatı, məs. `/elan/shop-1` və ya `/elan/user-5` — dəqiq URL sxemi plan mərhələsində qərarlaşdırılacaq) — yalnız mövcud sahələr göstərilir: başlıq, marka/model/il, qiymət, yürüş, yanacaq, ban, təsvir, şəkillər (varsa), satıcı növü (Diler/Salon və ya Şəxsi) və (mağaza elanı üçün) mağaza adı. Digər UI elementləri (mühərrik/ötürücü/interyer şəkilləri/təchizat siyahısı və s.) real elan üçün sadəcə göstərilmir.

## Test və yoxlama

- Backend: `internal/listings` üçün httptest (yalnız saytda elanlar qaytarılır, gözləmədə/legv_edilib görünmür, source-a görə düzgün repository çağırılır, yanlış source 400, tapılmayan id 404)
- Frontend: `npx tsc -b --noEmit`, `npm run build`, korrupsiya scan
- Manual/live: `/elanlar`-da həm real mağaza, həm real istifadəçi elanının göründüyünü yoxla, hər birinə klikləyib `ListingDetail.tsx`-in sadə görünüşdə açıldığını təsdiqlə — mövcud `avto444` mağaza datasına toxunmadan
