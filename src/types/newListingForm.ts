export type Kateqoriya = 'Minik' | 'Kommersiya' | 'Moto';

// Unifies existing (already-uploaded, URL-backed) photos with newly-picked local Files
// so the same array can be drag-reordered and rendered regardless of source.
export type ListingPhoto =
  | { id: string; kind: 'existing'; url: string }
  | { id: string; kind: 'new'; file: File };

export function photoPreviewUrl(photo: ListingPhoto): string {
  return photo.kind === 'existing' ? photo.url : URL.createObjectURL(photo.file);
}

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
  şəkillər: ListingPhoto[];
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
