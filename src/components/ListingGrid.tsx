import type { Listing } from '../types';
import ListingCard from './ListingCard';
import styles from './ListingGrid.module.css';

export default function ListingGrid({ listings }: { listings: Listing[] }) {
  if (listings.length === 0) {
    return <p className={styles.empty}>Elan tapılmadı.</p>;
  }

  return (
    <div className={styles.grid}>
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
