export type VIPTier = 'standart' | 'vip' | 'premium_vip';
export type SubscriptionPlan = 'free' | 'business';

export type SatıcıTipi = 'diler' | 'şəxsi';

export interface Listing {
  id: string;
  marka: string;
  model: string;
  il: number;
  qiymət: number;
  şəhər: string;
  yürüş: number;
  yanacaq: 'Benzin' | 'Dizel' | 'Hibrid' | 'Elektrik';
  ban: string;
  ötürücü: string;
  mühərrik: string;
  rəng: string;
  vəziyyət: 'Yeni' | 'İşlənmiş';
  kredit: boolean;
  barter: boolean;
  təsvir: string;
  şəkillər: string[];
  satıcıAd: string;
  satıcıZəng: string;
  satıcıÜzvlükTarixi: string;
  tarix: string;
  baxışSayı: number;
  vipTier: VIPTier;

  // Advanced ("Daha çox filtr") fields
  həcm: number; // sm³
  güc: number; // a.g. (horsepower)
  sürətlərQutusu: number;
  satıcıTipi: SatıcıTipi;
  yerlərSayı: number;
  bazarÜçünYığılıb: string;
  vuruğuVar: boolean;
  rənglənib: boolean;
  qəzalı: boolean;
  təchizat: string[];
}

export interface User {
  id: string;
  ad: string;
  zəng: string;
  subscriptionPlan: SubscriptionPlan;
  elanlarSayı: number;
  məhdudiyyət: number;
}

export interface Plan {
  id: string;
  ad: string;
  təsvir: string;
  qiymət: number;
  xüsusiyyətlər: string[];
  tip: 'subscription' | 'vip_tier';
}

export interface CheckoutPayload {
  planId: string;
  paymentMethod: 'apple_pay' | 'google_pay' | 'card';
  cardDetails?: {
    nömrə: string;
    tarix: string;
    cvv: string;
    ad: string;
  };
}
