import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// jsdom's localStorage can be uninitialized in some test runs (vitest issue).
// Provide a real in-memory implementation backed by a Map to ensure correct round-tripping.
const store = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  length: 0,
};

Object.defineProperty(localStorageMock, 'length', {
  get: () => store.size,
});

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

afterEach(() => {
  cleanup();
  // Clear localStorage between tests to avoid cross-test pollution
  store.clear();
});
