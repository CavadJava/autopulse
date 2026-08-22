import type { Listing } from '../../types';

// Curated Unsplash car photography. Every URL in all 4 pools below was
// individually downloaded and visually verified (not guessed) to actually
// match its category — an earlier attempt fabricated IDs / reused exterior
// photos with a fake query-string suffix, which silently produced 404s and
// wrong-category images since Unsplash ignores unrecognized query params.
// Each pool has 15 shots so, combined with a step of 4 per listing below
// (gcd(4,15)=1), all 12 listings get a distinct 5-photo window with no two
// listings sharing the exact same set.
const CAR_PHOTOS = [
  'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80',
  'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&q=80',
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80',
  'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&q=80',
  'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&q=80',
  'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&q=80',
  'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80',
  'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800&q=80',
  'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800&q=80',
  'https://images.unsplash.com/photo-1605806678127-c5b0769d499f?w=800&q=80',
  'https://images.unsplash.com/photo-1561299593-7633f311838a?w=800&q=80',
  'https://images.unsplash.com/photo-1607500421926-218d0bbcda63?w=800&q=80',
  'https://images.unsplash.com/photo-1758384076382-21f6587e1048?w=800&q=80',
  'https://images.unsplash.com/photo-1748514338092-943ecca0cdc9?w=800&q=80',
  'https://images.unsplash.com/photo-1755288348835-dc6c29852299?w=800&q=80',
];

// Real interior/cabin shots (dashboard, steering wheel, seats, console) —
// verified distinct from the exterior pool above.
const INTERIOR_PHOTOS = [
  'https://images.unsplash.com/photo-1710866380940-7e0c7aa925b0?w=800&q=80',
  'https://images.unsplash.com/photo-1736482582949-da714b927791?w=800&q=80',
  'https://images.unsplash.com/photo-1696238670344-eb2e92114e81?w=800&q=80',
  'https://images.unsplash.com/photo-1693164373231-8005638fcee1?w=800&q=80',
  'https://images.unsplash.com/photo-1644091067090-4fde9574ffb0?w=800&q=80',
  'https://images.unsplash.com/photo-1693324199178-eb6414b0a688?w=800&q=80',
  'https://images.unsplash.com/photo-1713712150258-bf649a6cf0c5?w=800&q=80',
  'https://images.unsplash.com/photo-1758228655476-6b51e2303a0e?w=800&q=80',
  'https://images.unsplash.com/photo-1609842465593-c64fdfcd013c?w=800&q=80',
  'https://images.unsplash.com/photo-1683907993207-7e0abe4f9009?w=800&q=80',
  'https://images.unsplash.com/photo-1756239772779-79576e5ee78e?w=800&q=80',
  'https://images.unsplash.com/photo-1652860316277-370ca5b1b1df?w=800&q=80',
  'https://images.unsplash.com/photo-1654616112164-ab149ff8d612?w=800&q=80',
  'https://images.unsplash.com/photo-1760161339261-56487b766a17?w=800&q=80',
  'https://images.unsplash.com/photo-1736890316510-c2d6a1ca021c?w=800&q=80',
];

// Close-up feature/detail shots (wheels, headlights, badges, sensors) for the
// Key features tab — real detail photography, not exterior shots relabeled.
const FEATURE_PHOTOS = [
  'https://images.unsplash.com/photo-1761040100208-07f603acc83f?w=800&q=80',
  'https://images.unsplash.com/photo-1759704823047-b7585ebc9485?w=800&q=80',
  'https://images.unsplash.com/photo-1741366175071-3604c86ec475?w=800&q=80',
  'https://images.unsplash.com/photo-1686343981730-9f9087c1b471?w=800&q=80',
  'https://images.unsplash.com/photo-1738603160282-ed7183ab6ddc?w=800&q=80',
  'https://images.unsplash.com/photo-1768341396286-a6322d588111?w=800&q=80',
  'https://images.unsplash.com/photo-1749043140503-da3546679d54?w=800&q=80',
  'https://images.unsplash.com/photo-1758901466605-05275864983f?w=800&q=80',
  'https://images.unsplash.com/photo-1616867752721-6ed993d337be?w=800&q=80',
  'https://images.unsplash.com/photo-1753030148904-16130157a3e5?w=800&q=80',
  'https://images.unsplash.com/photo-1691706268935-79f076368283?w=800&q=80',
  'https://images.unsplash.com/photo-1770834807387-820280f8270b?w=800&q=80',
  'https://images.unsplash.com/photo-1759189901164-900e0afac895?w=800&q=80',
  'https://images.unsplash.com/photo-1680961228986-6ace9aa02271?w=800&q=80',
  'https://images.unsplash.com/photo-1533564567040-2667eb706318?w=800&q=80',
];

// Side/door-profile shots for the Doors tab — real profile photography
// showing the car's side and door lines, not a re-suffixed exterior shot.
const DOOR_PHOTOS = [
  'https://images.unsplash.com/photo-1752959812835-ac52e704f777?w=800&q=80',
  'https://images.unsplash.com/photo-1655903414934-360ad38e7c30?w=800&q=80',
  'https://images.unsplash.com/photo-1665326278305-7415490e33a6?w=800&q=80',
  'https://images.unsplash.com/photo-1736635929179-47f7ce422284?w=800&q=80',
  'https://images.unsplash.com/photo-1685069165844-5e070b0afca0?w=800&q=80',
  'https://images.unsplash.com/photo-1667551181687-e3eb9babf037?w=800&q=80',
  'https://images.unsplash.com/photo-1748091677506-6d7147d3b688?w=800&q=80',
  'https://images.unsplash.com/photo-1641326505400-8a86340ecc54?w=800&q=80',
  'https://images.unsplash.com/photo-1714348938110-d3692bc3716a?w=800&q=80',
  'https://images.unsplash.com/photo-1689917098288-43f8c7b139e1?w=800&q=80',
  'https://images.unsplash.com/photo-1643860020708-09362894247d?w=800&q=80',
  'https://images.unsplash.com/photo-1747188174987-0f0e184a92c4?w=800&q=80',
  'https://images.unsplash.com/photo-1685783230651-fbc5382054e1?w=800&q=80',
  'https://images.unsplash.com/photo-1547535503-2782c30eeb42?w=800&q=80',
  'https://images.unsplash.com/photo-1650535517973-1139e7feb023?w=800&q=80',
];

// Every listing below gets exactly 5 distinct photos per tab, sliced from a
// rotating 4-step window (e.g. img(0..4), img(4..8), img(8..12), ...) so
// listings feel like they each have their own real gallery instead of a
// repeating fixed set.

const img = (index: number) => CAR_PHOTOS[index % CAR_PHOTOS.length];
const interiorImg = (index: number) => INTERIOR_PHOTOS[index % INTERIOR_PHOTOS.length];
const featureImg = (index: number) => FEATURE_PHOTOS[index % FEATURE_PHOTOS.length];
const doorImg = (index: number) => DOOR_PHOTOS[index % DOOR_PHOTOS.length];

export const mockListings: Listing[] = [
  {
    id: '1', marka: 'BMW', model: '5 Series', il: 2021, qiymət: 42500, şəhər: 'Bakı',
    yürüş: 45000, yanacaq: 'Benzin', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '2.0L',
    rəng: 'Qara', vəziyyət: 'İşlənmiş', kredit: true, barter: false,
    təsvir: 'Yaxşı vəziyyətdə, tam xidmətli BMW 5 Series.',
    şəkillər: [img(0), img(1), img(2), img(3), img(4)],
    interyerŞəkillər: [interiorImg(0), interiorImg(1), interiorImg(2), interiorImg(3), interiorImg(4)],
    təchizatŞəkillər: [featureImg(0), featureImg(1), featureImg(2), featureImg(3), featureImg(4)],
    qapılarŞəkillər: [doorImg(0), doorImg(1), doorImg(2), doorImg(3), doorImg(4)],
    satıcıAd: 'Əli Hüseynov', satıcıZəng: '+994501234567', satıcıÜzvlükTarixi: '2025-06-01T00:00:00Z', baxışSayı: 1041, tarix: '2026-08-15T10:00:00Z', vipTier: 'premium_vip',
    həcm: 2998, güc: 340, sürətlərQutusu: 8, satıcıTipi: 'diler', yerlərSayı: 5, bazarÜçünYığılıb: 'Avropa', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['Yüngül lehimli disklər', 'ABS', 'Lyuk', 'Mərkəzi qapanma', 'Kondisioner', 'Oturacaqların isidilməsi', 'Dəri salon', 'Ksenon lampalar'],
  },
  {
    id: '2', marka: 'Mercedes', model: 'E200', il: 2020, qiymət: 51000, şəhər: 'Gəncə',
    yürüş: 60000, yanacaq: 'Dizel', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '2.0L',
    rəng: 'Ağ', vəziyyət: 'İşlənmiş', kredit: true, barter: true,
    təsvir: 'Şəxsi istifadə edilib, sənədləri tam.',
    şəkillər: [img(4), img(5), img(6), img(7), img(8)],
    interyerŞəkillər: [interiorImg(4), interiorImg(5), interiorImg(6), interiorImg(7), interiorImg(8)],
    təchizatŞəkillər: [featureImg(4), featureImg(5), featureImg(6), featureImg(7), featureImg(8)],
    qapılarŞəkillər: [doorImg(4), doorImg(5), doorImg(6), doorImg(7), doorImg(8)],
    satıcıAd: 'Fatima Qasımova', satıcıZəng: '+994551234567', satıcıÜzvlükTarixi: '2022-03-01T00:00:00Z', baxışSayı: 2250, tarix: '2026-08-14T14:30:00Z', vipTier: 'vip',
    həcm: 1991, güc: 197, sürətlərQutusu: 9, satıcıTipi: 'şəxsi', yerlərSayı: 5, bazarÜçünYığılıb: 'Avropa', vuruğuVar: false, rənglənib: true, qəzalı: false, təchizat: ['Yüngül lehimli disklər', 'ABS', 'Yağış sensoru', 'Kondisioner', 'Arxa görüntü kamerası'],
  },
  {
    id: '3', marka: 'Toyota', model: 'Camry', il: 2019, qiymət: 38900, şəhər: 'Bakı',
    yürüş: 80000, yanacaq: 'Hibrid', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '2.5L',
    rəng: 'Gümüş', vəziyyət: 'İşlənmiş', kredit: false, barter: false,
    təsvir: 'Ekonomik hibrid mühərrik, az yanacaq sərfi.',
    şəkillər: [img(8), img(9), img(10), img(11), img(12)],
    interyerŞəkillər: [interiorImg(8), interiorImg(9), interiorImg(10), interiorImg(11), interiorImg(12)],
    təchizatŞəkillər: [featureImg(8), featureImg(9), featureImg(10), featureImg(11), featureImg(12)],
    qapılarŞəkillər: [doorImg(8), doorImg(9), doorImg(10), doorImg(11), doorImg(12)],
    satıcıAd: 'Rəşad Məmmədov', satıcıZəng: '+994701234567', satıcıÜzvlükTarixi: '2025-12-01T00:00:00Z', baxışSayı: 2379, tarix: '2026-08-13T09:00:00Z', vipTier: 'standart',
    həcm: 2487, güc: 208, sürətlərQutusu: 8, satıcıTipi: 'diler', yerlərSayı: 5, bazarÜçünYığılıb: 'ABŞ', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['ABS', 'Yağış sensoru', 'Kondisioner', 'İşıq sensoru', 'Start-stop'],
  },
  {
    id: '4', marka: 'Hyundai', model: 'Sonata', il: 2018, qiymət: 29200, şəhər: 'Sumqayıt',
    yürüş: 95000, yanacaq: 'Benzin', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '2.0L',
    rəng: 'Mavi', vəziyyət: 'İşlənmiş', kredit: true, barter: false,
    təsvir: 'Ailə avtomobili, qəza olmayıb.',
    şəkillər: [img(12), img(13), img(14), img(15), img(16)],
    interyerŞəkillər: [interiorImg(12), interiorImg(13), interiorImg(14), interiorImg(15), interiorImg(16)],
    təchizatŞəkillər: [featureImg(12), featureImg(13), featureImg(14), featureImg(15), featureImg(16)],
    qapılarŞəkillər: [doorImg(12), doorImg(13), doorImg(14), doorImg(15), doorImg(16)],
    satıcıAd: 'Aygün Əliyeva', satıcıZəng: '+994551112233', satıcıÜzvlükTarixi: '2025-06-01T00:00:00Z', baxışSayı: 2997, tarix: '2026-08-12T11:00:00Z', vipTier: 'standart',
    həcm: 1999, güc: 163, sürətlərQutusu: 6, satıcıTipi: 'şəxsi', yerlərSayı: 5, bazarÜçünYığılıb: 'Koreya', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['ABS', 'Mərkəzi qapanma', 'Kondisioner'],
  },
  {
    id: '5', marka: 'Audi', model: 'A6', il: 2022, qiymət: 68000, şəhər: 'Bakı',
    yürüş: 20000, yanacaq: 'Benzin', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '3.0L',
    rəng: 'Qara', vəziyyət: 'İşlənmiş', kredit: true, barter: true,
    təsvir: 'Tam full paket, quattro sistemi.',
    şəkillər: [img(16), img(17), img(18), img(19), img(20)],
    interyerŞəkillər: [interiorImg(16), interiorImg(17), interiorImg(18), interiorImg(19), interiorImg(20)],
    təchizatŞəkillər: [featureImg(16), featureImg(17), featureImg(18), featureImg(19), featureImg(20)],
    qapılarŞəkillər: [doorImg(16), doorImg(17), doorImg(18), doorImg(19), doorImg(20)],
    satıcıAd: 'Elvin Quliyev', satıcıZəng: '+994502223344', satıcıÜzvlükTarixi: '2023-10-01T00:00:00Z', baxışSayı: 3229, tarix: '2026-08-16T08:00:00Z', vipTier: 'premium_vip',
    həcm: 2995, güc: 340, sürətlərQutusu: 8, satıcıTipi: 'diler', yerlərSayı: 5, bazarÜçünYığılıb: 'Avropa', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['Yüngül lehimli disklər', 'ABS', 'Lyuk', 'Mərkəzi qapanma', 'Park radarı', 'Kondisioner', 'Oturacaqların isidilməsi', 'Dəri salon', 'Ksenon lampalar', 'Arxa görüntü kamerası', '360° kamera', 'Head-up displey'],
  },
  {
    id: '6', marka: 'Volkswagen', model: 'Passat', il: 2017, qiymət: 24500, şəhər: 'Bakı',
    yürüş: 110000, yanacaq: 'Dizel', ban: 'Sedan', ötürücü: 'Mexaniki', mühərrik: '2.0L',
    rəng: 'Ağ', vəziyyət: 'İşlənmiş', kredit: false, barter: false,
    təsvir: 'Etibarlı, az xərcli avtomobil.',
    şəkillər: [img(20), img(21), img(22), img(23), img(24)],
    interyerŞəkillər: [interiorImg(20), interiorImg(21), interiorImg(22), interiorImg(23), interiorImg(24)],
    təchizatŞəkillər: [featureImg(20), featureImg(21), featureImg(22), featureImg(23), featureImg(24)],
    qapılarŞəkillər: [doorImg(20), doorImg(21), doorImg(22), doorImg(23), doorImg(24)],
    satıcıAd: 'Kamran Nəsirov', satıcıZəng: '+994703334455', satıcıÜzvlükTarixi: '2024-05-01T00:00:00Z', baxışSayı: 2108, tarix: '2026-08-10T13:00:00Z', vipTier: 'standart',
    həcm: 1968, güc: 150, sürətlərQutusu: 6, satıcıTipi: 'şəxsi', yerlərSayı: 5, bazarÜçünYığılıb: 'Avropa', vuruğuVar: true, rənglənib: true, qəzalı: false, təchizat: ['ABS', 'Yağış sensoru', 'Kondisioner'],
  },
  {
    id: '7', marka: 'BMW', model: 'X5', il: 2020, qiymət: 89000, şəhər: 'Bakı',
    yürüş: 40000, yanacaq: 'Dizel', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '3.0L',
    rəng: 'Qara', vəziyyət: 'İşlənmiş', kredit: true, barter: true,
    təsvir: 'Premium SUV, tam təchizatlı.',
    şəkillər: [img(24), img(25), img(26), img(27), img(28)],
    interyerŞəkillər: [interiorImg(24), interiorImg(25), interiorImg(26), interiorImg(27), interiorImg(28)],
    təchizatŞəkillər: [featureImg(24), featureImg(25), featureImg(26), featureImg(27), featureImg(28)],
    qapılarŞəkillər: [doorImg(24), doorImg(25), doorImg(26), doorImg(27), doorImg(28)],
    satıcıAd: 'Nərmin Hacıyeva', satıcıZəng: '+994554445566', satıcıÜzvlükTarixi: '2025-06-01T00:00:00Z', baxışSayı: 3021, tarix: '2026-08-16T15:00:00Z', vipTier: 'vip',
    həcm: 2993, güc: 381, sürətlərQutusu: 8, satıcıTipi: 'diler', yerlərSayı: 5, bazarÜçünYığılıb: 'Avropa', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['Yüngül lehimli disklər', 'ABS', 'Lyuk', 'Mərkəzi qapanma', 'Kondisioner', 'Oturacaqların isidilməsi', 'Dəri salon', 'Ksenon lampalar', 'Arxa görüntü kamerası', '360° kamera'],
  },
  {
    id: '8', marka: 'Toyota', model: 'Land Cruiser', il: 2021, qiymət: 105000, şəhər: 'Gəncə',
    yürüş: 30000, yanacaq: 'Dizel', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '4.5L',
    rəng: 'Gümüş', vəziyyət: 'İşlənmiş', kredit: true, barter: false,
    təsvir: 'Güclü off-road imkanları, əla vəziyyətdə.',
    şəkillər: [img(28), img(29), img(30), img(31), img(32)],
    interyerŞəkillər: [interiorImg(28), interiorImg(29), interiorImg(30), interiorImg(31), interiorImg(32)],
    təchizatŞəkillər: [featureImg(28), featureImg(29), featureImg(30), featureImg(31), featureImg(32)],
    qapılarŞəkillər: [doorImg(28), doorImg(29), doorImg(30), doorImg(31), doorImg(32)],
    satıcıAd: 'Tural Abbasov', satıcıZəng: '+994505556677', satıcıÜzvlükTarixi: '2024-11-01T00:00:00Z', baxışSayı: 2846, tarix: '2026-08-11T10:00:00Z', vipTier: 'standart',
    həcm: 4461, güc: 309, sürətlərQutusu: 6, satıcıTipi: 'diler', yerlərSayı: 7, bazarÜçünYığılıb: 'ABŞ', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['ABS', 'Mərkəzi qapanma', 'Kondisioner', 'Oturacaqların isidilməsi', 'Arxa görüntü kamerası', 'Start-stop'],
  },
  {
    id: '9', marka: 'Mercedes', model: 'C200', il: 2023, qiymət: 62000, şəhər: 'Bakı',
    yürüş: 5000, yanacaq: 'Benzin', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '1.5L',
    rəng: 'Ağ', vəziyyət: 'Yeni', kredit: true, barter: false,
    təsvir: 'Demək olar ki, yeni, salon şəraiti.',
    şəkillər: [img(32), img(33), img(34), img(35), img(36)],
    interyerŞəkillər: [interiorImg(32), interiorImg(33), interiorImg(34), interiorImg(35), interiorImg(36)],
    təchizatŞəkillər: [featureImg(32), featureImg(33), featureImg(34), featureImg(35), featureImg(36)],
    qapılarŞəkillər: [doorImg(32), doorImg(33), doorImg(34), doorImg(35), doorImg(36)],
    satıcıAd: 'Sənan Vəliyev', satıcıZəng: '+994556667788', satıcıÜzvlükTarixi: '2023-10-01T00:00:00Z', baxışSayı: 2365, tarix: '2026-08-17T09:30:00Z', vipTier: 'premium_vip',
    həcm: 1497, güc: 204, sürətlərQutusu: 9, satıcıTipi: 'diler', yerlərSayı: 5, bazarÜçünYığılıb: 'Avropa', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['Yüngül lehimli disklər', 'ABS', 'Lyuk', 'Yağış sensoru', 'Mərkəzi qapanma', 'Kondisioner', 'Oturacaqların isidilməsi', 'Dəri salon', 'Ksenon lampalar', 'Arxa görüntü kamerası', 'Head-up displey', 'Start-stop'],
  },
  {
    id: '10', marka: 'Hyundai', model: 'Tucson', il: 2020, qiymət: 41000, şəhər: 'Lənkəran',
    yürüş: 55000, yanacaq: 'Benzin', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '2.0L',
    rəng: 'Qırmızı', vəziyyət: 'İşlənmiş', kredit: false, barter: true,
    təsvir: 'Kompakt SUV, şəhər içi üçün ideal.',
    şəkillər: [img(36), img(37), img(38), img(39), img(40)],
    interyerŞəkillər: [interiorImg(36), interiorImg(37), interiorImg(38), interiorImg(39), interiorImg(40)],
    təchizatŞəkillər: [featureImg(36), featureImg(37), featureImg(38), featureImg(39), featureImg(40)],
    qapılarŞəkillər: [doorImg(36), doorImg(37), doorImg(38), doorImg(39), doorImg(40)],
    satıcıAd: 'Günel İsmayılova', satıcıZəng: '+994707778899', satıcıÜzvlükTarixi: '2022-09-01T00:00:00Z', baxışSayı: 1968, tarix: '2026-08-09T12:00:00Z', vipTier: 'standart',
    həcm: 1999, güc: 181, sürətlərQutusu: 6, satıcıTipi: 'şəxsi', yerlərSayı: 5, bazarÜçünYığılıb: 'Koreya', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['ABS', 'Mərkəzi qapanma', 'Kondisioner', 'Arxa görüntü kamerası'],
  },
  {
    id: '11', marka: 'Audi', model: 'Q7', il: 2019, qiymət: 78000, şəhər: 'Bakı',
    yürüş: 65000, yanacaq: 'Dizel', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '3.0L',
    rəng: 'Qara', vəziyyət: 'İşlənmiş', kredit: true, barter: true,
    təsvir: '7 yerli, ailə üçün geniş SUV.',
    şəkillər: [img(40), img(41), img(42), img(43), img(44)],
    interyerŞəkillər: [interiorImg(40), interiorImg(41), interiorImg(42), interiorImg(43), interiorImg(44)],
    təchizatŞəkillər: [featureImg(40), featureImg(41), featureImg(42), featureImg(43), featureImg(44)],
    qapılarŞəkillər: [doorImg(40), doorImg(41), doorImg(42), doorImg(43), doorImg(44)],
    satıcıAd: 'Orxan Bayramov', satıcıZəng: '+994508889900', satıcıÜzvlükTarixi: '2020-01-01T00:00:00Z', baxışSayı: 1744, tarix: '2026-08-15T17:00:00Z', vipTier: 'vip',
    həcm: 2967, güc: 333, sürətlərQutusu: 8, satıcıTipi: 'diler', yerlərSayı: 7, bazarÜçünYığılıb: 'Avropa', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['Yüngül lehimli disklər', 'ABS', 'Lyuk', 'Mərkəzi qapanma', 'Kondisioner', 'Oturacaqların isidilməsi', 'Dəri salon', 'Ksenon lampalar', 'Arxa görüntü kamerası', '360° kamera'],
  },
  {
    id: '12', marka: 'Volkswagen', model: 'Tiguan', il: 2018, qiymət: 33000, şəhər: 'Sumqayıt',
    yürüş: 85000, yanacaq: 'Benzin', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '1.4L',
    rəng: 'Mavi', vəziyyət: 'İşlənmiş', kredit: false, barter: false,
    təsvir: 'Yaxşı yanacaq sərfi, rahat idarəetmə.',
    şəkillər: [img(44), img(45), img(46), img(47), img(48)],
    interyerŞəkillər: [interiorImg(44), interiorImg(45), interiorImg(46), interiorImg(47), interiorImg(48)],
    təchizatŞəkillər: [featureImg(44), featureImg(45), featureImg(46), featureImg(47), featureImg(48)],
    qapılarŞəkillər: [doorImg(44), doorImg(45), doorImg(46), doorImg(47), doorImg(48)],
    satıcıAd: 'Leyla Rzayeva', satıcıZəng: '+994559990011', satıcıÜzvlükTarixi: '2023-04-01T00:00:00Z', baxışSayı: 2119, tarix: '2026-08-08T14:00:00Z', vipTier: 'standart',
    həcm: 1395, güc: 150, sürətlərQutusu: 6, satıcıTipi: 'şəxsi', yerlərSayı: 5, bazarÜçünYığılıb: 'Avropa', vuruğuVar: true, rənglənib: false, qəzalı: true, təchizat: ['ABS', 'Mərkəzi qapanma', 'Kondisioner'],
  },
];
