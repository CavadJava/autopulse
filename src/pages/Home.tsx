import { useEffect, useState } from 'react';
import SearchHero from '../components/SearchHero';
import StatsBar from '../components/StatsBar';
import HowItWorks from '../components/HowItWorks';
import RealListingSection from '../components/RealListingSection';
import { getRealListings } from '../api/listings';
import type { ApiListing } from '../api/listings';
import styles from './Home.module.css';

export default function Home() {
  const [realListings, setRealListings] = useState<ApiListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const realData = await getRealListings();
        setRealListings(realData);
      } catch (error) {
        console.error('Failed to fetch listings:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const shopListings = realListings.filter((l) => l.source === 'shop').slice(0, 4);
  const userListings = realListings.filter((l) => l.source === 'user').slice(0, 4);

  return (
    <main>
      <SearchHero />
      <StatsBar />
      <section className={styles.featured}>
        <div className={styles.container}>
          {loading ? (
            <p>Yüklənir...</p>
          ) : (
            <>
              <RealListingSection
                title="Salonların VIP Elanları"
                listings={shopListings}
                viewAllHref="/elanlar"
                viewAllLabel="Bütün salon elanları →"
              />
              <RealListingSection
                title="Standard Elanlar"
                listings={userListings}
                viewAllHref="/elanlar"
                viewAllLabel="Hamısına bax →"
              />
            </>
          )}
        </div>
      </section>
      <HowItWorks />
    </main>
  );
}
