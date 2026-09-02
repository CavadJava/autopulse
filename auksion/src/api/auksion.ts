const API_BASE = import.meta.env.VITE_AUKSION_API_BASE ?? '';

export interface Listing {
  id: number;
  make: string;
  model: string;
  year: number;
  description: string;
  images: string[];
  startingBid: number;
  currentBid?: number;
  bidCount: number;
  minNextBid: number;
  endTime: string;
  status: 'live' | 'ended';
  createdAt: string;
}

export interface Bid {
  id: number;
  listingId: number;
  bidderUserId: number;
  amount: number;
  createdAt: string;
}

export interface ListingDetail {
  listing: Listing;
  bids: Bid[];
}

export class AuksionUnauthorizedError extends Error {}
export class BidTooLowError extends Error {
  minimum: number;
  constructor(minimum: number) {
    super('Bid too low');
    this.minimum = minimum;
  }
}
export class AuctionEndedError extends Error {}

export async function getLiveListings(): Promise<Listing[]> {
  const res = await fetch(`${API_BASE}/api/auksion/listings`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`getLiveListings failed: ${res.status}`);
  }
  // Same nil-slice-as-null gotcha as the root app's parts/listings clients.
  const data = await res.json();
  return data ?? [];
}

export async function getListing(id: number): Promise<ListingDetail> {
  const res = await fetch(`${API_BASE}/api/auksion/listings/${id}`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`getListing failed: ${res.status}`);
  }
  const data = await res.json();
  return { listing: data.listing, bids: data.bids ?? [] };
}

export async function placeBid(id: number, amount: number): Promise<Listing> {
  const res = await fetch(`${API_BASE}/api/auksion/listings/${id}/bids`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  if (res.status === 401) {
    throw new AuksionUnauthorizedError('Not logged in');
  }
  if (res.status === 409) {
    throw new AuctionEndedError('Auction has ended');
  }
  if (res.status === 400) {
    const body = await res.json();
    throw new BidTooLowError(body.minimum);
  }
  if (!res.ok) {
    throw new Error(`placeBid failed: ${res.status}`);
  }
  return res.json();
}
