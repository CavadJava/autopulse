import { useEffect, useState } from 'react';
import FilterPanel from '../components/FilterPanel';
import type { Filters } from '../components/FilterPanel';
import QuickFilterBar from '../components/QuickFilterBar';
import ListingSection from '../components/ListingSection';
import RealListingSection from '../components/RealListingSection';
import { getListings, getRealListings } from '../api/listings';
import type { ApiListing } from '../api/listings';
import type { Listing } from '../types';
import styles from './Listings.module.css';

export default function Listings() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [realListings, setRealListings] = useState<ApiListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [mockData, realData] = await Promise.all([
          getListings(filters),
          getRealListings().catch((error) => {
            console.error('Failed to fetch real listings:', error);
            return [] as ApiListing[];
          }),
        ]);
        setListings(mockData);
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

  const salonVip = listings.filter((l) => l.vipTier === 'premium_vip' && l.satıcıTipi === 'diler');
  const vip = listings.filter((l) => l.vipTier === 'vip' || (l.vipTier === 'premium_vip' && l.satıcıTipi !== 'diler'));
  const standard = listings.filter((l) => l.vipTier === 'standart');

  return (
    <div className={styles.page}>
      <div className={styles.wide}>
        <QuickFilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          resultCount={listings.length + realListings.length}
          newTodayCount={1562}
        />
      </div>
      <div className={styles.container}>
        <FilterPanel filters={filters} onFilterChange={handleFilterChange} />
        <div className={styles.content}>
          <div className={styles.header}>
            <h1>Avtomobil Elanları</h1>
            <p className={styles.count}>
              {loading ? 'Axtarılır...' : `${listings.length + realListings.length} elan tapıldı`}
            </p>
          </div>
          {loading ? (
            <p className={styles.loading}>Yüklənir...</p>
          ) : (
            <>
              <ListingSection title="Salonların VIP Elanları" listings={salonVip} />
              <ListingSection title="VIP Elanlar" listings={vip} />
              <ListingSection title="Standard Elanlar" listings={standard} />
              <RealListingSection title="Yeni Elanlar" listings={realListings} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
