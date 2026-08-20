import { Link } from 'react-router-dom';
import type { Listing } from '../types';
import styles from './ListingCard.module.css';

export default function ListingCard({ listing }: { listing: Listing }) {
  const badgeClass = {
    vip: styles.badgeVip,
    premium_vip: styles.badgePremiumVip,
    standart: styles.badgeStandart,
  }[listing.vipTier];

  return (
    <Link to={`/elan/${listing.id}`} className={styles.card}>
      <div className={styles.imageContainer}>
        <img src={listing.şəkillər[0]} alt={`${listing.marka} ${listing.model}`} />
        {listing.vipTier !== 'standart' && (
          <div className={`${styles.badge} ${badgeClass}`}>
            {listing.vipTier === 'vip' ? 'VIP' : 'PREMIUM VIP'}
          </div>
        )}
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
          {listing.kredit && <span className={styles.feature}>Kredit</span>}
          {listing.barter && <span className={styles.feature}>Barter</span>}
        </div>
      </div>
    </Link>
  );
}
