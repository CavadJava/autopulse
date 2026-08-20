import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getListingById, getListings } from '../api/listings';
import { promoteListing, PROMO_PRICES } from '../api/auth';
import type { Listing, PromoTier } from '../types';
import InteractiveGallery from '../components/InteractiveGallery';
import ListingDetailTabs from '../components/ListingDetailTabs';
import PromoteModal from '../components/PromoteModal';
import { useAuth } from '../context/AuthContext';
import styles from './ListingDetail.module.css';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('az-AZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function memberSince(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('az-AZ', { month: '2-digit', year: 'numeric' });
}

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, login } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [similar, setSimilar] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setPhoneRevealed(false);
      try {
        if (id) {
          const detail = await getListingById(id);
          setListing(detail);

          if (detail) {
            const allListings = await getListings();
            const similarListings = allListings
              .filter(
                (l) =>
                  l.id !== id &&
                  (l.marka === detail.marka || l.qiymət < detail.qiymət + 10000)
              )
              .slice(0, 4);
            setSimilar(similarListings);
          }
        }
      } catch (error) {
        console.error('Failed to fetch listing:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className={styles.loading}>Yüklənir...</div>;
  if (!listing) return <div className={styles.error}>Elan tapılmadı.</div>;

  const maskedPhone = listing.satıcıZəng.replace(/(\+994\d{2})\d{3}(\d{2})(\d{2})/, '$1 XXX $2 $3');

  const handlePromote = async (tier: PromoTier) => {
    if (!user || !listing) return;
    await promoteListing(user.hesabTipi, listing.id, tier);
    login({ ...user, balans: user.balans - PROMO_PRICES[tier] });
    setListing({ ...listing, vipTier: tier === 'ireli_cek' ? 'standart' : tier });
  };

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to={`/elanlar?marka=${listing.marka}`}>{listing.marka}</Link>
        <span className={styles.breadcrumbSep}>·</span>
        <span className={styles.breadcrumbCurrent}>{listing.model}</span>
        <span className={styles.breadcrumbSep}>·</span>
        <span className={styles.breadcrumbId}>Elan № {listing.id.padStart(8, '0')}</span>
      </div>

      <div className={styles.container}>
        <div className={styles.main}>
          <InteractiveGallery listing={listing} />

          <h1 className={styles.title}>
            {listing.marka} {listing.model}
          </h1>
          <p className={styles.meta}>
            {listing.il} · {listing.şəhər} · {listing.yürüş.toLocaleString()} km
          </p>
          <p className={styles.subMeta}>
            👁 {listing.baxışSayı.toLocaleString()} baxış · Yeniləndi: {formatDate(listing.tarix)}
          </p>

          <ListingDetailTabs listing={listing} similar={similar} />
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.contactCard}>
            <div className={styles.priceRow}>
              <div className={styles.price}>{listing.qiymət.toLocaleString()} ₼</div>
            </div>
            <div className={styles.featureRow}>
              {listing.kredit && <span className={styles.feature}>Kredit</span>}
              {listing.barter && <span className={styles.feature}>Barter</span>}
            </div>

            <div className={styles.cardDivider} />

            <div className={styles.sellerRow}>
              <div>
                <p className={styles.sellerName}>{listing.satıcıAd}</p>
                <p className={styles.sellerMeta}>{listing.şəhər}</p>
                <p className={styles.sellerMeta}>
                  Satıcı {memberSince(listing.satıcıÜzvlükTarixi)} tarixindən AutoPulse-da
                </p>
              </div>
              <span className={styles.sellerTypeBadge}>
                {listing.satıcıTipi === 'diler' ? 'Diler / Salon' : 'Şəxsi'}
              </span>
            </div>

            <button className={styles.btnCall} onClick={() => setPhoneRevealed(true)}>
              📞 {phoneRevealed ? listing.satıcıZəng : `Nömrəni göstər · ${maskedPhone}`}
            </button>
            <button className={styles.btnMessage}>💬 Mesaj yaz</button>

            <div className={styles.cardDivider} />

            <div className={styles.promoGrid}>
              <button className={styles.promoTile} onClick={() => setPromoteOpen(true)}>
                <span className={styles.promoIcon}>↑</span>
                <span>İrəli çək</span>
                <span className={styles.promoPrice}>{PROMO_PRICES.ireli_cek} AZN</span>
              </button>
              <button className={styles.promoTile} onClick={() => setPromoteOpen(true)}>
                <span className={styles.promoIcon}>♦</span>
                <span>VIP</span>
                <span className={styles.promoPrice}>{PROMO_PRICES.vip} AZN</span>
              </button>
              <button className={styles.promoTile} onClick={() => setPromoteOpen(true)}>
                <span className={styles.promoIcon}>♛</span>
                <span>Premium</span>
                <span className={styles.promoPrice}>{PROMO_PRICES.premium_vip} AZN</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {promoteOpen && user && (
        <PromoteModal onClose={() => setPromoteOpen(false)} onConfirm={handlePromote} />
      )}
    </div>
  );
}
