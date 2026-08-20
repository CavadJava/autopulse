import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompare, MAX_COMPARE } from '../context/CompareContext';
import { getListingById } from '../api/listings';
import type { Listing } from '../types';
import styles from './CompareBar.module.css';

export default function CompareBar() {
  const { ids, remove, clear } = useCompare();
  const navigate = useNavigate();
  const [listings, setListings] = useState<Record<string, Listing>>({});

  useEffect(() => {
    if (ids.length === 0) return;
    (async () => {
      const missing = ids.filter((id) => !listings[id]);
      if (missing.length === 0) return;
      const fetched = await Promise.all(missing.map((id) => getListingById(id)));
      setListings((prev) => {
        const next = { ...prev };
        fetched.forEach((l, idx) => {
          if (l) next[missing[idx]] = l;
        });
        return next;
      });
    })();
  }, [ids, listings]);

  if (ids.length === 0) return null;

  return (
    <div className={styles.bar}>
      <div className={styles.container}>
        <div className={styles.slots}>
          {ids.map((id) => {
            const l = listings[id];
            return (
              <div key={id} className={styles.slot}>
                {l ? (
                  <>
                    <img src={l.şəkillər[0]} alt={`${l.marka} ${l.model}`} />
                    <span className={styles.slotLabel}>
                      {l.marka} {l.model}
                    </span>
                  </>
                ) : (
                  <span className={styles.slotLoading}>...</span>
                )}
                <button className={styles.slotRemove} onClick={() => remove(id)}>
                  ✕
                </button>
              </div>
            );
          })}
          {Array.from({ length: MAX_COMPARE - ids.length }).map((_, idx) => (
            <div key={`empty-${idx}`} className={styles.slotEmpty} />
          ))}
        </div>
        <div className={styles.actions}>
          <button className={styles.clearBtn} onClick={clear}>
            Təmizlə
          </button>
          <button
            className={styles.compareBtn}
            disabled={ids.length < 2}
            onClick={() => navigate('/muqayise')}
          >
            Müqayisə et ({ids.length})
          </button>
        </div>
      </div>
    </div>
  );
}
