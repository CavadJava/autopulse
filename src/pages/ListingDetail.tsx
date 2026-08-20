import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getListingById, getListings } from '../api/listings';
import type { Listing } from '../types';
import ListingGrid from '../components/ListingGrid';
import styles from './ListingDetail.module.css';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('az-AZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function memberSince(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('az-AZ', { month: '2-digit', year: 'numeric' });
}

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null>(null);
  const [similar, setSimilar] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [phoneRevealed, setPhoneRevealed] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setSelectedImage(0);
      setPhoneRevealed(false);
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

  const maskedPhone = listing.satıcıZəng.replace(/(\+994\d{2})\d{3}(\d{2})(\d{2})/, '$1 XXX $2 $3');

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
          <p className={styles.subMeta}>
            👁 {listing.baxışSayı.toLocaleString()} baxış · Yeniləndi: {formatDate(listing.tarix)}
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
                  <td>Marka / Model</td>
                  <td>{listing.marka} {listing.model}</td>
                </tr>
                <tr>
                  <td>Buraxılış ili</td>
                  <td>{listing.il}</td>
                </tr>
                <tr>
                  <td>Mühərrik Həcmi</td>
                  <td>{listing.mühərrik} · {listing.güc} a.g.</td>
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
                  <td>{listing.ötürücü} · {listing.sürətlərQutusu} sürət</td>
                </tr>
                <tr>
                  <td>Yerlərin sayı</td>
                  <td>{listing.yerlərSayı}</td>
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
                <tr>
                  <td>Hansı bazar üçün yığılıb</td>
                  <td>{listing.bazarÜçünYığılıb}</td>
                </tr>
                <tr>
                  <td>Vuruq / Rəng dəyişikliyi</td>
                  <td>
                    {listing.vuruğuVar ? 'Vuruğu var' : 'Vuruğu yoxdur'} ·{' '}
                    {listing.rənglənib ? 'Rənglənib' : 'Rənglənməyib'}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className={styles.section}>
            <h2>Təsvir</h2>
            <p>{listing.təsvir}</p>
          </section>

          {listing.təchizat.length > 0 && (
            <section className={styles.section}>
              <h2>Avtomobildə mövcud əşyalar</h2>
              <div className={styles.equipmentGrid}>
                {listing.təchizat.map((item) => (
                  <span key={item} className={styles.equipmentPill}>
                    {item}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className={styles.contactBlock}>
            <h2>Satıcı Məlumatları</h2>
            <div className={styles.sellerRow}>
              <div>
                <p className={styles.sellerName}>{listing.satıcıAd}</p>
                <p className={styles.sellerMeta}>
                  {listing.şəhər} · AutoPulse üzvü: {memberSince(listing.satıcıÜzvlükTarixi)}-dən
                </p>
              </div>
              <span className={styles.sellerTypeBadge}>
                {listing.satıcıTipi === 'diler' ? 'Diler / Salon' : 'Şəxsi Satıcı'}
              </span>
            </div>
            <div className={styles.actions}>
              <button
                className={styles.btnCall}
                onClick={() => setPhoneRevealed(true)}
              >
                📞 {phoneRevealed ? listing.satıcıZəng : maskedPhone}
              </button>
              <button className={styles.btnMessage}>💬 Mesaj Gönder</button>
            </div>
            {!phoneRevealed && (
              <p className={styles.phoneHint}>Nömrəni görmək üçün düyməyə klikləyin</p>
            )}
          </section>

          <section className={styles.promoBlock}>
            <h2>Elanınızı görünən edin</h2>
            <p className={styles.promoSubtitle}>
              Bu elanı VIP və ya Premium VIP statusuna yüksəldərək daha çox baxış qazanın.
            </p>
            <div className={styles.promoActions}>
              <button
                className={styles.promoBtn}
                onClick={() => navigate('/checkout?planId=vip')}
              >
                VIP et — 9.99$
              </button>
              <button
                className={styles.promoBtnPrimary}
                onClick={() => navigate('/checkout?planId=premium_vip')}
              >
                Premium VIP et — 24.99$
              </button>
            </div>
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
