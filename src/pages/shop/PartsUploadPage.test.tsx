import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PartsUploadPage from './PartsUploadPage';
import * as partsApi from '../../api/parts';

describe('PartsUploadPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads the selected file and polls status until done', async () => {
    vi.spyOn(partsApi, 'uploadPartsExcel').mockResolvedValue({ jobId: 'job-1' });
    const statusSpy = vi
      .spyOn(partsApi, 'getUploadStatus')
      .mockResolvedValueOnce({ id: 'job-1', status: 'processing', processed: 10, total: 100 })
      .mockResolvedValueOnce({ id: 'job-1', status: 'done', processed: 100, total: 100 });

    render(
      <MemoryRouter>
        <PartsUploadPage />
      </MemoryRouter>
    );

    const file = new File(['dummy'], 'parts.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileInput = screen.getByLabelText(/fayl seç/i) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    const sellerNameInput = screen.getByLabelText(/satıcı adı/i);
    fireEvent.change(sellerNameInput, { target: { value: 'Test Seller' } });

    fireEvent.click(screen.getByRole('button', { name: /yüklə/i }));

    await waitFor(() => expect(partsApi.uploadPartsExcel).toHaveBeenCalledWith(file, 'Test Seller'));
    await waitFor(() => expect(screen.getByText(/100\/100/)).toBeInTheDocument(), { timeout: 3000 });
    expect(statusSpy).toHaveBeenCalled();
  });

  it('shows an error message if upload fails with a non-auth error', async () => {
    vi.spyOn(partsApi, 'uploadPartsExcel').mockRejectedValue(new Error('network error'));

    render(
      <MemoryRouter>
        <PartsUploadPage />
      </MemoryRouter>
    );

    const file = new File(['dummy'], 'parts.xlsx');
    fireEvent.change(screen.getByLabelText(/fayl seç/i), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(/satıcı adı/i), { target: { value: 'Test Seller' } });
    fireEvent.click(screen.getByRole('button', { name: /yüklə/i }));

    await waitFor(() => expect(screen.getByText(/xəta/i)).toBeInTheDocument());
  });

  it('disables the upload button until a file is chosen', () => {
    render(
      <MemoryRouter>
        <PartsUploadPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /yüklə/i })).toBeDisabled();
  });
});
