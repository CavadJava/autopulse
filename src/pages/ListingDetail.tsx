import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getListingById, getListings } from '../api/listings';
import type { Listing } from '../types';
import ListingGrid from '../components/ListingGrid';
import styles from './ListingDetail.module.css';

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [similar, setSimilar] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setSelectedImage(0);
      try {
        if (id) {
          const detail = await getListingById(id);
          setListing(detail);

          if (detail) {
            const allListings = await getListings();
            const similarListings = allListings
              .filter(
                (l) =>
                  l.id !== id &&
                  (l.marka === detail.marka || l.qiymət < detail.qiymət + 10000)
              )
              .slice(0, 4);
            setSimilar(similarListings);
          }
        }
      } catch (error) {
        console.error('Failed to fetch listing:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className={styles.loading}>Yüklənir...</div>;
  if (!listing) return <div className={styles.error}>Elan tapılmadı.</div>;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.gallery}>
          <div className={styles.mainImage}>
            <img src={listing.şəkillər[selectedImage]} alt="Main" />
          </div>
          <div className={styles.thumbnails}>
            {listing.şəkillər.map((img, idx) => (
              <img
                key={idx}
                src={img}
                alt="Thumbnail"
                className={selectedImage === idx ? styles.active : ''}
                onClick={() => setSelectedImage(idx)}
              />
            ))}
          </div>
        </div>

        <div className={styles.content}>
          <h1 className={styles.title}>
            {listing.marka} {listing.model}
          </h1>
          <p className={styles.meta}>
            {listing.il} · {listing.şəhər} · {listing.yürüş.toLocaleString()} km
          </p>

          <div className={styles.priceBlock}>
            <div className={styles.price}>{listing.qiymət.toLocaleString()} ₼</div>
            {listing.kredit && <span className={styles.feature}>Kredit Mövcuddur</span>}
            {listing.barter && <span className={styles.feature}>Barter Qəbul Edir</span>}
          </div>

          <section className={styles.section}>
            <h2>Texniki Xarakteristikalar</h2>
            <table className={styles.specsTable}>
              <tbody>
                <tr>
                  <td>Mühərrik Həcmi</td>
                  <td>{listing.mühərrik}</td>
                </tr>
                <tr>
                  <td>Yanacaq</td>
                  <td>{listing.yanacaq}</td>
                </tr>
                <tr>
                  <td>Ban Növü</td>
                  <td>{listing.ban}</td>
                </tr>
                <tr>
                  <td>Ötürücü Qutusu</td>
                  <td>{listing.ötürücü}</td>
                </tr>
                <tr>
                  <td>Rəng</td>
                  <td>{listing.rəng}</td>
                </tr>
                <tr>
                  <td>Vəziyyət</td>
                  <td>{listing.vəziyyət}</td>
                </tr>
                <tr>
                  <td>Yürüş</td>
                  <td>{listing.yürüş.toLocaleString()} km</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className={styles.section}>
            <h2>Təsvir</h2>
            <p>{listing.təsvir}</p>
          </section>

          <section className={styles.contactBlock}>
            <h2>Satıcı ilə Əlaqə Kur</h2>
            <p className={styles.sellerName}>{listing.satıcıAd}</p>
            <div className={styles.actions}>
              <button className={styles.btnCall}>📞 Zəng Et</button>
              <button className={styles.btnMessage}>💬 Mesaj Gönder</button>
            </div>
            <p className={styles.phone}>{listing.satıcıZəng}</p>
          </section>

          <section className={styles.section}>
            <h2>Yerləşmə</h2>
            <div className={styles.mapPlaceholder}>
              <img src="/mock-map.svg" alt="Xəritə" />
              <p>{listing.şəhər}</p>
            </div>
          </section>
        </div>
      </div>

      {similar.length > 0 && (
        <section className={styles.similarSection}>
          <div className={styles.similarContainer}>
            <h2>Oxşar Elanlar</h2>
            <ListingGrid listings={similar} />
          </div>
        </section>
      )}
    </div>
  );
}
