import { Link } from 'react-router-dom';
import type { Listing } from '../types';
import { useCompare } from '../context/CompareContext';
import styles from './ListingCard.module.css';

export default function ListingCard({ listing }: { listing: Listing }) {
  const { isCompared, toggle, maxReached } = useCompare();
  const compared = isCompared(listing.id);

  const badgeClass = {
    vip: styles.badgeVip,
    premium_vip: styles.badgePremiumVip,
    standart: '',
  }[listing.vipTier];

  const handleCompareClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(listing.id);
  };

  return (
    <Link to={`/elan/${listing.id}`} className={styles.card}>
      <div className={styles.imageContainer}>
        <img src={listing.şəkillər[0]} alt={`${listing.marka} ${listing.model}`} />
        {listing.vipTier !== 'standart' && (
          <div className={`${styles.badge} ${badgeClass}`}>
            {listing.vipTier === 'vip' ? 'VIP' : 'PREMIUM'}
          </div>
        )}
        <button
          type="button"
          className={compared ? styles.compareBtnActive : styles.compareBtn}
          onClick={handleCompareClick}
          disabled={!compared && maxReached}
          title={!compared && maxReached ? 'Maksimum 3 elan müqayisə edilə bilər' : undefined}
        >
          <span className={compared ? styles.compareCheckActive : styles.compareCheck} />
          Müqayisə et
        </button>
      </div>
      <div className={styles.content}>
        <h3>
          {listing.marka} {listing.model}
        </h3>
        <p className={styles.meta}>
          {listing.il} · {listing.şəhər} · {listing.yürüş.toLocaleString()} km
        </p>
        <div className={styles.specs}>
          <span>{listing.yanacaq}</span>
          <span>{listing.vəziyyət}</span>
          <span>{listing.ban}</span>
        </div>
        <div className={styles.footer}>
          <div className={styles.price}>{listing.qiymət.toLocaleString()} ₼</div>
          <div className={styles.badges}>
            {listing.kredit && <span className={styles.feature}>Kredit</span>}
            {listing.barter && <span className={styles.feature}>Barter</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
