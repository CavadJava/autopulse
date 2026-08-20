import { useEffect, useState } from 'react';
import FilterPanel, { Filters } from '../components/FilterPanel';
import ListingGrid from '../components/ListingGrid';
import { getListings } from '../api/listings';
import { Listing } from '../types';
import styles from './Listings.module.css';

export default function Listings() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await getListings(filters);
        setListings(data);
      } catch (error) {
        console.error('Failed to fetch listings:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [filters]);

  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters);
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <FilterPanel onFilterChange={handleFilterChange} />
        <div className={styles.content}>
          <div className={styles.header}>
            <h1>Avtomobil Elanları</h1>
            <p className={styles.count}>
              {loading ? 'Axtarılır...' : `${listings.length} elan tapıldı`}
            </p>
          </div>
          {loading ? (
            <p className={styles.loading}>Yüklənir...</p>
          ) : (
            <ListingGrid listings={listings} />
          )}
        </div>
      </div>
    </div>
  );
}
