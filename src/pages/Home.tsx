import { useEffect, useState } from 'react';
import SearchHero from '../components/SearchHero';
import StatsBar from '../components/StatsBar';
import HowItWorks from '../components/HowItWorks';
import ListingSection from '../components/ListingSection';
import { getListings } from '../api/listings';
import type { Listing } from '../types';
import styles from './Home.module.css';

export default function Home() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getListings();
        setListings(data);
      } catch (error) {
        console.error('Failed to fetch listings:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const salonVip = listings.filter((l) => l.vipTier === 'premium_vip' && l.satıcıTipi === 'diler').slice(0, 4);
  const vip = listings.filter((l) => l.vipTier === 'vip' || (l.vipTier === 'premium_vip' && l.satıcıTipi !== 'diler')).slice(0, 4);
  const standard = listings.filter((l) => l.vipTier === 'standart').slice(0, 4);

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
              <ListingSection
                title="Salonların VIP Elanları"
                listings={salonVip}
                viewAllHref="/elanlar"
                viewAllLabel="Bütün salon elanları →"
              />
              <ListingSection
                title="VIP Elanlar"
                listings={vip}
                viewAllHref="/elanlar"
                viewAllLabel="Bütün VIP elanlar →"
              />
              <ListingSection
                title="Standard Elanlar"
                listings={standard}
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
