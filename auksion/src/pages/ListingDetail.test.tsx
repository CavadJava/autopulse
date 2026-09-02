import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});
