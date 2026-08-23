import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getMyListings,
  apiListingToUserListing,
  deleteUserListing,
  UserUnauthorizedError,
} from '../../api/auth';
import type { UserListing, İstifadəçiElanStatusu } from '../../types';
import styles from './KabinetElanlarim.module.css';

const STATUS_LABEL: Record<İstifadəçiElanStatusu, string> = {
  saytda: 'Saytda',
  imtina_olunub: 'Ləğv edilib',
  gözləmədə: 'Gözləmədə',
  müddəti_başa_çatmış: 'Müddəti başa çatmış',
};

const STATUS_BADGE_CLASS: Record<İstifadəçiElanStatusu, string> = {
  saytda: styles.badgeSaytda,
  imtina_olunub: styles.badgeImtina,
  gözləmədə: styles.badgeGözləmədə,
  müddəti_başa_çatmış: styles.badgeBaşaÇatmış,
};

type FilterKey = 'hamısı' | İstifadəçiElanStatusu;

// Real backend statuses this page groups listings by: saytda (live), gözləmədə
// (pending review), imtina_olunub (cancelled/rejected). müddəti_başa_çatmış has
// no backend equivalent yet, so it never appears in counts/filtered results —
// its tab and label are kept only so the type/UI stay consistent if it's added later.
const TABS: { key: FilterKey; label: string }[] = [
  { key: 'hamısı', label: 'Bütün elanlar' },
  { key: 'saytda', label: 'Saytda' },
  { key: 'gözləmədə', label: 'Gözləmədə' },
  { key: 'imtina_olunub', label: 'Ləğv edilib' },
];

export default function KabinetElanlarim() {
  const { user } = useAuth();
  const [listings, setListings] = useState<UserListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('hamısı');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadListings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyListings();
      setListings(data.map(apiListingToUserListing));
    } catch (err) {
      if (err instanceof UserUnauthorizedError) {
        setError('Kabinetə giriş etməmisiniz.');
      } else {
        setError('Elanlar yüklənərkən xəta baş verdi.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const counts = useMemo(() => {
    const base: Record<FilterKey, number> = {
      hamısı: listings.length,
      saytda: 0,
      imtina_olunub: 0,
      gözləmədə: 0,
      müddəti_başa_çatmış: 0,
    };
    listings.forEach((l) => {
      base[l.status] += 1;
    });
    return base;
  }, [listings]);

  const filtered = filter === 'hamısı' ? listings : listings.filter((l) => l.status === filter);

  const handleDelete = async (listing: UserListing) => {
    if (!window.confirm('Bu elanı silmək istədiyinizə əminsiniz?')) return;
    setDeletingId(listing.id);
    try {
      await deleteUserListing(Number(listing.listingId));
      await loadListings();
    } catch (err) {
      if (err instanceof UserUnauthorizedError) {
        setError('Kabinetə giriş etməmisiniz.');
      } else {
        setError('Elan silinərkən xəta baş verdi.');
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className={styles.filterTabs}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={filter === tab.key ? styles.filterTabActive : styles.filterTab}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label} ({counts[tab.key]})
          </button>
        ))}
      </div>

      {error && <p className={styles.empty}>{error}</p>}

      {!error && loading ? (
        <p className={styles.empty}>Yüklənir...</p>
      ) : !error && filtered.length === 0 ? (
        <p className={styles.empty}>Bu kateqoriyada elan yoxdur.</p>
      ) : !error ? (
        <div className={styles.grid}>
          {filtered.map((listing) => (
            <div key={listing.id} className={styles.card}>
              <div className={styles.imageLink}>
                {listing.şəkil ? (
                  <img src={listing.şəkil} alt={listing.başlıq} />
                ) : (
                  <div className={styles.noImage} />
                )}
                <span className={STATUS_BADGE_CLASS[listing.status]}>
                  {STATUS_LABEL[listing.status]}
                </span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.price}>{listing.qiymət.toLocaleString()} AZN</div>
                <div className={styles.başlıq}>{listing.başlıq}</div>
                <div className={styles.cardActions}>
                  <Link to={`/elan-ver/${listing.listingId}`} className={styles.editBtn}>
                    ✎ Redaktə et
                  </Link>
                  <button
                    className={styles.adBtn}
                    onClick={() => handleDelete(listing)}
                    disabled={deletingId === listing.id}
                  >
                    {deletingId === listing.id ? 'Silinir...' : '🗑 Sil'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
