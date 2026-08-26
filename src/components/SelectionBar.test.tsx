import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SelectionBar from './SelectionBar';

describe('SelectionBar', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(<SelectionBar count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the count when greater than 0', () => {
    render(<SelectionBar count={3} />);
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });
});
