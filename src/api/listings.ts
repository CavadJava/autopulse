import type { Listing } from '../types';
import { mockListings } from './mockData/listings';

export interface ListingFilters {
  marka?: string;
  şəhər?: string;
  qiymətMin?: number;
  qiymətMax?: number;
  yanacaq?: string;
  ban?: string;
  ötürücü?: string;
  rəng?: string;
  vəziyyət?: string;
  kredit?: boolean;
  barter?: boolean;
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
