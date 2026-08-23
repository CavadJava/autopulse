import { useEffect, useState } from 'react';
import FilterPanel from '../components/FilterPanel';
import type { Filters } from '../components/FilterPanel';
import QuickFilterBar from '../components/QuickFilterBar';
import RealListingSection from '../components/RealListingSection';
import { getRealListings } from '../api/listings';
import type { ApiListing } from '../api/listings';
import styles from './Listings.module.css';

export default function Listings() {
  const [realListings, setRealListings] = useState<ApiListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const realData = await getRealListings();
        setRealListings(realData);
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

  const shopListings = realListings.filter((l) => l.source === 'shop');
  const userListings = realListings.filter((l) => l.source === 'user');

  return (
    <div className={styles.page}>
      <div className={styles.wide}>
        <QuickFilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          resultCount={realListings.length}
          newTodayCount={1562}
        />
      </div>
      <div className={styles.container}>
        <FilterPanel filters={filters} onFilterChange={handleFilterChange} />
        <div className={styles.content}>
          <div className={styles.header}>
            <h1>Avtomobil Elanları</h1>
            <p className={styles.count}>
              {loading ? 'Axtarılır...' : `${realListings.length} elan tapıldı`}
            </p>
          </div>
          {loading ? (
            <p className={styles.loading}>Yüklənir...</p>
          ) : (
            <>
              <RealListingSection title="Salonların VIP Elanları" listings={shopListings} />
              <RealListingSection title="Standard Elanlar" listings={userListings} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
