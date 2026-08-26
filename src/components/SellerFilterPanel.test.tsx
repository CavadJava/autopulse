import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SellerFilterPanel from './SellerFilterPanel';
import type { Seller } from '../api/parts';

const sellers: Seller[] = [
  { id: 1, name: 'Made in China Store' },
  { id: 2, name: 'OEM Parts AZ' },
];

describe('SellerFilterPanel', () => {
  it('renders one checkbox per seller', () => {
    render(<SellerFilterPanel sellers={sellers} selectedSellerIds={[]} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Made in China Store')).toBeInTheDocument();
    expect(screen.getByLabelText('OEM Parts AZ')).toBeInTheDocument();
  });

  it('checks the box for sellers in selectedSellerIds', () => {
    render(<SellerFilterPanel sellers={sellers} selectedSellerIds={[2]} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Made in China Store')).not.toBeChecked();
    expect(screen.getByLabelText('OEM Parts AZ')).toBeChecked();
  });

  it('calls onChange with the seller added when an unchecked box is clicked', () => {
    const handleChange = vi.fn();
    render(<SellerFilterPanel sellers={sellers} selectedSellerIds={[1]} onChange={handleChange} />);

    fireEvent.click(screen.getByLabelText('OEM Parts AZ'));

    expect(handleChange).toHaveBeenCalledWith([1, 2]);
  });

  it('calls onChange with the seller removed when a checked box is clicked', () => {
    const handleChange = vi.fn();
    render(<SellerFilterPanel sellers={sellers} selectedSellerIds={[1, 2]} onChange={handleChange} />);

    fireEvent.click(screen.getByLabelText('Made in China Store'));

    expect(handleChange).toHaveBeenCalledWith([2]);
  });
});
