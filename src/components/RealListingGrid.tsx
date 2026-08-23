import type { ApiListing } from '../api/listings';
import RealListingCard from './RealListingCard';
import styles from './ListingGrid.module.css';

export default function RealListingGrid({ listings }: { listings: ApiListing[] }) {
  if (listings.length === 0) {
    return <p className={styles.empty}>Elan tapılmadı.</p>;
  }

  return (
    <div className={styles.grid}>
      {listings.map((listing) => (
        <RealListingCard key={`${listing.source}-${listing.id}`} listing={listing} />
      ))}
    </div>
  );
}
