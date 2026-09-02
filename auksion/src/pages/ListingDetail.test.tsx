import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ListingDetail from './ListingDetail';
import * as api from '../api/auksion';
import { AuthProvider } from '../context/AuthContext';

describe('ListingDetail', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getListing');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the listing by id from the URL and renders make/model + BidBox', async () => {
    vi.mocked(api.getListing).mockResolvedValue({
      listing: {
        id: 5, make: 'Tesla', model: 'Model Y', year: 2023, description: 'Təmiz maşın', images: [],
        startingBid: 20000, currentBid: 20500, bidCount: 3, minNextBid: 20600,
        endTime: new Date(Date.now() + 3600_000).toISOString(), status: 'live', createdAt: new Date().toISOString(),
      },
      bids: [],
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/elan/5']}>
          <Routes>
            <Route path="/elan/:id" element={<ListingDetail />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('Tesla Model Y')).toBeInTheDocument());
    expect(api.getListing).toHaveBeenCalledWith(5);
    expect(screen.getByText('Təmiz maşın')).toBeInTheDocument();
    expect(screen.getByText('20 500 ₼')).toBeInTheDocument();
  });

  it('shows "Elan tapılmadı." when getListing fails (404 or network error)', async () => {
    vi.mocked(api.getListing).mockRejectedValue(new Error('getListing failed: 404'));

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/elan/999']}>
          <Routes>
            <Route path="/elan/:id" element={<ListingDetail />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('Elan tapılmadı.')).toBeInTheDocument());
    expect(screen.queryByText('Yüklənir...')).not.toBeInTheDocument();
  });

  it('keeps showing the last-known-good listing when a poll AFTER a successful load fails (transient blip)', async () => {
    vi.useFakeTimers();
    try {
      const listing = {
        id: 7, make: 'BMW', model: 'M3', year: 2022, description: '', images: [],
        startingBid: 30000, currentBid: 31000, bidCount: 2, minNextBid: 31500,
        endTime: new Date(Date.now() + 3600_000).toISOString(), status: 'live' as const, createdAt: new Date().toISOString(),
      };

      vi.mocked(api.getListing)
        .mockResolvedValueOnce({ listing, bids: [] })
        .mockRejectedValueOnce(new Error('network blip'));

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/elan/7']}>
            <Routes>
              <Route path="/elan/:id" element={<ListingDetail />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      // Flush the initial (successful) load.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText('BMW M3')).toBeInTheDocument();

      // Advance past the next poll tick (4s), which rejects.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });

      // The transient failure must NOT replace the live page with an error,
      // and must NOT stop polling — the last-known-good listing stays shown.
      expect(screen.getByText('BMW M3')).toBeInTheDocument();
      expect(screen.queryByText('Elan tapılmadı.')).not.toBeInTheDocument();
      expect(api.getListing).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
