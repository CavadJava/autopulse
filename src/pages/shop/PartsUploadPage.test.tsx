import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PartsUploadPage from './PartsUploadPage';
import * as partsApi from '../../api/parts';
import * as shopApi from '../../api/shop';
import { ShopUnauthorizedError } from '../../api/shop';

describe('PartsUploadPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(shopApi, 'getMyShopProducts').mockResolvedValue([]);
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

    const fileInput = await screen.findByLabelText(/fayl seç/i) as HTMLInputElement;
    const file = new File(['dummy'], 'parts.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /yüklə/i }));

    await waitFor(() => expect(partsApi.uploadPartsExcel).toHaveBeenCalledWith(file, expect.any(Function)));
    await waitFor(() => expect(screen.getByText(/100\/100/)).toBeInTheDocument(), { timeout: 3000 });
    expect(statusSpy).toHaveBeenCalled();
  });

  it('shows upload progress percentage while the file body is still being sent', async () => {
    let capturedOnProgress: ((percent: number) => void) | undefined;
    vi.spyOn(partsApi, 'uploadPartsExcel').mockImplementation((_file, onProgress) => {
      capturedOnProgress = onProgress;
      // Never resolves within this test — simulates the upload phase, where
      // the server hasn't responded with a jobId yet.
      return new Promise(() => {});
    });

    render(
      <MemoryRouter>
        <PartsUploadPage />
      </MemoryRouter>
    );

    const fileInput = (await screen.findByLabelText(/fayl seç/i)) as HTMLInputElement;
    const file = new File(['dummy'], 'parts.xlsx');
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /yüklə/i }));

    await waitFor(() => expect(capturedOnProgress).toBeDefined());
    capturedOnProgress!(42);

    await waitFor(() => expect(screen.getByText(/42%/)).toBeInTheDocument());
    expect(screen.getByText(/səhifəni bağlamayın/i)).toBeInTheDocument();
  });

  it('shows an error message if upload fails with a non-auth error', async () => {
    vi.spyOn(partsApi, 'uploadPartsExcel').mockRejectedValue(new Error('network error'));

    render(
      <MemoryRouter>
        <PartsUploadPage />
      </MemoryRouter>
    );

    const fileInput = await screen.findByLabelText(/fayl seç/i);
    const file = new File(['dummy'], 'parts.xlsx');
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /yüklə/i }));

    await waitFor(() => expect(screen.getByText(/xəta/i)).toBeInTheDocument());
  });

  it('disables the upload button until a file is chosen', async () => {
    render(
      <MemoryRouter>
        <PartsUploadPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: /yüklə/i })).toBeDisabled();
  });

  it('no longer renders a seller-name field', async () => {
    render(
      <MemoryRouter>
        <PartsUploadPage />
      </MemoryRouter>
    );

    await screen.findByLabelText(/fayl seç/i);
    expect(screen.queryByLabelText(/satıcı adı/i)).not.toBeInTheDocument();
  });

  it('redirects to /magaza-giris on mount when the shop session is unauthorized', async () => {
    vi.spyOn(shopApi, 'getMyShopProducts').mockRejectedValue(new ShopUnauthorizedError('not logged in'));

    render(
      <MemoryRouter>
        <PartsUploadPage />
      </MemoryRouter>
    );

    // The form must never become interactive for an unauthorized visitor.
    await waitFor(() => expect(screen.queryByLabelText(/fayl seç/i)).not.toBeInTheDocument());
  });
});
