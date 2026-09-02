import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';
import * as api from '../api/auksion';

describe('Home', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getLiveListings');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a card for every live listing returned by the API', async () => {
    vi.mocked(api.getLiveListings).mockResolvedValue([
      {
        id: 1, make: 'Tesla', model: 'Model 3', year: 2022, description: '', images: [],
        startingBid: 15000, bidCount: 0, minNextBid: 15000,
        endTime: new Date(Date.now() + 3600_000).toISOString(), status: 'live', createdAt: new Date().toISOString(),
      },
    ]);

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Tesla Model 3')).toBeInTheDocument());
  });

  it('shows an empty-state message when there are no live listings', async () => {
    vi.mocked(api.getLiveListings).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Hazırda aktiv hərrac yoxdur.')).toBeInTheDocument());
  });
});
