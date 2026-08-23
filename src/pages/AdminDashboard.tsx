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
import { previewNotification, sendNotification, getSentNotifications } from '../api/adminNotify';
import type { NotificationFilters, NotificationSummary } from '../api/adminNotify';
import styles from './AdminDashboard.module.css';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'pending' | 'shopProducts' | 'notifications'>('pending');

  const [pendingListings, setPendingListings] = useState<PendingUserListing[]>([]);
  const [shopProducts, setShopProducts] = useState<ShopProductForAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [actingId, setActingId] = useState<number | null>(null);

  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [notifRecipientType, setNotifRecipientType] = useState<'user' | 'shop' | ''>('');
  const [notifHasNonVip, setNotifHasNonVip] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sentList, setSentList] = useState<NotificationSummary[]>([]);

  const loadPending = async () => {
    const data = await getPendingListings();
    setPendingListings(data);
  };

  const loadShopProducts = async () => {
    const data = await getAllShopProducts();
    setShopProducts(data);
  };

  const loadSent = async () => {
    const data = await getSentNotifications();
    setSentList(data);
  };

  const buildFilters = (): NotificationFilters => ({
    recipientType: notifRecipientType,
    ...(notifHasNonVip ? { hasNonVipActiveListing: true } : {}),
  });

  const handlePreview = async () => {
    try {
      setPreviewCount(
        await previewNotification(notifTitle || '(preview)', notifBody || '(preview)', buildFilters())
      );
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        navigate('/admin');
        return;
      }
      setNotice('Alıcı sayı hesablanarkən xəta baş verdi.');
    }
  };

  const handleSend = async () => {
    if (!notifTitle || !notifBody) {
      setNotice('Başlıq və mətn tələb olunur.');
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      const result = await sendNotification(notifTitle, notifBody, buildFilters());
      setNotice(`Bildiriş ${result.recipientCount} alıcıya göndərildi.`);
      setNotifTitle('');
      setNotifBody('');
      setPreviewCount(null);
      await loadSent();
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        navigate('/admin');
        return;
      }
      setNotice('Bildiriş göndərilərkən xəta baş verdi.');
    } finally {
      setSending(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadPending(), loadShopProducts(), loadSent()]);
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
        <button
          className={activeTab === 'notifications' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('notifications')}
        >
          Bildirişlər ({sentList.length})
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

      {activeTab === 'notifications' && (
        <div className={styles.list}>
          <div className={styles.row}>
            <div className={styles.rowInfo} style={{ width: '100%' }}>
              <input
                className={styles.formInput}
                placeholder="Başlıq"
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
              />
              <textarea
                className={styles.formInput}
                placeholder="Mətn"
                value={notifBody}
                onChange={(e) => setNotifBody(e.target.value)}
                rows={3}
              />
              <div className={styles.rowDetails}>
                <label>
                  <input
                    type="radio"
                    checked={notifRecipientType === ''}
                    onChange={() => setNotifRecipientType('')}
                  />{' '}
                  Hər ikisi
                </label>{' '}
                <label>
                  <input
                    type="radio"
                    checked={notifRecipientType === 'user'}
                    onChange={() => setNotifRecipientType('user')}
                  />{' '}
                  Yalnız istifadəçilər
                </label>{' '}
                <label>
                  <input
                    type="radio"
                    checked={notifRecipientType === 'shop'}
                    onChange={() => setNotifRecipientType('shop')}
                  />{' '}
                  Yalnız mağazalar
                </label>
              </div>
              <div className={styles.rowDetails}>
                <label>
                  <input
                    type="checkbox"
                    checked={notifHasNonVip}
                    onChange={(e) => setNotifHasNonVip(e.target.checked)}
                  />{' '}
                  Yalnız VIP olmayan aktiv elanı olanlar
                </label>
              </div>
            </div>
            <div className={styles.rowActions}>
              <button className={styles.approveBtn} onClick={handlePreview}>
                Neçəyə çatacaq?
              </button>
              <button className={styles.approveBtn} onClick={handleSend} disabled={sending}>
                {sending ? '...' : 'Göndər'}
              </button>
            </div>
          </div>
          {previewCount !== null && (
            <p className={styles.status}>Bu filtrlərlə {previewCount} alıcıya çatacaq.</p>
          )}

          <h3>Göndərilmiş bildirişlər</h3>
          {sentList.length === 0 ? (
            <p className={styles.status}>Hələ heç bir bildiriş göndərilməyib.</p>
          ) : (
            sentList.map((n) => (
              <div key={n.id} className={styles.row}>
                <div className={styles.rowInfo}>
                  <div className={styles.rowTitle}>{n.title}</div>
                  <div className={styles.rowDetails}>{n.body}</div>
                  <span className={styles.statusBadge}>
                    Göndərildi: {n.sentCount} / Oxundu: {n.readCount}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
