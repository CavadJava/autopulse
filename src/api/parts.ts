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

export async function uploadPartsExcel(
  file: File,
  onUploadProgress?: (percent: number) => void
): Promise<{ jobId: string }> {
  // Source workbooks run ~195MB, so the upload itself (the file body
  // reaching the server, before the backend has even started parsing) can
  // take minutes on a slow connection. plain fetch() has no upload progress
  // event, so XMLHttpRequest is used here specifically to drive a percent
  // callback the UI can show while the browser is still sending bytes —
  // without this, the page shows nothing at all during that phase.
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/parts/upload`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onUploadProgress) {
        onUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        reject(new PartsUnauthorizedError('Not logged in'));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`uploadPartsExcel failed: ${xhr.status}`));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        reject(new Error('uploadPartsExcel: invalid JSON response'));
      }
    };

    xhr.onerror = () => reject(new Error('uploadPartsExcel: network error'));

    xhr.send(form);
  });
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
