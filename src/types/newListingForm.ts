export type Kateqoriya = 'Minik' | 'Kommersiya' | 'Moto';

export interface NewListingFormState {
  kateqoriya: Kateqoriya | null;
  marka: string;
  model: string;
  il: number | null;
  ban: string;
  nəsil: string;
  mühərrikNövü: string;
  ötürücü: string;
  sürətlərQutusu: string;
  modifikasiya: string;
  yerlərSayı: number | null;
  rəng: string | null;
  bazarÜçünYığılıb: string;
  yürüş: string;
  yürüşVahidi: 'km' | 'mil';
  şəkillər: File[];
  təchizat: string[];
  vuruğuVar: boolean;
  rənglənib: boolean;
  qəzalı: boolean;
  vinKod: string;
  əlavəMəlumat: string;
  şəhər: string;
  qiymət: string;
  valyuta: 'AZN' | 'USD';
  kreditlə: boolean;
  barterMümkündür: boolean;
  ad: string;
  email: string;
  telefon: string;
}

export const initialNewListingForm: NewListingFormState = {
  kateqoriya: null,
  marka: '',
  model: '',
  il: null,
  ban: '',
  nəsil: '',
  mühərrikNövü: '',
  ötürücü: '',
  sürətlərQutusu: '',
  modifikasiya: '',
  yerlərSayı: null,
  rəng: null,
  bazarÜçünYığılıb: '',
  yürüş: '',
  yürüşVahidi: 'km',
  şəkillər: [],
  təchizat: [],
  vuruğuVar: false,
  rənglənib: false,
  qəzalı: false,
  vinKod: '',
  əlavəMəlumat: '',
  şəhər: 'Bakı',
  qiymət: '',
  valyuta: 'AZN',
  kreditlə: false,
  barterMümkündür: false,
  ad: '',
  email: '',
  telefon: '',
};
