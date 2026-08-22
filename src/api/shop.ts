// Real HTTP client for the avtopulse-backend Go service's shop/mağaza
// endpoints. This is a deliberately separate, parallel layer from the rest
// of AutoPulse's mock-data API modules (src/api/listings.ts etc.) — it talks
// to a real backend over the network, not an in-memory mock.

const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

export interface ShopSummary {
  id: number;
  name: string;
  title: string;
}

export interface ProductImage {
  id: number;
  minioUrl: string;
  s3Url: string;
  sira: number;
}

export interface Shop {
  id: number;
  name: string;
  customerId: number;
  title: string;
  details: string;
  workTimes: string;
  logoUrl: string;
}

export interface ShopProduct {
  id: number;
  name: string;
  title: string;
  details: string;
  marka: string;
  model: string;
  il: number;
  qiymet: number;
  yurus: number;
  yanacaq: string;
  ban: string;
  images: ProductImage[];
}

export interface CreateProductInput {
  name: string;
  title: string;
  details: string;
  marka: string;
  model: string;
  il: number;
  qiymet: number;
  yurus: number;
  yanacaq: string;
  ban: string;
}

export class ShopNotFoundError extends Error {}
export class ShopLoginError extends Error {}
export class ShopUnauthorizedError extends Error {}

export async function getShops(): Promise<ShopSummary[]> {
  const res = await fetch(`${API_BASE}/api/shops`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`getShops failed: ${res.status}`);
  }
  return res.json();
}

export async function getShopByName(name: string): Promise<Shop> {
  const res = await fetch(`${API_BASE}/api/shops/by-name/${encodeURIComponent(name)}`, { cache: 'no-store' });
  if (res.status === 404) {
    throw new ShopNotFoundError(`Shop not found: ${name}`);
  }
  if (!res.ok) {
    throw new Error(`getShopByName failed: ${res.status}`);
  }
  return res.json();
}

export async function getShopProducts(shopId: number): Promise<ShopProduct[]> {
  const res = await fetch(`${API_BASE}/api/shops/${shopId}/products`, { cache: 'no-store' });
  if (res.status === 404) {
    throw new ShopNotFoundError(`Shop not found: ${shopId}`);
  }
  if (!res.ok) {
    throw new Error(`getShopProducts failed: ${res.status}`);
  }
  return res.json();
}

export async function shopLogin(name: string, password: string): Promise<ShopSummary> {
  const res = await fetch(`${API_BASE}/api/shops/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  if (res.status === 401) {
    throw new ShopLoginError('Ad və ya parol yanlışdır');
  }
  if (!res.ok) {
    throw new Error(`shopLogin failed: ${res.status}`);
  }
  const data = await res.json();
  return data.shop;
}

export async function getMyShopProducts(): Promise<ShopProduct[]> {
  const res = await fetch(`${API_BASE}/api/shops/me/products`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getMyShopProducts failed: ${res.status}`);
  }
  return res.json();
}

export async function shopLogout(): Promise<void> {
  await fetch(`${API_BASE}/api/shops/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function createShopProduct(input: CreateProductInput): Promise<ShopProduct> {
  const res = await fetch(`${API_BASE}/api/shops/me/products`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`createShopProduct failed: ${res.status}`);
  }
  return res.json();
}

export async function uploadProductImages(productId: number, files: File[]): Promise<ProductImage[]> {
  const form = new FormData();
  files.forEach((file) => form.append('images', file));

  const res = await fetch(`${API_BASE}/api/shops/me/products/${productId}/images`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`uploadProductImages failed: ${res.status}`);
  }
  return res.json();
}

export async function uploadShopLogo(file: File): Promise<{ logoUrl: string }> {
  const form = new FormData();
  form.append('logo', file);

  const res = await fetch(`${API_BASE}/api/shops/me/logo`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`uploadShopLogo failed: ${res.status}`);
  }
  return res.json();
}

export async function updateShopProduct(id: number, input: CreateProductInput): Promise<ShopProduct> {
  const res = await fetch(`${API_BASE}/api/shops/me/products/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (res.status === 404) {
    throw new ShopNotFoundError(`Product not found: ${id}`);
  }
  if (!res.ok) {
    throw new Error(`updateShopProduct failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteShopProduct(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/shops/me/products/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (res.status === 404) {
    throw new ShopNotFoundError(`Product not found: ${id}`);
  }
  if (!res.ok) {
    throw new Error(`deleteShopProduct failed: ${res.status}`);
  }
}

export async function deleteProductImage(productId: number, imageId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/shops/me/products/${productId}/images/${imageId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (res.status === 404) {
    throw new ShopNotFoundError(`Image not found: ${imageId}`);
  }
  if (!res.ok) {
    throw new Error(`deleteProductImage failed: ${res.status}`);
  }
}
