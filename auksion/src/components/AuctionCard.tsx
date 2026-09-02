import { Link } from 'react-router-dom';
import type { Listing } from '../api/auksion';
import CountdownTimer from './CountdownTimer';
import styles from './AuctionCard.module.css';

// `toLocaleString('az-AZ')` is CLDR-data-dependent — Node's bundled ICU (and
// some browsers) group thousands with '.' for az-AZ, not the space this app's
// design uses. Format deterministically instead of relying on runtime ICU data.
function formatPrice(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export default function AuctionCard({ listing }: { listing: Listing }) {
  const price = listing.currentBid ?? listing.startingBid;

  return (
    <Link to={`/elan/${listing.id}`} className={styles.card}>
      <div className={styles.imageContainer}>
        {listing.images[0] && <img src={listing.images[0]} alt={`${listing.make} ${listing.model}`} />}
        <div className={styles.countdownBadge}>
          <CountdownTimer endTime={listing.endTime} />
        </div>
      </div>
      <div className={styles.content}>
        <h3>
          {listing.make} {listing.model}
        </h3>
        <p className={styles.meta}>{listing.year}</p>
        <div className={styles.footer}>
          <div className={styles.price}>{formatPrice(price)} ₼</div>
          <div className={styles.priceLabel}>
            {listing.currentBid ? `${listing.bidCount} təklif` : 'Başlanğıc qiymət'}
          </div>
        </div>
      </div>
    </Link>
  );
}
