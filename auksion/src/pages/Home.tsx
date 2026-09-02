import { useEffect, useState } from 'react';
import { getLiveListings, type Listing } from '../api/auksion';
import AuctionCard from '../components/AuctionCard';
import styles from './Home.module.css';

export default function Home() {
  const [listings, setListings] = useState<Listing[] | null>(null);

  useEffect(() => {
    getLiveListings().then(setListings).catch(() => setListings([]));
  }, []);

  if (listings === null) {
    return <div className={styles.page}>Yüklənir...</div>;
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Aktiv hərraclar</h1>
      {listings.length === 0 ? (
        <p className={styles.empty}>Hazırda aktiv hərraj yoxdur.</p>
      ) : (
        <div className={styles.grid}>
          {listings.map((listing) => (
            <AuctionCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
