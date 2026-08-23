const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

export interface PendingUserListing {
  id: number;
  userId: number;
  marka: string;
  model: string;
  title: string;
  qiymet: number;
  status: string;
}

export interface ShopProductForAdmin {
  id: number;
  name: string;
  title: string;
  status: string;
}

export class AdminLoginError extends Error {}
export class AdminUnauthorizedError extends Error {}

export async function adminLogin(username: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401) {
    throw new AdminLoginError('İstifadəçi adı və ya parol yanlışdır');
  }
  if (!res.ok) {
    throw new Error(`adminLogin failed: ${res.status}`);
  }
}

export async function adminLogout(): Promise<void> {
  await fetch(`${API_BASE}/api/admin/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function getPendingListings(): Promise<PendingUserListing[]> {
  const res = await fetch(`${API_BASE}/api/admin/products/pending`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new AdminUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getPendingListings failed: ${res.status}`);
  }
  return res.json();
}

export async function approveListing(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/products/${id}/approve`, {
    method: 'POST',
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new AdminUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`approveListing failed: ${res.status}`);
  }
}

export async function rejectListing(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/products/${id}/reject`, {
    method: 'POST',
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new AdminUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`rejectListing failed: ${res.status}`);
  }
}

export async function getAllShopProducts(): Promise<ShopProductForAdmin[]> {
  const res = await fetch(`${API_BASE}/api/admin/shop-products`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new AdminUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getAllShopProducts failed: ${res.status}`);
  }
  return res.json();
}

export async function cancelShopProduct(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/shop-products/${id}/cancel`, {
    method: 'POST',
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new AdminUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`cancelShopProduct failed: ${res.status}`);
  }
}
