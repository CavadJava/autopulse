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

  it('uploadPartsExcel sends multipart FormData with the file (no sellerName — server derives identity)', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: 'job-123' }),
    });

    const file = new File(['dummy'], 'parts.xlsx');
    const result = await uploadPartsExcel(file);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/parts/upload'),
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
    const call = (globalThis.fetch as any).mock.calls[0][1];
    expect(call.body).toBeInstanceOf(FormData);
    expect(call.body.has('sellerName')).toBe(false);
    expect(result).toEqual({ jobId: 'job-123' });
  });

  it('uploadPartsExcel throws PartsUnauthorizedError on 401', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 401 });

    const file = new File(['dummy'], 'parts.xlsx');
    await expect(uploadPartsExcel(file)).rejects.toBeInstanceOf(PartsUnauthorizedError);
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
