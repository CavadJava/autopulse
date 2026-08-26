import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PartCard from './PartCard';
import type { Part } from '../api/parts';

const basePart: Part = {
  id: 1,
  sellerId: 1,
  sellerName: 'Made in China Store',
  model: 'model3',
  oem: '1494949-00-A',
  description: 'The front logo of the Tesla MD3',
  yearRange: '2019-2021',
  priceMadeInChina: 1.4,
  imageUrl: 'https://example.com/img.png',
};

describe('PartCard', () => {
  it('renders OEM, description, year, and price', () => {
    render(<PartCard part={basePart} selected={false} onToggleSelect={vi.fn()} />);

    expect(screen.getByText('1494949-00-A')).toBeInTheDocument();
    expect(screen.getByText('The front logo of the Tesla MD3')).toBeInTheDocument();
    expect(screen.getByText('2019-2021')).toBeInTheDocument();
    expect(screen.getByText(/1.4/)).toBeInTheDocument();
  });

  it('renders multiple price tiers when present', () => {
    const part: Part = { ...basePart, priceOriginalNew: 35, priceOriginalUsed: 25 };
    render(<PartCard part={part} selected={false} onToggleSelect={vi.fn()} />);

    expect(screen.getByText(/1.4/)).toBeInTheDocument();
    expect(screen.getByText(/35/)).toBeInTheDocument();
    expect(screen.getByText(/25/)).toBeInTheDocument();
  });

  it('falls back to priceRaw when no structured price fields are set', () => {
    const part: Part = { ...basePart, priceMadeInChina: undefined, priceRaw: 'No stock now' };
    render(<PartCard part={part} selected={false} onToggleSelect={vi.fn()} />);

    expect(screen.getByText('No stock now')).toBeInTheDocument();
  });

  it('calls onToggleSelect with the part id when the checkbox is clicked', () => {
    const handleToggle = vi.fn();
    render(<PartCard part={basePart} selected={false} onToggleSelect={handleToggle} />);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(handleToggle).toHaveBeenCalledWith(1);
  });

  it('reflects the selected prop on the checkbox', () => {
    render(<PartCard part={basePart} selected={true} onToggleSelect={vi.fn()} />);

    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
