const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

export interface Seller {
  id: number;
  name: string;
}

export interface Part {
  id: number;
  sellerId: number;
  sellerName: string;
  model: string;
  rowNo?: number;
  oem?: string;
  description?: string;
  yearRange?: string;
  priceRaw?: string;
  priceMadeInChina?: number;
  priceOriginalNew?: number;
  priceOriginalUsed?: number;
  imageUrl?: string;
}

export interface PartsFilter {
  model?: string;
  sellerIds?: number[];
  page?: number;
  limit?: number;
}

export interface PartsListResult {
  parts: Part[];
  total: number;
}

export type UploadJobStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface UploadJob {
  id: string;
  status: UploadJobStatus;
  processed: number;
  total: number;
  error?: string;
}

export class PartsUnauthorizedError extends Error {}

export async function getSellers(): Promise<Seller[]> {
  const res = await fetch(`${API_BASE}/api/parts/sellers`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`getSellers failed: ${res.status}`);
  }
  // The Go backend marshals a nil slice as JSON null (not []) when there are
  // no sellers yet — normalize so callers can always .map()/.length safely.
  const data = await res.json();
  return data ?? [];
}

export async function getParts(filter: PartsFilter): Promise<PartsListResult> {
  const params = new URLSearchParams();
  if (filter.model) params.set('model', filter.model);
  if (filter.sellerIds && filter.sellerIds.length > 0) {
    params.set('sellerIds', filter.sellerIds.join(','));
  }
  if (filter.page) params.set('page', String(filter.page));
  if (filter.limit) params.set('limit', String(filter.limit));

  const qs = params.toString();
  const res = await fetch(`${API_BASE}/api/parts${qs ? `?${qs}` : ''}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`getParts failed: ${res.status}`);
  }
  // Same nil-slice-as-null normalization as getSellers — an empty catalog
  // (or an empty filtered result) comes back as {"parts":null,"total":0}.
  const data = await res.json();
  return { ...data, parts: data.parts ?? [] };
}

export async function uploadPartsExcel(file: File): Promise<{ jobId: string }> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_BASE}/api/parts/upload`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (res.status === 401) {
    throw new PartsUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`uploadPartsExcel failed: ${res.status}`);
  }
  return res.json();
}

export async function getUploadStatus(jobId: string): Promise<UploadJob> {
  const res = await fetch(`${API_BASE}/api/parts/upload/${jobId}/status`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`getUploadStatus failed: ${res.status}`);
  }
  return res.json();
}
