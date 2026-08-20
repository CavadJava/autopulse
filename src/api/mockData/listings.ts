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

const img = (index: number) => CAR_PHOTOS[index % CAR_PHOTOS.length];

export const mockListings: Listing[] = [
  {
    id: '1', marka: 'BMW', model: '5 Series', il: 2021, qiymət: 42500, şəhər: 'Bakı',
    yürüş: 45000, yanacaq: 'Benzin', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '2.0L',
    rəng: 'Qara', vəziyyət: 'İşlənmiş', kredit: true, barter: false,
    təsvir: 'Yaxşı vəziyyətdə, tam xidmətli BMW 5 Series.',
    şəkillər: [img(0), img(1), img(2)],
    satıcıAd: 'Əli Hüseynov', satıcıZəng: '+994501234567', tarix: '2026-08-15T10:00:00Z', vipTier: 'premium_vip',
  },
  {
    id: '2', marka: 'Mercedes', model: 'E200', il: 2020, qiymət: 51000, şəhər: 'Gəncə',
    yürüş: 60000, yanacaq: 'Dizel', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '2.0L',
    rəng: 'Ağ', vəziyyət: 'İşlənmiş', kredit: true, barter: true,
    təsvir: 'Şəxsi istifadə edilib, sənədləri tam.',
    şəkillər: [img(3), img(4)],
    satıcıAd: 'Fatima Qasımova', satıcıZəng: '+994551234567', tarix: '2026-08-14T14:30:00Z', vipTier: 'vip',
  },
  {
    id: '3', marka: 'Toyota', model: 'Camry', il: 2019, qiymət: 38900, şəhər: 'Bakı',
    yürüş: 80000, yanacaq: 'Hibrid', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '2.5L',
    rəng: 'Gümüş', vəziyyət: 'İşlənmiş', kredit: false, barter: false,
    təsvir: 'Ekonomik hibrid mühərrik, az yanacaq sərfi.',
    şəkillər: [img(5), img(6)],
    satıcıAd: 'Rəşad Məmmədov', satıcıZəng: '+994701234567', tarix: '2026-08-13T09:00:00Z', vipTier: 'standart',
  },
  {
    id: '4', marka: 'Hyundai', model: 'Sonata', il: 2018, qiymət: 29200, şəhər: 'Sumqayıt',
    yürüş: 95000, yanacaq: 'Benzin', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '2.0L',
    rəng: 'Mavi', vəziyyət: 'İşlənmiş', kredit: true, barter: false,
    təsvir: 'Ailə avtomobili, qəza olmayıb.',
    şəkillər: [img(7)],
    satıcıAd: 'Aygün Əliyeva', satıcıZəng: '+994551112233', tarix: '2026-08-12T11:00:00Z', vipTier: 'standart',
  },
  {
    id: '5', marka: 'Audi', model: 'A6', il: 2022, qiymət: 68000, şəhər: 'Bakı',
    yürüş: 20000, yanacaq: 'Benzin', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '3.0L',
    rəng: 'Qara', vəziyyət: 'İşlənmiş', kredit: true, barter: true,
    təsvir: 'Tam full paket, quattro sistemi.',
    şəkillər: [img(8), img(9), img(10)],
    satıcıAd: 'Elvin Quliyev', satıcıZəng: '+994502223344', tarix: '2026-08-16T08:00:00Z', vipTier: 'premium_vip',
  },
  {
    id: '6', marka: 'Volkswagen', model: 'Passat', il: 2017, qiymət: 24500, şəhər: 'Bakı',
    yürüş: 110000, yanacaq: 'Dizel', ban: 'Sedan', ötürücü: 'Mexaniki', mühərrik: '2.0L',
    rəng: 'Ağ', vəziyyət: 'İşlənmiş', kredit: false, barter: false,
    təsvir: 'Etibarlı, az xərcli avtomobil.',
    şəkillər: [img(11)],
    satıcıAd: 'Kamran Nəsirov', satıcıZəng: '+994703334455', tarix: '2026-08-10T13:00:00Z', vipTier: 'standart',
  },
  {
    id: '7', marka: 'BMW', model: 'X5', il: 2020, qiymət: 89000, şəhər: 'Bakı',
    yürüş: 40000, yanacaq: 'Dizel', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '3.0L',
    rəng: 'Qara', vəziyyət: 'İşlənmiş', kredit: true, barter: true,
    təsvir: 'Premium SUV, tam təchizatlı.',
    şəkillər: [img(12), img(13)],
    satıcıAd: 'Nərmin Hacıyeva', satıcıZəng: '+994554445566', tarix: '2026-08-16T15:00:00Z', vipTier: 'vip',
  },
  {
    id: '8', marka: 'Toyota', model: 'Land Cruiser', il: 2021, qiymət: 105000, şəhər: 'Gəncə',
    yürüş: 30000, yanacaq: 'Dizel', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '4.5L',
    rəng: 'Gümüş', vəziyyət: 'İşlənmiş', kredit: true, barter: false,
    təsvir: 'Güclü off-road imkanları, əla vəziyyətdə.',
    şəkillər: [img(14)],
    satıcıAd: 'Tural Abbasov', satıcıZəng: '+994505556677', tarix: '2026-08-11T10:00:00Z', vipTier: 'standart',
  },
  {
    id: '9', marka: 'Mercedes', model: 'C200', il: 2023, qiymət: 62000, şəhər: 'Bakı',
    yürüş: 5000, yanacaq: 'Benzin', ban: 'Sedan', ötürücü: 'Avtomatik', mühərrik: '1.5L',
    rəng: 'Ağ', vəziyyət: 'Yeni', kredit: true, barter: false,
    təsvir: 'Demək olar ki, yeni, salon şəraiti.',
    şəkillər: [img(15), img(16)],
    satıcıAd: 'Sənan Vəliyev', satıcıZəng: '+994556667788', tarix: '2026-08-17T09:30:00Z', vipTier: 'premium_vip',
  },
  {
    id: '10', marka: 'Hyundai', model: 'Tucson', il: 2020, qiymət: 41000, şəhər: 'Lənkəran',
    yürüş: 55000, yanacaq: 'Benzin', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '2.0L',
    rəng: 'Qırmızı', vəziyyət: 'İşlənmiş', kredit: false, barter: true,
    təsvir: 'Kompakt SUV, şəhər içi üçün ideal.',
    şəkillər: [img(17)],
    satıcıAd: 'Günel İsmayılova', satıcıZəng: '+994707778899', tarix: '2026-08-09T12:00:00Z', vipTier: 'standart',
  },
  {
    id: '11', marka: 'Audi', model: 'Q7', il: 2019, qiymət: 78000, şəhər: 'Bakı',
    yürüş: 65000, yanacaq: 'Dizel', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '3.0L',
    rəng: 'Qara', vəziyyət: 'İşlənmiş', kredit: true, barter: true,
    təsvir: '7 yerli, ailə üçün geniş SUV.',
    şəkillər: [img(18), img(19)],
    satıcıAd: 'Orxan Bayramov', satıcıZəng: '+994508889900', tarix: '2026-08-15T17:00:00Z', vipTier: 'vip',
  },
  {
    id: '12', marka: 'Volkswagen', model: 'Tiguan', il: 2018, qiymət: 33000, şəhər: 'Sumqayıt',
    yürüş: 85000, yanacaq: 'Benzin', ban: 'SUV', ötürücü: 'Avtomatik', mühərrik: '1.4L',
    rəng: 'Mavi', vəziyyət: 'İşlənmiş', kredit: false, barter: false,
    təsvir: 'Yaxşı yanacaq sərfi, rahat idarəetmə.',
    şəkillər: [img(20)],
    satıcıAd: 'Leyla Rzayeva', satıcıZəng: '+994559990011', tarix: '2026-08-08T14:00:00Z', vipTier: 'standart',
  },
];
