const API_BASE = import.meta.env.VITE_AUKSION_API_BASE ?? '';

export interface AuksionUser {
  id: number;
  name: string;
  phone: string;
}

export class UserOtpError extends Error {}

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

export async function verifyOtp(phone: string, code: string): Promise<AuksionUser> {
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
  return data.user as AuksionUser;
}
