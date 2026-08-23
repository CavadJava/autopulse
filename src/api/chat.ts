// Real HTTP client for the avtopulse-backend Go service's chat endpoints.
// Two independent sets of functions — one per session type (user_session,
// shop_session) — since the backend mounts chat under both auth middlewares
// separately, mirroring src/api/auth.ts and src/api/shop.ts's own split.

const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

export interface Conversation {
  id: number;
  source: 'shop' | 'user';
  listingId: number;
  buyerUserId: number;
  sellerType: 'shop' | 'user';
  sellerId: number;
  createdAt: string;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderType: 'shop' | 'user';
  senderId: number;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export class ChatUnauthorizedError extends Error {}

export async function startConversation(source: 'shop' | 'user', listingId: number): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/api/users/me/conversations`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, listingId }),
  });
  if (res.status === 401) {
    throw new ChatUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`startConversation failed: ${res.status}`);
  }
  return res.json();
}

export async function getMyConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_BASE}/api/users/me/conversations`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new ChatUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getMyConversations failed: ${res.status}`);
  }
  return res.json();
}

export async function getMessages(conversationId: number): Promise<ChatMessage[]> {
  const res = await fetch(`${API_BASE}/api/users/me/conversations/${conversationId}/messages`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new ChatUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getMessages failed: ${res.status}`);
  }
  return res.json();
}

export async function sendMessage(conversationId: number, body: string): Promise<ChatMessage> {
  const res = await fetch(`${API_BASE}/api/users/me/conversations/${conversationId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (res.status === 401) {
    throw new ChatUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`sendMessage failed: ${res.status}`);
  }
  return res.json();
}

export async function getUnreadCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/users/me/conversations/unread-count`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.unreadCount ?? 0;
}

export async function getShopConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_BASE}/api/shops/me/conversations`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new ChatUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getShopConversations failed: ${res.status}`);
  }
  return res.json();
}

export async function getShopMessages(conversationId: number): Promise<ChatMessage[]> {
  const res = await fetch(`${API_BASE}/api/shops/me/conversations/${conversationId}/messages`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new ChatUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getShopMessages failed: ${res.status}`);
  }
  return res.json();
}

export async function sendShopMessage(conversationId: number, body: string): Promise<ChatMessage> {
  const res = await fetch(`${API_BASE}/api/shops/me/conversations/${conversationId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (res.status === 401) {
    throw new ChatUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`sendShopMessage failed: ${res.status}`);
  }
  return res.json();
}

export async function getShopUnreadCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/shops/me/conversations/unread-count`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.unreadCount ?? 0;
}
