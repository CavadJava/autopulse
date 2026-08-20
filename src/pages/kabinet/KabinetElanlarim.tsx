import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMyListings, promoteListing, PROMO_PRICES } from '../../api/auth';
import type { PromoTier, UserListing, VIPTier, İstifadəçiElanStatusu } from '../../types';
import PromoteModal from '../../components/PromoteModal';
import styles from './KabinetElanlarim.module.css';

const STATUS_LABEL: Record<İstifadəçiElanStatusu, string> = {
  saytda: 'Saytda',
  imtina_olunub: 'İmtina olunub',
  gözləmədə: 'Gözləmədə',
  müddəti_başa_çatmış: 'Müddəti başa çatmış',
};

const STATUS_BADGE_CLASS: Record<İstifadəçiElanStatusu, string> = {
  saytda: styles.badgeSaytda,
  imtina_olunub: styles.badgeImtina,
  gözləmədə: styles.badgeGözləmədə,
  müddəti_başa_çatmış: styles.badgeBaşaÇatmış,
};

const VIP_TIER_LABEL: Record<VIPTier, string> = {
  standart: 'Standart',
  vip: 'VIP',
  premium_vip: 'Premium VIP',
};

type FilterKey = 'hamısı' | İstifadəçiElanStatusu;

export default function KabinetElanlarim() {
  const { user, login } = useAuth();
  const [listings, setListings] = useState<UserListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('hamısı');
  const [promotingId, setPromotingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const data = await getMyListings(user.hesabTipi);
        setListings(data);
      } finally {
        setLoading(false);
      }
    })();
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

  const TABS: { key: FilterKey; label: string }[] = [
    { key: 'hamısı', label: 'Bütün elanlar' },
    { key: 'saytda', label: 'Saytda' },
    { key: 'müddəti_başa_çatmış', label: 'Müddəti başa çatmış' },
    { key: 'gözləmədə', label: 'Gözləmədə' },
    { key: 'imtina_olunub', label: 'İmtina olunmuş' },
  ];

  const promotingListing = listings.find((l) => l.id === promotingId) ?? null;

  const handlePromote = async (tier: PromoTier) => {
    if (!user || !promotingListing) return;
    const updated = await promoteListing(user.hesabTipi, promotingListing.listingId, tier);
    login({ ...user, balans: user.balans - PROMO_PRICES[tier] });
    setListings((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
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

      {loading ? (
        <p className={styles.empty}>Yüklənir...</p>
      ) : filtered.length === 0 ? (
        <p className={styles.empty}>Bu kateqoriyada elan yoxdur.</p>
      ) : (
        <div className={styles.grid}>
          {filtered.map((listing) => (
            <div key={listing.id} className={styles.card}>
              <Link to={`/elan/${listing.listingId}`} className={styles.imageLink}>
                <img src={listing.şəkil} alt={listing.başlıq} />
                <span className={STATUS_BADGE_CLASS[listing.status]}>
                  {STATUS_LABEL[listing.status]}
                </span>
                {listing.vipTier !== 'standart' && (
                  <span className={styles.vipBadge}>{VIP_TIER_LABEL[listing.vipTier]}</span>
                )}
              </Link>
              <div className={styles.cardBody}>
                <div className={styles.price}>{listing.qiymət.toLocaleString()} AZN</div>
                <div className={styles.başlıq}>{listing.başlıq}</div>
                <div className={styles.cardActions}>
                  <Link to={`/elan-ver/${listing.listingId}`} className={styles.editBtn}>
                    ✎ Redaktə et
                  </Link>
                  <button className={styles.adBtn} onClick={() => setPromotingId(listing.id)}>
                    📈 Reklam et
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {promotingListing && (
        <PromoteModal onClose={() => setPromotingId(null)} onConfirm={handlePromote} />
      )}
    </div>
  );
}
