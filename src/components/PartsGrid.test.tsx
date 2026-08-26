import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PartsGrid from './PartsGrid';
import type { Part } from '../api/parts';

const parts: Part[] = [
  { id: 1, sellerId: 1, sellerName: 'A', model: 'model3', description: 'Part one' },
  { id: 2, sellerId: 1, sellerName: 'A', model: 'model3', description: 'Part two' },
];

describe('PartsGrid', () => {
  it('renders one card per part', () => {
    render(<PartsGrid parts={parts} selectedPartIds={[]} onToggleSelect={vi.fn()} />);

    expect(screen.getByText('Part one')).toBeInTheDocument();
    expect(screen.getByText('Part two')).toBeInTheDocument();
  });

  it('renders an empty state when parts is empty', () => {
    render(<PartsGrid parts={[]} selectedPartIds={[]} onToggleSelect={vi.fn()} />);

    expect(screen.getByText(/tapılmadı/i)).toBeInTheDocument();
  });
});
