import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLiveListings, getListing, placeBid, AuksionUnauthorizedError, BidTooLowError, AuctionEndedError } from './auksion';

describe('auksion api client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('getLiveListings calls GET /api/auksion/listings and normalizes null to []', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => null });

    const result = await getLiveListings();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auksion/listings'),
      expect.objectContaining({ credentials: 'include' })
    );
    expect(result).toEqual([]);
  });

  it('getListing normalizes a null bids field to []', async () => {
    const listing = { id: 1, make: 'Tesla', model: 'Model 3' };
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ listing, bids: null }) });

    const result = await getListing(1);

    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auksion/listings/1'), expect.any(Object));
    expect(result).toEqual({ listing, bids: [] });
  });

  it('placeBid posts the amount and returns the updated listing on success', async () => {
    const updated = { id: 1, currentBid: 15000 };
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => updated });

    const result = await placeBid(1, 15000);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auksion/listings/1/bids'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ amount: 15000 }) })
    );
    expect(result).toEqual(updated);
  });

  it('placeBid throws AuksionUnauthorizedError on 401', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 401 });
    await expect(placeBid(1, 15000)).rejects.toBeInstanceOf(AuksionUnauthorizedError);
  });

  it('placeBid throws BidTooLowError with the minimum on 400', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 400, json: async () => ({ minimum: 15100 }) });
    const err = await placeBid(1, 15000).catch((e) => e);
    expect(err).toBeInstanceOf(BidTooLowError);
    expect(err.minimum).toBe(15100);
  });

  it('placeBid throws AuctionEndedError on 409', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 409 });
    await expect(placeBid(1, 15000)).rejects.toBeInstanceOf(AuctionEndedError);
  });
});
