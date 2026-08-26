import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Parts from './Parts';
import * as partsApi from '../api/parts';

describe('Parts page', () => {
  beforeEach(() => {
    vi.spyOn(partsApi, 'getSellers').mockResolvedValue([
      { id: 1, name: 'Made in China Store' },
      { id: 2, name: 'OEM Parts AZ' },
    ]);
    vi.spyOn(partsApi, 'getParts').mockResolvedValue({
      parts: [
        { id: 1, sellerId: 1, sellerName: 'Made in China Store', model: 'model3', description: 'Front logo' },
      ],
      total: 1,
    });
  });

  it('loads sellers and parts for the default model on mount', async () => {
    render(
      <MemoryRouter>
        <Parts />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Front logo')).toBeInTheDocument());
    expect(partsApi.getParts).toHaveBeenCalledWith(expect.objectContaining({ model: 'model3' }));
  });

  it('re-fetches parts with the new model when a tab is clicked', async () => {
    render(
      <MemoryRouter>
        <Parts />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Front logo')).toBeInTheDocument());

    fireEvent.click(screen.getByText('MODEL Y'));

    await waitFor(() =>
      expect(partsApi.getParts).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'modely' }))
    );
  });

  it('re-fetches parts with selected seller ids when a seller checkbox is toggled', async () => {
    render(
      <MemoryRouter>
        <Parts />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByLabelText('OEM Parts AZ')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('OEM Parts AZ'));

    await waitFor(() =>
      expect(partsApi.getParts).toHaveBeenLastCalledWith(expect.objectContaining({ sellerIds: [2] }))
    );
  });

  it('shows the selection bar count after selecting a part card checkbox', async () => {
    render(
      <MemoryRouter>
        <Parts />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Front logo')).toBeInTheDocument());

    const checkboxes = screen.getAllByRole('checkbox').filter((el) => el.getAttribute('aria-label')?.startsWith('Seç'));
    fireEvent.click(checkboxes[0]);

    await waitFor(() => expect(screen.getByText(/1 məhsul seçildi/)).toBeInTheDocument());
  });
});
