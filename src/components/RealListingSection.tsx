import { Link } from 'react-router-dom';
import type { ApiListing } from '../api/listings';
import RealListingGrid from './RealListingGrid';
import styles from './ListingSection.module.css';

interface RealListingSectionProps {
  title: string;
  listings: ApiListing[];
  viewAllHref?: string;
  viewAllLabel?: string;
  emptyMessage?: string;
}

export default function RealListingSection({
  title,
  listings,
  viewAllHref,
  viewAllLabel = 'Bütün elanlar →',
  emptyMessage = 'Bu kateqoriyada hələ elan yoxdur.',
}: RealListingSectionProps) {
  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2>{title}</h2>
        {viewAllHref && (
          <Link to={viewAllHref} className={styles.viewAll}>
            {viewAllLabel}
          </Link>
        )}
      </div>
      {listings.length === 0 ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        <RealListingGrid listings={listings} />
      )}
    </section>
  );
}
