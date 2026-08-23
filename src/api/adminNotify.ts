// Real HTTP client for the avtopulse-backend Go service's admin bulk-
// notification endpoints — send side, admin_session-gated, mirroring
// src/api/admin.ts's conventions.

const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

export interface NotificationFilters {
  recipientType?: 'user' | 'shop' | '';
  balanceMin?: number;
  balanceMax?: number;
  createdFrom?: string;
  createdTo?: string;
  hasActiveListing?: boolean;
  hasNonVipActiveListing?: boolean;
}

export interface NotificationSummary {
  id: number;
  title: string;
  body: string;
  createdAt: string;
  sentCount: number;
  readCount: number;
}

export class AdminNotifyUnauthorizedError extends Error {}

export async function previewNotification(
  title: string,
  body: string,
  filters: NotificationFilters
): Promise<number> {
  const res = await fetch(`${API_BASE}/api/admin/notifications/preview`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, filters }),
  });
  if (res.status === 401) {
    throw new AdminNotifyUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`previewNotification failed: ${res.status}`);
  }
  const data = await res.json();
  return data.recipientCount ?? 0;
}

export async function sendNotification(
  title: string,
  body: string,
  filters: NotificationFilters
): Promise<{ id: number; recipientCount: number }> {
  const res = await fetch(`${API_BASE}/api/admin/notifications`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, filters }),
  });
  if (res.status === 401) {
    throw new AdminNotifyUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`sendNotification failed: ${res.status}`);
  }
  return res.json();
}

export async function getSentNotifications(): Promise<NotificationSummary[]> {
  const res = await fetch(`${API_BASE}/api/admin/notifications/sent`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new AdminNotifyUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getSentNotifications failed: ${res.status}`);
  }
  return res.json();
}
