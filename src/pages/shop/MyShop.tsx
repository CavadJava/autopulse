import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyShopProducts, shopLogout, ShopUnauthorizedError } from '../../api/shop';
import type { ShopProduct } from '../../api/shop';
import styles from './MyShop.module.css';

export default function MyShop() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getMyShopProducts();
        setProducts(data);
      } catch (err) {
        if (err instanceof ShopUnauthorizedError) {
          navigate('/magaza-giris');
          return;
        }
        setError('Məhsullar yüklənərkən xəta baş verdi.');
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await shopLogout();
    } catch {
      // Best-effort — even if the network call fails, still take the user
      // back to the login page; they're no longer treating themselves as logged in.
    }
    navigate('/magaza-giris');
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>Yüklənir...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Mənim mağazam</h1>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          Çıxış
        </button>
      </div>

      {error && <p className={styles.status}>{error}</p>}

      {!error && products.length === 0 && (
        <p className={styles.status}>Hələ heç bir məhsulunuz yoxdur.</p>
      )}

      {!error && products.length > 0 && (
        <div className={styles.grid}>
          {products.map((product) => (
            <div key={product.id} className={styles.productCard}>
              <div className={styles.productTitle}>{product.title}</div>
              {product.details && <div className={styles.productDetails}>{product.details}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
