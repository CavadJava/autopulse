import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getShopByName, getShopProducts, ShopNotFoundError } from '../../api/shop';
import type { Shop, ShopProduct } from '../../api/shop';
import styles from './ShopFront.module.css';

export default function ShopFront() {
  const { name } = useParams<{ name: string }>();
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const shopData = await getShopByName(name);
        setShop(shopData);
        const productData = await getShopProducts(shopData.id);
        setProducts(productData);
      } catch (err) {
        if (err instanceof ShopNotFoundError) {
          setError('Mağaza tapılmadı.');
        } else {
          setError('Mağaza yüklənərkən xəta baş verdi.');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [name]);

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>Yüklənir...</p>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>{error ?? 'Mağaza tapılmadı.'}</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroIcon}>🏪</div>
        <div>
          <h1 className={styles.title}>{shop.title}</h1>
          <p className={styles.name}>@{shop.name}</p>
        </div>
      </div>

      {shop.details && <p className={styles.details}>{shop.details}</p>}
      {shop.workTimes && (
        <p className={styles.workTimes}>
          <strong>İş saatları:</strong> {shop.workTimes}
        </p>
      )}

      <h2 className={styles.sectionTitle}>Məhsullar</h2>

      {products.length === 0 ? (
        <p className={styles.status}>Bu mağazada hələ məhsul yoxdur.</p>
      ) : (
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
