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
        <h3>{listing.title || `${listing.marka} ${listing.model}`.trim()}</h3>
        {(() => {
          const metaParts = [
            [listing.marka, listing.model].filter(Boolean).join(' '),
            listing.il > 0 ? String(listing.il) : '',
            listing.yurus > 0 ? `${listing.yurus.toLocaleString()} km` : '',
          ].filter(Boolean);
          return metaParts.length > 0 ? <p className={styles.meta}>{metaParts.join(' · ')}</p> : null;
        })()}
        {(listing.yanacaq || listing.ban) && (
          <div className={styles.specs}>
            {listing.yanacaq && <span>{listing.yanacaq}</span>}
            {listing.ban && <span>{listing.ban}</span>}
          </div>
        )}
        <div className={styles.footer}>
          <div className={styles.price}>{listing.qiymet.toLocaleString()} ₼</div>
        </div>
      </div>
    </Link>
  );
}
