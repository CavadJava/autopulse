import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getShops } from '../../api/shop';
import type { ShopSummary } from '../../api/shop';
import styles from './ShopList.module.css';

export default function ShopList() {
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getShops();
        setShops(data);
      } catch {
        setError('Mağazalar yüklənərkən xəta baş verdi.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Mağazalar</h1>

      {loading && <p className={styles.status}>Yüklənir...</p>}
      {error && <p className={styles.status}>{error}</p>}
      {!loading && !error && shops.length === 0 && (
        <p className={styles.status}>Hələ heç bir mağaza yoxdur.</p>
      )}

      <div className={styles.grid}>
        {shops.map((shop) => (
          <Link key={shop.id} to={`/magazalar/${shop.name}`} className={styles.card}>
            <div className={styles.cardIcon}>🏪</div>
            <div className={styles.cardTitle}>{shop.title}</div>
            <div className={styles.cardName}>@{shop.name}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
