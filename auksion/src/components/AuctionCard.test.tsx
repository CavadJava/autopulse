import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuctionCard from './AuctionCard';
import type { Listing } from '../api/auksion';

const listing: Listing = {
  id: 1, make: 'Tesla', model: 'Model 3', year: 2022, description: '', images: ['https://example.com/1.jpg'],
  startingBid: 15000, currentBid: 15500, bidCount: 2, minNextBid: 15600,
  endTime: new Date(Date.now() + 3600_000).toISOString(), status: 'live', createdAt: new Date().toISOString(),
};

describe('AuctionCard', () => {
  it('shows make/model/year, current bid and a link to the detail page', () => {
    render(
      <MemoryRouter>
        <AuctionCard listing={listing} />
      </MemoryRouter>
    );

    expect(screen.getByText('Tesla Model 3')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
    expect(screen.getByText('15 500 ₼')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/elan/1');
  });

  it('falls back to the starting bid label when no bid has been placed yet', () => {
    render(
      <MemoryRouter>
        <AuctionCard listing={{ ...listing, currentBid: undefined, bidCount: 0 }} />
      </MemoryRouter>
    );

    expect(screen.getByText('15 000 ₼')).toBeInTheDocument();
    expect(screen.getByText('Başlanğıc qiymət')).toBeInTheDocument();
  });
});
