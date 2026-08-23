import { Link } from 'react-router-dom';
import type { ApiListing } from '../api/listings';
import styles from './ListingCard.module.css';

export default function RealListingCard({ listing }: { listing: ApiListing }) {
  const image = listing.images[0];
  const href = `/elan/${listing.source}-${listing.id}`;

  return (
    <Link to={href} className={styles.card}>
      <div className={styles.imageContainer}>
        {image ? (
          <img src={image.s3Url || image.minioUrl} alt={listing.title} />
        ) : (
          <div className={styles.placeholderImage} />
        )}
        <div className={`${styles.badge} ${styles.badgeReal}`}>
          {listing.sellerType === 'diler' ? 'Diler / Salon' : 'Şəxsi'}
        </div>
      </div>
      <div className={styles.content}>
        <h3>{listing.title || `${listing.marka} ${listing.model}`}</h3>
        <p className={styles.meta}>
          {listing.marka} {listing.model} · {listing.il} · {listing.yurus.toLocaleString()} km
        </p>
        <div className={styles.specs}>
          <span>{listing.yanacaq}</span>
          <span>{listing.ban}</span>
        </div>
        <div className={styles.footer}>
          <div className={styles.price}>{listing.qiymet.toLocaleString()} ₼</div>
        </div>
      </div>
    </Link>
  );
}
