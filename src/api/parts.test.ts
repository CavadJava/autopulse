import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getSellers,
  getParts,
  uploadPartsExcel,
  getUploadStatus,
  PartsUnauthorizedError,
} from './parts';

describe('parts api client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('getSellers calls GET /api/parts/sellers and returns parsed JSON', async () => {
    const mockSellers = [{ id: 1, name: 'Made in China Store' }];
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockSellers,
    });

    const result = await getSellers();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/parts/sellers'),
      expect.objectContaining({ credentials: 'include' })
    );
    expect(result).toEqual(mockSellers);
  });

  it('getSellers normalizes a null response body to an empty array', async () => {
    // The Go backend marshals a nil slice as JSON null when there are no
    // sellers yet — callers must never receive null here, since components
    // call .map()/.length on the result unconditionally.
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => null,
    });

    const result = await getSellers();

    expect(result).toEqual([]);
  });

  it('getParts builds query params from filter and returns { parts, total }', async () => {
    const mockResult = { parts: [{ id: 1, sellerId: 1, sellerName: 'X', model: 'model3' }], total: 1 };
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });

    const result = await getParts({ model: 'model3', sellerIds: [1, 2], page: 2, limit: 20 });

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/parts?');
    expect(calledUrl).toContain('model=model3');
    expect(calledUrl).toContain('sellerIds=1%2C2');
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('limit=20');
    expect(result).toEqual(mockResult);
  });

  it('getParts normalizes a null parts field to an empty array', async () => {
    // {"parts":null,"total":0} is exactly what the real backend returns for
    // an empty catalog/filtered result — must not throw when a consumer
    // calls .map() on the result.
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ parts: null, total: 0 }),
    });

    const result = await getParts({ model: 'model3' });

    expect(result).toEqual({ parts: [], total: 0 });
  });

  it('getParts omits empty filter fields from the query string', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ parts: [], total: 0 }) });

    await getParts({});

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('model=');
    expect(calledUrl).not.toContain('sellerIds=');
  });

  // uploadPartsExcel uses XMLHttpRequest (not fetch) so it can report
  // upload progress — a fake XHR class stands in for the real one here.
  class FakeXhr {
    static instances: FakeXhr[] = [];
    method = '';
    url = '';
    withCredentials = false;
    status = 0;
    responseText = '';
    upload = { onprogress: null as null | ((e: ProgressEvent) => void) };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    sentBody: unknown = null;

    constructor() {
      FakeXhr.instances.push(this);
    }
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    send(body: unknown) {
      this.sentBody = body;
    }
  }

  it('uploadPartsExcel sends multipart FormData with the file (no sellerName — server derives identity)', async () => {
    const originalXhr = globalThis.XMLHttpRequest;
    FakeXhr.instances = [];
    (globalThis as any).XMLHttpRequest = FakeXhr;

    try {
      const file = new File(['dummy'], 'parts.xlsx');
      const resultPromise = uploadPartsExcel(file);

      const xhr = FakeXhr.instances[0];
      expect(xhr.method).toBe('POST');
      expect(xhr.url).toContain('/api/parts/upload');
      expect(xhr.withCredentials).toBe(true);
      expect(xhr.sentBody).toBeInstanceOf(FormData);
      expect((xhr.sentBody as FormData).has('sellerName')).toBe(false);

      xhr.status = 200;
      xhr.responseText = JSON.stringify({ jobId: 'job-123' });
      xhr.onload?.();

      const result = await resultPromise;
      expect(result).toEqual({ jobId: 'job-123' });
    } finally {
      globalThis.XMLHttpRequest = originalXhr;
    }
  });

  it('uploadPartsExcel reports upload progress via the onUploadProgress callback', async () => {
    const originalXhr = globalThis.XMLHttpRequest;
    FakeXhr.instances = [];
    (globalThis as any).XMLHttpRequest = FakeXhr;

    try {
      const file = new File(['dummy'], 'parts.xlsx');
      const onProgress = vi.fn();
      const resultPromise = uploadPartsExcel(file, onProgress);

      const xhr = FakeXhr.instances[0];
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
      expect(onProgress).toHaveBeenCalledWith(50);

      xhr.status = 200;
      xhr.responseText = JSON.stringify({ jobId: 'job-123' });
      xhr.onload?.();
      await resultPromise;
    } finally {
      globalThis.XMLHttpRequest = originalXhr;
    }
  });

  it('uploadPartsExcel throws PartsUnauthorizedError on 401', async () => {
    const originalXhr = globalThis.XMLHttpRequest;
    FakeXhr.instances = [];
    (globalThis as any).XMLHttpRequest = FakeXhr;

    try {
      const file = new File(['dummy'], 'parts.xlsx');
      const resultPromise = uploadPartsExcel(file);

      const xhr = FakeXhr.instances[0];
      xhr.status = 401;
      xhr.onload?.();

      await expect(resultPromise).rejects.toBeInstanceOf(PartsUnauthorizedError);
    } finally {
      globalThis.XMLHttpRequest = originalXhr;
    }
  });

  it('getUploadStatus calls the status endpoint with the job id in the path', async () => {
    const mockJob = { id: 'job-123', status: 'processing', processed: 5, total: 100 };
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => mockJob });

    const result = await getUploadStatus('job-123');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/parts/upload/job-123/status'),
      expect.any(Object)
    );
    expect(result).toEqual(mockJob);
  });
});
