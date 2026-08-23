# AutoPulse — Tam Elan Sahələri (JSON-Əsaslı Genişlənmə) dizayn sənədi

**Tarix:** 2026-08-23
**Status:** Təsdiqlənib (istifadəçi tərəfindən), implementasiya planı gözlənilir

## Kontekst

Hazırda real elanlar (`shop_products`/`user_products`) yalnız 9 sadə sahə saxlayır (marka/model/il/qiymət/yürüş/yanacaq/ban/title/details), halbuki mövcud mock nümunə elan sistemi (`ListingDetail.tsx`, `src/api/mockData/listings.ts`) 30+ zəngin sahə göstərir — mühərrik, ötürücü, rəng, vəziyyət, kredit/barter, 4 fərqli şəkil kateqoriyası (exterior/interior/features/doors), satıcı əlaqə məlumatı, baxış sayı, təchizat siyahısı və s.

İstifadəçi `https://autopulse.157.180.73.79.sslip.io/elan/mock-9` (mock Mercedes C200 elanı) səhifəsini nümunə göstərərək, **bu tam funksionallığın** DB-də saxlanılmasını və **bütün real elanların** (mağaza + istifadəçi) bu tam struktura uyğunlaşdırılmasını istədi.

**Mühüm qeyd — bilərəkdən edilmiş gizlilik qərarı dəyişikliyi:** əvvəlki "Açıq Bazar Lenti" spesifikasiyasında (`2026-08-23-avtopulse-public-listings-feed-design.md`) qərar verilmişdi ki, fərdi istifadəçi elanlarında satıcının adı/telefonu HEÇ VAXT göstərilməsin (`sellerName: ""`). Bu spesifikasiya bunu **bilərəkdən dəyişir** — istifadəçi bunu açıq şəkildə təsdiqlədi: real "Zəng et" funksionallığının işləməsi üçün fərdi elanlarda da satıcının adı+telefonu göstəriləcək.

## Miqyas

**Daxildir:**
- `shop_products` və `user_products` cədvəllərinə **JSON-əsaslı** genişlənmə: mövcud sadə sahələr (marka/model/il/qiymət/yürüş/yanacaq/ban/title/details/status) sütun olaraq qalır, bütün YENİ ~20 sahə tək bir `details_json JSONB` sütununda saxlanılır
- Şəkil kateqoriyaları: mövcud `_images` cədvəllərinə `kind` sütunu (`exterior`/`interior`/`features`/`doors`)
- Baxış sayğacı: `view_count INT` sütunu, hər `GET /api/listings/{source}/{id}` çağırışında artır
- Satıcı əlaqəsi: mağaza elanı üçün mağazanın adı (telefon yox), istifadəçi elanı üçün istifadəçinin adı+telefonu — hər ikisi `details_json` daxilində, backend tərəfindən avtomatik doldurulur
- `NewListing.tsx` vizardı (artıq bu bütün sahələri toplayır, sadəcə backend-ə göndərmir) — indi tam JSON obyektini göndərir
- `RealListingDetail.tsx` — mövcud mock `ListingDetail.tsx`-in tam zəngin görünüşünə (qalereya-tab-lar, spesifikasiya cədvəli, satıcı əlaqə kartı, bənzər elanlar) köçürülür

**Xaricində:**
- Mock elan sisteminin özünün silinməsi — mock elanlar (nümunə data) olduğu kimi qalır, ayrıca sistemdir
- VIP tier sisteminin real elanlara tətbiqi — bu spesifikasiyanın hədəfi deyil
- "Reklam et"/promote funksionallığının real elanlara bağlanması

## Data model

Hər iki cədvələ eyni struktur əlavə olunur:

```sql
ALTER TABLE avto444.shop_products ADD COLUMN details_json JSONB NOT NULL DEFAULT '{}';
ALTER TABLE avto444.shop_products ADD COLUMN view_count INT NOT NULL DEFAULT 0;

ALTER TABLE avto444.user_products ADD COLUMN details_json JSONB NOT NULL DEFAULT '{}';
ALTER TABLE avto444.user_products ADD COLUMN view_count INT NOT NULL DEFAULT 0;

ALTER TABLE avto444.shop_product_images ADD COLUMN kind TEXT NOT NULL DEFAULT 'exterior' CHECK (kind IN ('exterior', 'interior', 'features', 'doors'));
ALTER TABLE avto444.user_products_images ADD COLUMN kind TEXT NOT NULL DEFAULT 'exterior' CHECK (kind IN ('exterior', 'interior', 'features', 'doors'));
```

`details_json`-un tipik strukturu (Go tərəfində bir struct kimi marşallaşdırılır, JSON kimi saxlanılır):

```json
{
  "şəhər": "Bakı",
  "ötürücü": "Avtomatik",
  "mühərrik": "1.5L",
  "rəng": "Ağ",
  "vəziyyət": "Yeni",
  "kredit": true,
  "barter": false,
  "həcm": 1497,
  "güc": 204,
  "sürətlərQutusu": 9,
  "yerlərSayı": 5,
  "bazarÜçünYığılıb": "Avropa",
  "vuruğuVar": false,
  "rənglənib": false,
  "qəzalı": false,
  "təchizat": ["ABS", "Lyuk", "Yağış sensoru", "Mərkəzi qapanma", "Kondisioner"],
  "satıcıAd": "avto444",
  "satıcıZəng": ""
}
```

Mağaza elanı üçün `satıcıAd` = mağazanın adı, `satıcıZəng` = boş (mağaza telefon göstərmir, öz əlaqə kanalı var). İstifadəçi elanı üçün `satıcıAd` = `user.name`, `satıcıZəng` = `user.phone`.

## Backend

### Go strukturu

- `shop.Product`/`user.Product` strukturlarına `DetailsJSON json.RawMessage` (və ya konkret `ProductDetails` struct-ı) və `ViewCount int` sahələri əlavə olunur.
- `CreateProductInput`/`UpdateProduct`-ın body-si indi tam `details_json` obyektini də qəbul edir — bir JSON `body.Details` sahəsi kimi, birbaşa DB-yə yazılır (Go tərəfində sahə-sahə emal edilmir, şəffaf ötürülür).
- `pgx`-in JSONB dəstəyi ilə (`json.RawMessage` tipi ilə `Scan`/parametr ötürmə) birbaşa oxuma/yazma.
- Yeni endpoint davranışı: `POST/PUT /me/products` body-sinə əlavə sahə `details: {...}` (tam JSON obyekt).
- `POST /me/products/{id}/images` — indi `kind` form sahəsini qəbul edir (default `exterior`, geriyə uyğunluq üçün).
- `GET /api/listings/{source}/{id}` — hər çağırışda `UPDATE ... SET view_count = view_count + 1 WHERE id = $1` icra edir, sonra nəticəni qaytarır.
- Yaradılış zamanı (`CreateProduct`) backend `details_json`-a `satıcıAd`/`satıcıZəng`-i avtomatik doldurur (istifadəçinin göndərdiyi JSON-a bu iki sahəni server tərəfində əlavə/əvəz edir ki, saxta məlumat göndərilə bilməsin).

## Frontend

- `NewListing.tsx`: `formStateToCreateListingInput` funksiyası indi bütün 20+ sahəni bir `details` obyektinə yığıb göndərir (heç bir sahə kəsilmir). `listingToFormState` (edit rejimi üçün) bu JSON-u geri parse edib vizard sahələrinə doldurur.
- Şəkil upload: 4 tab-ın (Exterior/Interior/Key features/Doors) hər biri öz `kind` dəyəri ilə ayrıca yüklənir.
- `RealListingDetail.tsx`: `ListingDetail.tsx`-in JSX strukturuna köçürülür — `InteractiveGallery` (4 kateqoriyalı qalereya), `ListingDetailTabs` (spesifikasiya cədvəli + bənzər elanlar), tam satıcı əlaqə kartı (zəng et/mesaj yaz), baxış sayı göstəricisi.
- "Bənzər elanlar" real elanlar arasından (eyni mənbədə, marka/qiymət yaxınlığına görə) hesablanır.

## Test və yoxlama

- Backend: httptest (JSON sahələrin düzgün saxlanıb-oxunduğu, `kind`-ə görə şəkillərin düzgün kateqoriyalandığı, `view_count`-un düzgün artdığı, `satıcıAd`/`satıcıZəng`-in server tərəfindən düzgün doldurulduğu — istifadəçinin göndərdiyi saxta dəyərlərin ə əvəz olunduğu)
- Frontend: `npx tsc -b --noEmit`, `npm run build`, korrupsiya scan
- Manual/live: real bir elan yaradıb bütün 6 addımı doldur, bütün 4 şəkil kateqoriyasına şəkil yüklə, `RealListingDetail.tsx`-də bütün sahələrin (mühərrik, ötürücü, rəng və s.) göründüyünü, baxış sayının artdığını, satıcı əlaqəsinin düzgün göstərildiyini təsdiqlə — mövcud real datalara (12+ mağaza məhsulu, mock-9 dəyişməz) toxunmadan
