import { Link } from 'react-router-dom';
import type { Listing } from '../types';
import ListingGrid from './ListingGrid';
import styles from './ListingSection.module.css';

interface ListingSectionProps {
  title: string;
  listings: Listing[];
  viewAllHref?: string;
  viewAllLabel?: string;
  emptyMessage?: string;
}

export default function ListingSection({
  title,
  listings,
  viewAllHref,
  viewAllLabel = 'Bütün elanlar →',
  emptyMessage = 'Bu kateqoriyada hələ elan yoxdur.',
}: ListingSectionProps) {
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
        <ListingGrid listings={listings} />
      )}
    </section>
  );
}
