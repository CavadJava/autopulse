// Real HTTP client for the avtopulse-backend Go service's admin-notification
// read endpoints — the recipient side (user_session / shop_session), mirroring
// src/api/chat.ts's split-by-session-type convention.

const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

export interface UserNotification {
  id: number;
  notificationId: number;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export async function getMyNotifications(): Promise<UserNotification[]> {
  const res = await fetch(`${API_BASE}/api/users/me/notifications`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`getMyNotifications failed: ${res.status}`);
  }
  return res.json();
}

export async function getMyNotificationsUnreadCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/users/me/notifications/unread-count`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.unreadCount ?? 0;
}

export async function markNotificationRead(id: number): Promise<void> {
  await fetch(`${API_BASE}/api/users/me/notifications/${id}/read`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function getShopNotifications(): Promise<UserNotification[]> {
  const res = await fetch(`${API_BASE}/api/shops/me/notifications`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`getShopNotifications failed: ${res.status}`);
  }
  return res.json();
}

export async function getShopNotificationsUnreadCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/shops/me/notifications/unread-count`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.unreadCount ?? 0;
}

export async function markShopNotificationRead(id: number): Promise<void> {
  await fetch(`${API_BASE}/api/shops/me/notifications/${id}/read`, {
    method: 'POST',
    credentials: 'include',
  });
}
