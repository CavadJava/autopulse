import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestOtp, verifyOtp, UserOtpError } from './auth';

describe('auksion auth api client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('requestOtp posts the phone number', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ sent: true }) });

    const result = await requestOtp('+994501234567');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/otp/request'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ phone: '+994501234567' }) })
    );
    expect(result).toEqual({ sent: true });
  });

  it('verifyOtp returns the user on success', async () => {
    const user = { id: 1, name: '', phone: '+994501234567' };
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ user }) });

    const result = await verifyOtp('+994501234567', '1234');

    expect(result).toEqual(user);
  });

  it('verifyOtp throws UserOtpError on 401', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 401 });
    await expect(verifyOtp('+994501234567', '0000')).rejects.toBeInstanceOf(UserOtpError);
  });
});
