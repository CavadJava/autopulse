import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'autopulse.compare';
const MAX_COMPARE = 3;

interface CompareContextValue {
  ids: string[];
  isCompared: (id: string) => boolean;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  maxReached: boolean;
}

const CompareContext = createContext<CompareContextValue | undefined>(undefined);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setIds(JSON.parse(stored));
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const persist = (next: string[]) => {
    setIds(next);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const isCompared = (id: string) => ids.includes(id);

  const toggle = (id: string) => {
    if (ids.includes(id)) {
      persist(ids.filter((i) => i !== id));
      return;
    }
    if (ids.length >= MAX_COMPARE) return;
    persist([...ids, id]);
  };

  const remove = (id: string) => {
    persist(ids.filter((i) => i !== id));
  };

  const clear = () => {
    persist([]);
  };

  return (
    <CompareContext.Provider
      value={{ ids, isCompared, toggle, remove, clear, maxReached: ids.length >= MAX_COMPARE }}
    >
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const ctx = useContext(CompareContext);
  if (!ctx) {
    throw new Error('useCompare must be used within CompareProvider');
  }
  return ctx;
}

export { MAX_COMPARE };
