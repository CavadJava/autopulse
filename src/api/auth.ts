import type { AccountKind, SavedCard, User, UserListing } from '../types';

const MOCK_OTP = '1234';

export interface BusinessLoginPayload {
  email: string;
  ünvan: string;
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
    məhdudiyyət: 2,
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
  if (!payload.email || !payload.ünvan) {
    throw new Error('E-mail və ünvan tələb olunur.');
  }
  return buildBiznesUser(payload);
}

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
    },
    {
      id: 'ul-2',
      listingId: '2',
      başlıq: 'Mercedes E200, 2020',
      qiymət: 51000,
      şəkil: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&q=80',
      status: 'imtina_olunub',
      tarix: '2026-08-04T15:53:00Z',
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
    },
  ],
};

export async function getMyListings(hesabTipi: AccountKind): Promise<UserListing[]> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return mockUserListingsByAccount[hesabTipi];
}

export async function getMyCards(): Promise<SavedCard[]> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return [];
}

export async function topUpBalance(_amount: number): Promise<{ success: true }> {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return { success: true };
}
