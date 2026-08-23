import type { AccountKind, PromoTier, SavedCard, User, UserListing, VIPTier } from '../types';
import { updateListing as updateMockListing } from './listings';

// Real HTTP client for the avtopulse-backend Go service's fərdi (individual)
// user endpoints — OTP login/session + "Mənim elanlarım" listing CRUD. This
// mirrors src/api/shop.ts's conventions (API_BASE, credentials: 'include',
// cache: 'no-store' on GETs, typed error classes). Business/biznes-account
// login and other still-mock utilities below remain untouched — they are
// out of this feature's scope.
const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

// Fixed prices, AZN — matches the İrəli çək / VIP / Premium tiles shown on
// the listing detail page and in Kabinet > Mənim elanlarım.
export const PROMO_PRICES: Record<PromoTier, number> = {
  ireli_cek: 3,
  vip: 5,
  premium_vip: 7,
};

export const PROMO_LABELS: Record<PromoTier, string> = {
  ireli_cek: 'İrəli çək',
  vip: 'VIP',
  premium_vip: 'Premium VIP',
};

function promoTierToVipTier(tier: PromoTier): VIPTier {
  return tier === 'ireli_cek' ? 'standart' : tier;
}

export interface BusinessLoginPayload {
  email: string;
  ünvan: string;
  parol: string;
}

export interface UserSummary {
  id: number;
  name: string;
  phone: string;
}

export interface UserProductImage {
  id: number;
  minioUrl: string;
  s3Url: string;
  sira: number;
}

export interface UserListingApi {
  id: number;
  userId: number;
  marka: string;
  model: string;
  il: number;
  qiymet: number;
  yurus: number;
  yanacaq: string;
  ban: string;
  title: string;
  details: string;
  status: string;
  images: UserProductImage[];
}

export interface CreateListingInput {
  marka: string;
  model: string;
  il: number;
  qiymet: number;
  yurus: number;
  yanacaq: string;
  ban: string;
  title: string;
  details: string;
}

export class UserUnauthorizedError extends Error {}
export class UserOtpError extends Error {}

function summaryToUser(summary: UserSummary): User {
  return {
    id: String(summary.id),
    ad: summary.name,
    hesabTipi: 'fərdi',
    zəng: summary.phone,
    subscriptionPlan: 'free',
    elanlarSayı: 0,
    məhdudiyyət: 5,
    balans: 0,
  };
}

export async function requestOtp(phone: string): Promise<{ sent: boolean }> {
  const res = await fetch(`${API_BASE}/api/users/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    throw new Error(`requestOtp failed: ${res.status}`);
  }
  return res.json();
}

export async function verifyOtp(phone: string, code: string): Promise<User> {
  const res = await fetch(`${API_BASE}/api/users/otp/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  if (res.status === 401) {
    throw new UserOtpError('Kod yanlışdır');
  }
  if (!res.ok) {
    throw new Error(`verifyOtp failed: ${res.status}`);
  }
  const data = await res.json();
  return summaryToUser(data.user as UserSummary);
}

export async function userLogout(): Promise<void> {
  await fetch(`${API_BASE}/api/users/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export function apiListingToUserListing(l: UserListingApi): UserListing {
  return {
    id: String(l.id),
    listingId: String(l.id),
    başlıq: l.title,
    qiymət: l.qiymet,
    şəkil: l.images?.[0]?.minioUrl ?? '',
    status: apiStatusToLocal(l.status),
    tarix: '',
    vipTier: 'standart',
  };
}

// Backend statuses (gozlemede/saytda/legv_edilib) → the app's existing
// İstifadəçiElanStatusu union used across UI (Kabinet, badges, filters).
function apiStatusToLocal(status: string): UserListing['status'] {
  switch (status) {
    case 'saytda':
      return 'saytda';
    case 'gozlemede':
      return 'gözləmədə';
    case 'legv_edilib':
      return 'imtina_olunub';
    default:
      return 'gözləmədə';
  }
}

export async function getMyListings(): Promise<UserListingApi[]> {
  const res = await fetch(`${API_BASE}/api/users/me/products`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new UserUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getMyListings failed: ${res.status}`);
  }
  return res.json();
}

export async function createListing(input: CreateListingInput): Promise<UserListingApi> {
  const res = await fetch(`${API_BASE}/api/users/me/products`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 401) {
    throw new UserUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`createListing failed: ${res.status}`);
  }
  return res.json();
}

export async function updateUserListing(id: number, input: CreateListingInput): Promise<UserListingApi> {
  const res = await fetch(`${API_BASE}/api/users/me/products/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 401) {
    throw new UserUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`updateUserListing failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteUserListing(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users/me/products/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new UserUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`deleteUserListing failed: ${res.status}`);
  }
}

export async function uploadListingImages(listingId: number, files: File[]): Promise<UserProductImage[]> {
  const form = new FormData();
  files.forEach((file) => form.append('images', file));

  const res = await fetch(`${API_BASE}/api/users/me/products/${listingId}/images`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (res.status === 401) {
    throw new UserUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`uploadListingImages failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Everything below remains mock-backed — biznes-account login and other
// features not in this plan's scope (later phase). Left intentionally
// unchanged so still-working code isn't deleted.
// ---------------------------------------------------------------------------

function buildBiznesUser(payload: BusinessLoginPayload): User {
  return {
    id: 'user-biznes-1',
    ad: 'Demo Biznes',
    hesabTipi: 'biznes',
    email: payload.email,
    ünvan: payload.ünvan,
    subscriptionPlan: 'business',
    elanlarSayı: 15,
    məhdudiyyət: 9999,
    balans: 0,
  };
}

export async function loginBusiness(payload: BusinessLoginPayload): Promise<User> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!payload.email || !payload.ünvan || !payload.parol) {
    throw new Error('E-mail, ünvan və parol tələb olunur.');
  }
  // Mock: any non-empty password is accepted — a real backend would verify it.
  return buildBiznesUser(payload);
}

// Mock promotable listings, keyed by account type — this is the same seed
// data the old getMyListings(hesabTipi) used to read. Fərdi's "Mənim
// elanlarım" page now reads real backend listings instead (see
// getMyListings() above), but ListingDetail.tsx's "reklam et" flow still
// promotes generic mock Listing records (from src/api/listings.ts) for any
// logged-in account type, so both keys are kept intact here.
const mockUserListingsByAccount: Record<AccountKind, UserListing[]> = {
  fərdi: [
    {
      id: 'ul-1',
      listingId: '1',
      başlıq: 'BMW 5 Series, 2021',
      qiymət: 42500,
      şəkil: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=400&q=80',
      status: 'saytda',
      tarix: '2026-08-17T21:12:00Z',
      vipTier: 'standart',
    },
    {
      id: 'ul-2',
      listingId: '2',
      başlıq: 'Mercedes E200, 2020',
      qiymət: 51000,
      şəkil: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&q=80',
      status: 'imtina_olunub',
      tarix: '2026-08-04T15:53:00Z',
      vipTier: 'standart',
    },
  ],
  biznes: [
    {
      id: 'ul-3',
      listingId: '5',
      başlıq: 'Audi A6, 2022',
      qiymət: 68000,
      şəkil: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=400&q=80',
      status: 'saytda',
      tarix: '2026-08-16T08:00:00Z',
      vipTier: 'premium_vip',
    },
  ],
};

export async function getMyCards(): Promise<SavedCard[]> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return [];
}

export async function topUpBalance(_amount: number): Promise<{ success: true }> {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return { success: true };
}

// Mock balance-funded promotion — mutates the in-memory user-listing record so the
// new tier badge sticks for the rest of the session. Balance itself is deducted by
// the caller via AuthContext (single source of truth for the logged-in user object).
export async function promoteListing(
  hesabTipi: AccountKind,
  listingId: string,
  tier: PromoTier
): Promise<UserListing> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  const listings = mockUserListingsByAccount[hesabTipi];
  const idx = listings.findIndex((l) => l.listingId === listingId);
  if (idx === -1) {
    throw new Error('Elan tapılmadı.');
  }
  const nextVipTier = promoTierToVipTier(tier);
  listings[idx] = { ...listings[idx], vipTier: nextVipTier };
  await updateMockListing(listingId, { vipTier: nextVipTier }).catch(() => {
    // Listing may not exist in mockListings (e.g. seeded only as a UserListing) — non-fatal.
  });
  return listings[idx];
}
