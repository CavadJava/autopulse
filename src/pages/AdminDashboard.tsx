import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getPendingListings,
  approveListing,
  rejectListing,
  getAllShopProducts,
  cancelShopProduct,
  adminLogout,
  AdminUnauthorizedError,
} from '../api/admin';
import type { PendingUserListing, ShopProductForAdmin } from '../api/admin';
import styles from './AdminDashboard.module.css';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'pending' | 'shopProducts'>('pending');

  const [pendingListings, setPendingListings] = useState<PendingUserListing[]>([]);
  const [shopProducts, setShopProducts] = useState<ShopProductForAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [actingId, setActingId] = useState<number | null>(null);

  const loadPending = async () => {
    const data = await getPendingListings();
    setPendingListings(data);
  };

  const loadShopProducts = async () => {
    const data = await getAllShopProducts();
    setShopProducts(data);
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadPending(), loadShopProducts()]);
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        navigate('/admin');
        return;
      }
      setError('Məlumatlar yüklənərkən xəta baş verdi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    try {
      await adminLogout();
    } catch {
      // Best-effort — even if the network call fails, still take the admin
      // back to the login page; they're no longer treating themselves as logged in.
    }
    navigate('/admin');
  };

  const handleApprove = async (id: number) => {
    setNotice(null);
    setActingId(id);
    try {
      await approveListing(id);
      await loadPending();
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        navigate('/admin');
        return;
      }
      setNotice('Elan təsdiqlənərkən xəta baş verdi.');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id: number) => {
    setNotice(null);
    setActingId(id);
    try {
      await rejectListing(id);
      await loadPending();
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        navigate('/admin');
        return;
      }
      setNotice('Elan rədd edilərkən xəta baş verdi.');
    } finally {
      setActingId(null);
    }
  };

  const handleCancel = async (id: number) => {
    setNotice(null);
    setActingId(id);
    try {
      await cancelShopProduct(id);
      await loadShopProducts();
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        navigate('/admin');
        return;
      }
      setNotice('Mağaza elanı ləğv edilərkən xəta baş verdi.');
    } finally {
      setActingId(null);
    }
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
        <h1 className={styles.title}>Superadmin paneli</h1>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          Çıxış
        </button>
      </div>

      {notice && <p className={styles.formError}>{notice}</p>}
      {error && <p className={styles.status}>{error}</p>}

      <div className={styles.tabBar}>
        <button
          className={activeTab === 'pending' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('pending')}
        >
          Gözləmədə elanlar ({pendingListings.length})
        </button>
        <button
          className={activeTab === 'shopProducts' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('shopProducts')}
        >
          Mağaza elanları ({shopProducts.length})
        </button>
      </div>

      {activeTab === 'pending' && (
        <>
          {pendingListings.length === 0 ? (
            <p className={styles.status}>Gözləmədə elan yoxdur.</p>
          ) : (
            <div className={styles.list}>
              {pendingListings.map((listing) => (
                <div key={listing.id} className={styles.row}>
                  <div className={styles.rowInfo}>
                    <div className={styles.rowTitle}>{listing.title}</div>
                    <div className={styles.rowDetails}>
                      {listing.marka} {listing.model} — {listing.qiymet} AZN
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      className={styles.approveBtn}
                      onClick={() => handleApprove(listing.id)}
                      disabled={actingId === listing.id}
                    >
                      {actingId === listing.id ? '...' : 'Təsdiqlə'}
                    </button>
                    <button
                      className={styles.rejectBtn}
                      onClick={() => handleReject(listing.id)}
                      disabled={actingId === listing.id}
                    >
                      {actingId === listing.id ? '...' : 'Rədd et'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'shopProducts' && (
        <>
          {shopProducts.length === 0 ? (
            <p className={styles.status}>Mağaza elanı yoxdur.</p>
          ) : (
            <div className={styles.list}>
              {shopProducts.map((product) => (
                <div key={product.id} className={styles.row}>
                  <div className={styles.rowInfo}>
                    <div className={styles.rowTitle}>{product.title}</div>
                    <div className={styles.rowDetails}>{product.name}</div>
                    <span className={styles.statusBadge}>{product.status}</span>
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      className={styles.rejectBtn}
                      onClick={() => handleCancel(product.id)}
                      disabled={actingId === product.id}
                    >
                      {actingId === product.id ? '...' : 'Ləğv et'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
