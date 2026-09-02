import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getListing, type Listing, type Bid } from '../api/auksion';
import BidBox from '../components/BidBox';
import CountdownTimer from '../components/CountdownTimer';
import styles from './ListingDetail.module.css';

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);

  const listingId = Number(id);

  const load = () => {
    getListing(listingId).then((detail) => {
      setListing(detail.listing);
      setBids(detail.bids);
    });
  };

  useEffect(() => {
    load();
    // Poll for live bid updates every 4 seconds while this page is open.
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  if (!listing) {
    return <div className={styles.page}>Yüklənir...</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.gallery}>
        {listing.images[0] ? (
          <img src={listing.images[0]} alt={`${listing.make} ${listing.model}`} />
        ) : (
          <div className={styles.placeholder} />
        )}
      </div>
      <div className={styles.info}>
        <h1>
          {listing.make} {listing.model}
        </h1>
        <p className={styles.meta}>
          {listing.year} · <CountdownTimer endTime={listing.endTime} onEnd={load} /> qalıb
        </p>
        {listing.description && <p className={styles.description}>{listing.description}</p>}
        <BidBox
          listing={listing}
          bids={bids}
          onBidPlaced={(updated) => {
            setListing(updated);
            load();
          }}
        />
      </div>
    </div>
  );
}
