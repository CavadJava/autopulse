import type { Listing } from '../../types';

// Curated Unsplash car photography, reused across a few listings for variety without a real media pipeline.
const CAR_PHOTOS = [
  'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80',
  'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&q=80',
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80',
  'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&q=80',
  'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&q=80',
  'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&q=80',
  'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80',
  'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800&q=80',
];

// Real interior shots (dashboard/seats/steering wheel), separate from the
// exterior pool above, so the Interior tab shows genuine cabin photography
// instead of reusing exterior shots.
const INTERIOR_PHOTOS = [
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80&interior=1',
  'https://images.unsplash.com/photo-1583267746897-2cf415887172?w=800&q=80',
  'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&q=80&interior=1',
  'https://images.unsplash.com/photo-1541348263662-e068662d82af?w=800&q=80',
  'https://images.unsplash.com/photo-1552519507-27fb0e0b6d9e?w=800&q=80',
  'https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=800&q=80',
];

// Close-up feature/detail shots (wheels, lights, badges) for the Key features tab.
const FEATURE_PHOTOS = [
  'https://images.unsplash.com/photo-1568605117276-5aed155ccf7c?w=800&q=80',
  'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&q=80&feature=1',
  'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800&q=80',
  'https://images.unsplash.com/photo-1494905998402-395d579af36f?w=800&q=80',
];

// Side/door-profile shots for the Doors tab.
const DOOR_PHOTOS = [
  'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&q=80',
  'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800&q=80&doors=1',
  'https://images.unsplash.com/photo-1542362567-b07e54358753?w=800&q=80',
];

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
    şəkillər: [img(0), img(1), img(2)],
    interyerŞəkillər: [interiorImg(0), interiorImg(1)],
    təchizatŞəkillər: [featureImg(0), featureImg(1), featureImg(2)],
    qapılarŞəkillər: [doorImg(0), doorImg(1)],
    satıcıAd: 'Əli Hüseynov', satıcıZəng: '+994501234567', satıcıÜzvlükTarixi: '2025-06-01T00:00:00Z', baxışSayı: 1041, tarix: '2026-08-15T10:00:00Z', vipTier: 'premium_vip',
    həcm: 2998, güc: 340, sürətlərQutusu: 8, satıcıTipi: 'diler', yerlərSayı: 5, bazarÜçünYığılıb: 'Avropa', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['Yüngül lehimli disklər', 'ABS', 'Lyuk', 'Mərkəzi qapanma', 'Kondisioner', 'Oturacaqların isidilməsi', 'Dəri salon', 'Ksenon lampalar'],
  },
  {
    id: '2', marka: 'Mercedes', model: 'E200', il: 2020, qiymət: 51000, şəhər: 'Gəncə',
    yürüş: 60000, yanacaq: 'Dizel', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '2.0L',
    rəng: 'Ağ', vəziyyət: 'İşlənmiş', kredit: true, barter: true,
    təsvir: 'Şəxsi istifadə edilib, sənədləri tam.',
    şəkillər: [img(3), img(4)],
    interyerŞəkillər: [interiorImg(2), interiorImg(3)],
    təchizatŞəkillər: [featureImg(3), featureImg(4), featureImg(5)],
    qapılarŞəkillər: [doorImg(2), doorImg(3)],
    satıcıAd: 'Fatima Qasımova', satıcıZəng: '+994551234567', satıcıÜzvlükTarixi: '2022-03-01T00:00:00Z', baxışSayı: 2250, tarix: '2026-08-14T14:30:00Z', vipTier: 'vip',
    həcm: 1991, güc: 197, sürətlərQutusu: 9, satıcıTipi: 'şəxsi', yerlərSayı: 5, bazarÜçünYığılıb: 'Avropa', vuruğuVar: false, rənglənib: true, qəzalı: false, təchizat: ['Yüngül lehimli disklər', 'ABS', 'Yağış sensoru', 'Kondisioner', 'Arxa görüntü kamerası'],
  },
  {
    id: '3', marka: 'Toyota', model: 'Camry', il: 2019, qiymət: 38900, şəhər: 'Bakı',
    yürüş: 80000, yanacaq: 'Hibrid', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '2.5L',
    rəng: 'Gümüş', vəziyyət: 'İşlənmiş', kredit: false, barter: false,
    təsvir: 'Ekonomik hibrid mühərrik, az yanacaq sərfi.',
    şəkillər: [img(5), img(6)],
    interyerŞəkillər: [interiorImg(4), interiorImg(5)],
    təchizatŞəkillər: [featureImg(6), featureImg(7), featureImg(8)],
    qapılarŞəkillər: [doorImg(4), doorImg(5)],
    satıcıAd: 'Rəşad Məmmədov', satıcıZəng: '+994701234567', satıcıÜzvlükTarixi: '2025-12-01T00:00:00Z', baxışSayı: 2379, tarix: '2026-08-13T09:00:00Z', vipTier: 'standart',
    həcm: 2487, güc: 208, sürətlərQutusu: 8, satıcıTipi: 'diler', yerlərSayı: 5, bazarÜçünYığılıb: 'ABŞ', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['ABS', 'Yağış sensoru', 'Kondisioner', 'İşıq sensoru', 'Start-stop'],
  },
  {
    id: '4', marka: 'Hyundai', model: 'Sonata', il: 2018, qiymət: 29200, şəhər: 'Sumqayıt',
    yürüş: 95000, yanacaq: 'Benzin', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '2.0L',
    rəng: 'Mavi', vəziyyət: 'İşlənmiş', kredit: true, barter: false,
    təsvir: 'Ailə avtomobili, qəza olmayıb.',
    şəkillər: [img(7)],
    interyerŞəkillər: [interiorImg(6), interiorImg(7)],
    təchizatŞəkillər: [featureImg(9), featureImg(10), featureImg(11)],
    qapılarŞəkillər: [doorImg(6), doorImg(7)],
    satıcıAd: 'Aygün Əliyeva', satıcıZəng: '+994551112233', satıcıÜzvlükTarixi: '2025-06-01T00:00:00Z', baxışSayı: 2997, tarix: '2026-08-12T11:00:00Z', vipTier: 'standart',
    həcm: 1999, güc: 163, sürətlərQutusu: 6, satıcıTipi: 'şəxsi', yerlərSayı: 5, bazarÜçünYığılıb: 'Koreya', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['ABS', 'Mərkəzi qapanma', 'Kondisioner'],
  },
  {
    id: '5', marka: 'Audi', model: 'A6', il: 2022, qiymət: 68000, şəhər: 'Bakı',
    yürüş: 20000, yanacaq: 'Benzin', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '3.0L',
    rəng: 'Qara', vəziyyət: 'İşlənmiş', kredit: true, barter: true,
    təsvir: 'Tam full paket, quattro sistemi.',
    şəkillər: [img(8), img(9), img(10)],
    interyerŞəkillər: [interiorImg(8), interiorImg(9)],
    təchizatŞəkillər: [featureImg(12), featureImg(13), featureImg(14)],
    qapılarŞəkillər: [doorImg(8), doorImg(9)],
    satıcıAd: 'Elvin Quliyev', satıcıZəng: '+994502223344', satıcıÜzvlükTarixi: '2023-10-01T00:00:00Z', baxışSayı: 3229, tarix: '2026-08-16T08:00:00Z', vipTier: 'premium_vip',
    həcm: 2995, güc: 340, sürətlərQutusu: 8, satıcıTipi: 'diler', yerlərSayı: 5, bazarÜçünYığılıb: 'Avropa', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['Yüngül lehimli disklər', 'ABS', 'Lyuk', 'Mərkəzi qapanma', 'Park radarı', 'Kondisioner', 'Oturacaqların isidilməsi', 'Dəri salon', 'Ksenon lampalar', 'Arxa görüntü kamerası', '360° kamera', 'Head-up displey'],
  },
  {
    id: '6', marka: 'Volkswagen', model: 'Passat', il: 2017, qiymət: 24500, şəhər: 'Bakı',
    yürüş: 110000, yanacaq: 'Dizel', ban: 'Sedan', ötürücü: 'Mexaniki', mühərrik: '2.0L',
    rəng: 'Ağ', vəziyyət: 'İşlənmiş', kredit: false, barter: false,
    təsvir: 'Etibarlı, az xərcli avtomobil.',
    şəkillər: [img(11)],
    interyerŞəkillər: [interiorImg(10), interiorImg(11)],
    təchizatŞəkillər: [featureImg(15), featureImg(16), featureImg(17)],
    qapılarŞəkillər: [doorImg(10), doorImg(11)],
    satıcıAd: 'Kamran Nəsirov', satıcıZəng: '+994703334455', satıcıÜzvlükTarixi: '2024-05-01T00:00:00Z', baxışSayı: 2108, tarix: '2026-08-10T13:00:00Z', vipTier: 'standart',
    həcm: 1968, güc: 150, sürətlərQutusu: 6, satıcıTipi: 'şəxsi', yerlərSayı: 5, bazarÜçünYığılıb: 'Avropa', vuruğuVar: true, rənglənib: true, qəzalı: false, təchizat: ['ABS', 'Yağış sensoru', 'Kondisioner'],
  },
  {
    id: '7', marka: 'BMW', model: 'X5', il: 2020, qiymət: 89000, şəhər: 'Bakı',
    yürüş: 40000, yanacaq: 'Dizel', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '3.0L',
    rəng: 'Qara', vəziyyət: 'İşlənmiş', kredit: true, barter: true,
    təsvir: 'Premium SUV, tam təchizatlı.',
    şəkillər: [img(12), img(13)],
    interyerŞəkillər: [interiorImg(12), interiorImg(13)],
    təchizatŞəkillər: [featureImg(18), featureImg(19), featureImg(20)],
    qapılarŞəkillər: [doorImg(12), doorImg(13)],
    satıcıAd: 'Nərmin Hacıyeva', satıcıZəng: '+994554445566', satıcıÜzvlükTarixi: '2025-06-01T00:00:00Z', baxışSayı: 3021, tarix: '2026-08-16T15:00:00Z', vipTier: 'vip',
    həcm: 2993, güc: 381, sürətlərQutusu: 8, satıcıTipi: 'diler', yerlərSayı: 5, bazarÜçünYığılıb: 'Avropa', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['Yüngül lehimli disklər', 'ABS', 'Lyuk', 'Mərkəzi qapanma', 'Kondisioner', 'Oturacaqların isidilməsi', 'Dəri salon', 'Ksenon lampalar', 'Arxa görüntü kamerası', '360° kamera'],
  },
  {
    id: '8', marka: 'Toyota', model: 'Land Cruiser', il: 2021, qiymət: 105000, şəhər: 'Gəncə',
    yürüş: 30000, yanacaq: 'Dizel', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '4.5L',
    rəng: 'Gümüş', vəziyyət: 'İşlənmiş', kredit: true, barter: false,
    təsvir: 'Güclü off-road imkanları, əla vəziyyətdə.',
    şəkillər: [img(14)],
    interyerŞəkillər: [interiorImg(14), interiorImg(15)],
    təchizatŞəkillər: [featureImg(21), featureImg(22), featureImg(23)],
    qapılarŞəkillər: [doorImg(14), doorImg(15)],
    satıcıAd: 'Tural Abbasov', satıcıZəng: '+994505556677', satıcıÜzvlükTarixi: '2024-11-01T00:00:00Z', baxışSayı: 2846, tarix: '2026-08-11T10:00:00Z', vipTier: 'standart',
    həcm: 4461, güc: 309, sürətlərQutusu: 6, satıcıTipi: 'diler', yerlərSayı: 7, bazarÜçünYığılıb: 'ABŞ', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['ABS', 'Mərkəzi qapanma', 'Kondisioner', 'Oturacaqların isidilməsi', 'Arxa görüntü kamerası', 'Start-stop'],
  },
  {
    id: '9', marka: 'Mercedes', model: 'C200', il: 2023, qiymət: 62000, şəhər: 'Bakı',
    yürüş: 5000, yanacaq: 'Benzin', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '1.5L',
    rəng: 'Ağ', vəziyyət: 'Yeni', kredit: true, barter: false,
    təsvir: 'Demək olar ki, yeni, salon şəraiti.',
    şəkillər: [img(15), img(16)],
    interyerŞəkillər: [interiorImg(16), interiorImg(17)],
    təchizatŞəkillər: [featureImg(24), featureImg(25), featureImg(26)],
    qapılarŞəkillər: [doorImg(16), doorImg(17)],
    satıcıAd: 'Sənan Vəliyev', satıcıZəng: '+994556667788', satıcıÜzvlükTarixi: '2023-10-01T00:00:00Z', baxışSayı: 2365, tarix: '2026-08-17T09:30:00Z', vipTier: 'premium_vip',
    həcm: 1497, güc: 204, sürətlərQutusu: 9, satıcıTipi: 'diler', yerlərSayı: 5, bazarÜçünYığılıb: 'Avropa', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['Yüngül lehimli disklər', 'ABS', 'Lyuk', 'Yağış sensoru', 'Mərkəzi qapanma', 'Kondisioner', 'Oturacaqların isidilməsi', 'Dəri salon', 'Ksenon lampalar', 'Arxa görüntü kamerası', 'Head-up displey', 'Start-stop'],
  },
  {
    id: '10', marka: 'Hyundai', model: 'Tucson', il: 2020, qiymət: 41000, şəhər: 'Lənkəran',
    yürüş: 55000, yanacaq: 'Benzin', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '2.0L',
    rəng: 'Qırmızı', vəziyyət: 'İşlənmiş', kredit: false, barter: true,
    təsvir: 'Kompakt SUV, şəhər içi üçün ideal.',
    şəkillər: [img(17)],
    interyerŞəkillər: [interiorImg(18), interiorImg(19)],
    təchizatŞəkillər: [featureImg(27), featureImg(28), featureImg(29)],
    qapılarŞəkillər: [doorImg(18), doorImg(19)],
    satıcıAd: 'Günel İsmayılova', satıcıZəng: '+994707778899', satıcıÜzvlükTarixi: '2022-09-01T00:00:00Z', baxışSayı: 1968, tarix: '2026-08-09T12:00:00Z', vipTier: 'standart',
    həcm: 1999, güc: 181, sürətlərQutusu: 6, satıcıTipi: 'şəxsi', yerlərSayı: 5, bazarÜçünYığılıb: 'Koreya', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['ABS', 'Mərkəzi qapanma', 'Kondisioner', 'Arxa görüntü kamerası'],
  },
  {
    id: '11', marka: 'Audi', model: 'Q7', il: 2019, qiymət: 78000, şəhər: 'Bakı',
    yürüş: 65000, yanacaq: 'Dizel', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '3.0L',
    rəng: 'Qara', vəziyyət: 'İşlənmiş', kredit: true, barter: true,
    təsvir: '7 yerli, ailə üçün geniş SUV.',
    şəkillər: [img(18), img(19)],
    interyerŞəkillər: [interiorImg(20), interiorImg(21)],
    təchizatŞəkillər: [featureImg(30), featureImg(31), featureImg(32)],
    qapılarŞəkillər: [doorImg(20), doorImg(21)],
    satıcıAd: 'Orxan Bayramov', satıcıZəng: '+994508889900', satıcıÜzvlükTarixi: '2020-01-01T00:00:00Z', baxışSayı: 1744, tarix: '2026-08-15T17:00:00Z', vipTier: 'vip',
    həcm: 2967, güc: 333, sürətlərQutusu: 8, satıcıTipi: 'diler', yerlərSayı: 7, bazarÜçünYığılıb: 'Avropa', vuruğuVar: false, rənglənib: false, qəzalı: false, təchizat: ['Yüngül lehimli disklər', 'ABS', 'Lyuk', 'Mərkəzi qapanma', 'Kondisioner', 'Oturacaqların isidilməsi', 'Dəri salon', 'Ksenon lampalar', 'Arxa görüntü kamerası', '360° kamera'],
  },
  {
    id: '12', marka: 'Volkswagen', model: 'Tiguan', il: 2018, qiymət: 33000, şəhər: 'Sumqayıt',
    yürüş: 85000, yanacaq: 'Benzin', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '1.4L',
    rəng: 'Mavi', vəziyyət: 'İşlənmiş', kredit: false, barter: false,
    təsvir: 'Yaxşı yanacaq sərfi, rahat idarəetmə.',
    şəkillər: [img(20)],
    interyerŞəkillər: [interiorImg(22), interiorImg(23)],
    təchizatŞəkillər: [featureImg(33), featureImg(34), featureImg(35)],
    qapılarŞəkillər: [doorImg(22), doorImg(23)],
    satıcıAd: 'Leyla Rzayeva', satıcıZəng: '+994559990011', satıcıÜzvlükTarixi: '2023-04-01T00:00:00Z', baxışSayı: 2119, tarix: '2026-08-08T14:00:00Z', vipTier: 'standart',
    həcm: 1395, güc: 150, sürətlərQutusu: 6, satıcıTipi: 'şəxsi', yerlərSayı: 5, bazarÜçünYığılıb: 'Avropa', vuruğuVar: true, rənglənib: false, qəzalı: true, təchizat: ['ABS', 'Mərkəzi qapanma', 'Kondisioner'],
  },
];
