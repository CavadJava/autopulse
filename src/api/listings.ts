import type { Listing, SatıcıTipi } from '../types';
import { mockListings } from './mockData/listings';

export interface ListingFilters {
  marka?: string;
  şəhər?: string;
  qiymətMin?: number;
  qiymətMax?: number;
  ilMin?: number;
  ilMax?: number;
  yanacaq?: string;
  ban?: string;
  ötürücü?: string;
  rəng?: string;
  vəziyyət?: string;
  kredit?: boolean;
  barter?: boolean;

  // Advanced ("Daha çox filtr") fields
  həcmMin?: number;
  həcmMax?: number;
  gücMin?: number;
  gücMax?: number;
  yürüşMax?: number;
  sürətlərQutusu?: number;
  satıcıTipi?: SatıcıTipi;
  yerlərSayı?: number;
  bazarÜçünYığılıb?: string;
  vuruğuVar?: boolean;
  rənglənib?: boolean;
  qəzalı?: boolean;
  təchizat?: string[];
}

export async function getListings(filters?: ListingFilters): Promise<Listing[]> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  let results = [...mockListings];

  if (filters?.marka) {
    results = results.filter((l) => l.marka.toLowerCase().includes(filters.marka!.toLowerCase()));
  }
  if (filters?.şəhər) {
    results = results.filter((l) => l.şəhər === filters.şəhər);
  }
  if (filters?.qiymətMin) {
    results = results.filter((l) => l.qiymət >= filters.qiymətMin!);
  }
  if (filters?.qiymətMax) {
    results = results.filter((l) => l.qiymət <= filters.qiymətMax!);
  }
  if (filters?.ilMin) {
    results = results.filter((l) => l.il >= filters.ilMin!);
  }
  if (filters?.ilMax) {
    results = results.filter((l) => l.il <= filters.ilMax!);
  }
  if (filters?.yanacaq) {
    results = results.filter((l) => l.yanacaq === filters.yanacaq);
  }
  if (filters?.ban) {
    results = results.filter((l) => l.ban === filters.ban);
  }
  if (filters?.ötürücü) {
    results = results.filter((l) => l.ötürücü === filters.ötürücü);
  }
  if (filters?.rəng) {
    results = results.filter((l) => l.rəng === filters.rəng);
  }
  if (filters?.vəziyyət) {
    results = results.filter((l) => l.vəziyyət === filters.vəziyyət);
  }
  if (filters?.kredit) {
    results = results.filter((l) => l.kredit === true);
  }
  if (filters?.barter) {
    results = results.filter((l) => l.barter === true);
  }

  // Advanced filters
  if (filters?.həcmMin) {
    results = results.filter((l) => l.həcm >= filters.həcmMin!);
  }
  if (filters?.həcmMax) {
    results = results.filter((l) => l.həcm <= filters.həcmMax!);
  }
  if (filters?.gücMin) {
    results = results.filter((l) => l.güc >= filters.gücMin!);
  }
  if (filters?.gücMax) {
    results = results.filter((l) => l.güc <= filters.gücMax!);
  }
  if (filters?.yürüşMax) {
    results = results.filter((l) => l.yürüş <= filters.yürüşMax!);
  }
  if (filters?.sürətlərQutusu) {
    results = results.filter((l) => l.sürətlərQutusu === filters.sürətlərQutusu);
  }
  if (filters?.satıcıTipi) {
    results = results.filter((l) => l.satıcıTipi === filters.satıcıTipi);
  }
  if (filters?.yerlərSayı) {
    results = results.filter((l) => l.yerlərSayı === filters.yerlərSayı);
  }
  if (filters?.bazarÜçünYığılıb) {
    results = results.filter((l) => l.bazarÜçünYığılıb === filters.bazarÜçünYığılıb);
  }
  if (filters?.vuruğuVar === false) {
    results = results.filter((l) => l.vuruğuVar === false);
  }
  if (filters?.rənglənib === false) {
    results = results.filter((l) => l.rənglənib === false);
  }
  if (filters?.qəzalı) {
    results = results.filter((l) => l.qəzalı === true);
  }
  if (filters?.təchizat && filters.təchizat.length > 0) {
    results = results.filter((l) => filters.təchizat!.every((t) => l.təchizat.includes(t)));
  }

  // Sort: Premium VIP first, then VIP, then Standart by date
  const tierOrder: Record<string, number> = { premium_vip: 0, vip: 1, standart: 2 };
  results.sort((a, b) => {
    const tierDiff = tierOrder[a.vipTier] - tierOrder[b.vipTier];
    if (tierDiff !== 0) return tierDiff;
    return new Date(b.tarix).getTime() - new Date(a.tarix).getTime();
  });

  return results;
}

export async function getListingById(id: string): Promise<Listing | null> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return mockListings.find((l) => l.id === id) || null;
}

// Mock update — mutates the in-memory mock array so the edit survives navigation
// within the session. A real backend would PATCH the listing server-side.
export async function updateListing(id: string, patch: Partial<Listing>): Promise<Listing> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const idx = mockListings.findIndex((l) => l.id === id);
  if (idx === -1) {
    throw new Error('Elan tapılmadı.');
  }
  mockListings[idx] = { ...mockListings[idx], ...patch };
  return mockListings[idx];
}

// --- Real backend API (Task 2: GET /api/listings, GET /api/listings/{source}/{id}) ---
// These are new, additive functions alongside the mock ones above; they fetch the
// real shop+user listings feed and do not affect the mock data path in any way.

const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

export interface ApiListingImage {
  minioUrl: string;
  s3Url: string;
  sira: number;
}

export interface ApiListing {
  source: 'shop' | 'user';
  id: number;
  marka: string;
  model: string;
  il: number;
  qiymet: number;
  yurus: number;
  yanacaq: string;
  ban: string;
  title: string;
  details: string;
  images: ApiListingImage[];
  sellerType: 'diler' | 'şəxsi';
  sellerName: string;
}

export async function getRealListings(): Promise<ApiListing[]> {
  const res = await fetch(`${API_BASE}/api/listings`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`getRealListings failed: ${res.status}`);
  }
  return res.json();
}

export async function getRealListingById(source: 'shop' | 'user', id: number): Promise<ApiListing | null> {
  const res = await fetch(`${API_BASE}/api/listings/${source}/${id}`, { cache: 'no-store' });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`getRealListingById failed: ${res.status}`);
  }
  return res.json();
}
