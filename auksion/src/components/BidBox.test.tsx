import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BidBox from './BidBox';
import * as api from '../api/auksion';
import { AuthProvider } from '../context/AuthContext';

const listing: api.Listing = {
  id: 1, make: 'Tesla', model: 'Model 3', year: 2022, description: '', images: [],
  startingBid: 15000, currentBid: 15000, bidCount: 1, minNextBid: 15100,
  endTime: new Date(Date.now() + 3600_000).toISOString(), status: 'live', createdAt: new Date().toISOString(),
};
const bids: api.Bid[] = [{ id: 1, listingId: 1, bidderUserId: 7, amount: 15000, createdAt: new Date().toISOString() }];

function renderBidBox(onBidPlaced = vi.fn()) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <BidBox listing={listing} bids={bids} onBidPlaced={onBidPlaced} />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('BidBox', () => {
  beforeEach(() => {
    vi.spyOn(api, 'placeBid');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the current price, minimum next bid and bid history', () => {
    renderBidBox();

    expect(screen.getByText('15 000 ₼')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('15100')).toBeInTheDocument();
    expect(screen.getByText('1 təklif')).toBeInTheDocument();
  });

  it('calls placeBid and onBidPlaced with the updated listing on success', async () => {
    const updated = { ...listing, currentBid: 15100, bidCount: 2, minNextBid: 15200 };
    vi.mocked(api.placeBid).mockResolvedValue(updated);
    const onBidPlaced = vi.fn();

    renderBidBox(onBidPlaced);
    fireEvent.change(screen.getByPlaceholderText('15100'), { target: { value: '15100' } });
    fireEvent.click(screen.getByText('Təklif ver'));

    await waitFor(() => expect(onBidPlaced).toHaveBeenCalledWith(updated));
    expect(api.placeBid).toHaveBeenCalledWith(1, 15100);
  });

  it('shows the server-reported minimum when the bid is rejected as too low', async () => {
    vi.mocked(api.placeBid).mockRejectedValue(new api.BidTooLowError(15100));

    renderBidBox();
    fireEvent.change(screen.getByPlaceholderText('15100'), { target: { value: '15050' } });
    fireEvent.click(screen.getByText('Təklif ver'));

    await waitFor(() => expect(screen.getByText('Minimum təklif: 15 100 ₼')).toBeInTheDocument());
  });

  it('shows an ended message when the auction has ended', async () => {
    vi.mocked(api.placeBid).mockRejectedValue(new api.AuctionEndedError());

    renderBidBox();
    fireEvent.change(screen.getByPlaceholderText('15100'), { target: { value: '15100' } });
    fireEvent.click(screen.getByText('Təklif ver'));

    await waitFor(() => expect(screen.getByText('Hərrac bitib.')).toBeInTheDocument());
  });

  it('prompts to log in when placing a bid while unauthenticated', async () => {
    vi.mocked(api.placeBid).mockRejectedValue(new api.AuksionUnauthorizedError());

    renderBidBox();
    fireEvent.change(screen.getByPlaceholderText('15100'), { target: { value: '15100' } });
    fireEvent.click(screen.getByText('Təklif ver'));

    await waitFor(() => expect(screen.getByText('Təklif vermək üçün daxil olun.')).toBeInTheDocument());
  });
});
