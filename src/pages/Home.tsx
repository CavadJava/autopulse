import { useEffect, useState } from 'react';
import SearchHero from '../components/SearchHero';
import StatsBar from '../components/StatsBar';
import HowItWorks from '../components/HowItWorks';
import ListingGrid from '../components/ListingGrid';
import { getListings } from '../api/listings';
import type { Listing } from '../types';
import { Link } from 'react-router-dom';
import styles from './Home.module.css';

export default function Home() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getListings();
        // Show only 6 most recent Premium/VIP listings
        const featured = data.slice(0, 6);
        setListings(featured);
      } catch (error) {
        console.error('Failed to fetch listings:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main>
      <SearchHero />
      <StatsBar />
      <section className={styles.featured}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <h2>Seçilmiş Elanlar</h2>
            <Link to="/elanlar" className={styles.viewAll}>Hamısına bax →</Link>
          </div>
          {loading ? <p>Yüklənir...</p> : <ListingGrid listings={listings} />}
        </div>
      </section>
      <HowItWorks />
    </main>
  );
}
