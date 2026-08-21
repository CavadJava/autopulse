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

const DRAFT_STORAGE_KEY = 'autopulse.newListingDraft';

// File objects can't survive JSON serialization, so drafts only persist
// 'existing' (URL-backed) photos. Locally-picked files are lost across a
// page leave/return — the rest of the form (marka, model, spesifikasiyalar,
// qiymət, etc.) is what actually matters to restore.
type PersistableFormState = Omit<NewListingFormState, 'şəkillər'> & {
  şəkillər: Extract<ListingPhoto, { kind: 'existing' }>[];
};

export function saveDraft(form: NewListingFormState) {
  const persistable: PersistableFormState = {
    ...form,
    şəkillər: form.şəkillər.filter(
      (p): p is Extract<ListingPhoto, { kind: 'existing' }> => p.kind === 'existing'
    ),
  };
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    // sessionStorage can throw in private-browsing/quota-exceeded edge cases —
    // losing draft persistence isn't worth failing the whole form interaction.
  }
}

export function loadDraft(): NewListingFormState | null {
  try {
    const stored = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as NewListingFormState;
  } catch {
    return null;
  }
}

export function clearDraft() {
  sessionStorage.removeItem(DRAFT_STORAGE_KEY);
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
