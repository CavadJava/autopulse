import type { AccountKind, PromoTier, SavedCard, User, UserListing, VIPTier } from '../types';
import { updateListing } from './listings';

const MOCK_OTP = '1234';

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

// In-memory mock "backend" — a real backend would issue/verify OTPs and sessions.
function buildFərdiUser(zəng: string): User {
  return {
    id: 'user-fərdi-1',
    ad: 'Demo İstifadəçi',
    hesabTipi: 'fərdi',
    zəng,
    subscriptionPlan: 'free',
    elanlarSayı: 2,
    məhdudiyyət: 5,
    balans: 0,
  };
}

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

export async function requestOtp(zəng: string): Promise<{ sent: true }> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  // Mock: always "sends" successfully. Real backend would rate-limit + dispatch SMS.
  console.log(`Mock SMS-kod ${zəng} nömrəsinə göndərildi: ${MOCK_OTP}`);
  return { sent: true };
}

export async function verifyOtp(zəng: string, code: string): Promise<User> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (code !== MOCK_OTP) {
    throw new Error('Yanlış kod. Yenidən cəhd edin.');
  }
  return buildFərdiUser(zəng);
}

export async function loginBusiness(payload: BusinessLoginPayload): Promise<User> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!payload.email || !payload.ünvan || !payload.parol) {
    throw new Error('E-mail, ünvan və parol tələb olunur.');
  }
  // Mock: any non-empty password is accepted — a real backend would verify it.
  return buildBiznesUser(payload);
}

// A physical person (fərdi) is the same underlying user regardless of which
// account mode they're currently viewing the site in — a biznes account is
// still that person, so "Mənim elanlarım" shows every elan they own, not a
// split-by-account-type subset. All mock elanlar therefore live in one
// shared list, independent of AccountKind.
const mockUserListings: UserListing[] = [
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
];

export async function getMyListings(_hesabTipi: AccountKind): Promise<UserListing[]> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return mockUserListings;
}

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
  _hesabTipi: AccountKind,
  listingId: string,
  tier: PromoTier
): Promise<UserListing> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  const idx = mockUserListings.findIndex((l) => l.listingId === listingId);
  if (idx === -1) {
    throw new Error('Elan tapılmadı.');
  }
  const nextVipTier = promoTierToVipTier(tier);
  mockUserListings[idx] = { ...mockUserListings[idx], vipTier: nextVipTier };
  await updateListing(listingId, { vipTier: nextVipTier }).catch(() => {
    // Listing may not exist in mockListings (e.g. seeded only as a UserListing) — non-fatal.
  });
  return mockUserListings[idx];
}
