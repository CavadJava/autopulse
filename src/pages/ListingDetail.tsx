import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getListingById, getListings } from '../api/listings';
import { promoteListing, PROMO_PRICES } from '../api/auth';
import type { Listing, PromoTier } from '../types';
import ListingGrid from '../components/ListingGrid';
import PromoteModal from '../components/PromoteModal';
import { useAuth } from '../context/AuthContext';
import styles from './ListingDetail.module.css';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('az-AZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function memberSince(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('az-AZ', { month: '2-digit', year: 'numeric' });
}

const DESCRIPTION_PREVIEW_LENGTH = 160;

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, login } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [similar, setSimilar] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setSelectedImage(0);
      setPhoneRevealed(false);
      setDescExpanded(false);
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
  const isLongDescription = listing.təsvir.length > DESCRIPTION_PREVIEW_LENGTH;
  const descriptionText =
    !descExpanded && isLongDescription
      ? listing.təsvir.slice(0, DESCRIPTION_PREVIEW_LENGTH).trimEnd() + '…'
      : listing.təsvir;

  const handlePromote = async (tier: PromoTier) => {
    if (!user || !listing) return;
    await promoteListing(user.hesabTipi, listing.id, tier);
    login({ ...user, balans: user.balans - PROMO_PRICES[tier] });
    setListing({ ...listing, vipTier: tier === 'ireli_cek' ? 'standart' : tier });
  };

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to={`/elanlar?marka=${listing.marka}`}>{listing.marka}</Link>
        <span className={styles.breadcrumbSep}>·</span>
        <span className={styles.breadcrumbCurrent}>{listing.model}</span>
        <span className={styles.breadcrumbSep}>·</span>
        <span className={styles.breadcrumbId}>Elan № {listing.id.padStart(8, '0')}</span>
      </div>

      <div className={styles.container}>
        <div className={styles.main}>
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

          <h1 className={styles.title}>
            {listing.marka} {listing.model}
          </h1>
          <p className={styles.meta}>
            {listing.il} · {listing.şəhər} · {listing.yürüş.toLocaleString()} km
          </p>
          <p className={styles.subMeta}>
            👁 {listing.baxışSayı.toLocaleString()} baxış · Yeniləndi: {formatDate(listing.tarix)}
          </p>

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
            <p className={styles.description}>
              {descriptionText}
              {isLongDescription && (
                <button className={styles.readMoreBtn} onClick={() => setDescExpanded((v) => !v)}>
                  {descExpanded ? ' Qısalt' : ' Davamını oxu'}
                </button>
              )}
            </p>
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

          <section className={styles.section}>
            <h2>Yerləşmə</h2>
            <div className={styles.mapPlaceholder}>
              <img src="/mock-map.svg" alt="Xəritə" />
              <p>{listing.şəhər}</p>
            </div>
          </section>
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.contactCard}>
            <div className={styles.priceRow}>
              <div className={styles.price}>{listing.qiymət.toLocaleString()} ₼</div>
            </div>
            <div className={styles.featureRow}>
              {listing.kredit && <span className={styles.feature}>Kredit</span>}
              {listing.barter && <span className={styles.feature}>Barter</span>}
            </div>

            <div className={styles.cardDivider} />

            <div className={styles.sellerRow}>
              <div>
                <p className={styles.sellerName}>{listing.satıcıAd}</p>
                <p className={styles.sellerMeta}>{listing.şəhər}</p>
                <p className={styles.sellerMeta}>
                  Satıcı {memberSince(listing.satıcıÜzvlükTarixi)} tarixindən AutoPulse-da
                </p>
              </div>
              <span className={styles.sellerTypeBadge}>
                {listing.satıcıTipi === 'diler' ? 'Diler / Salon' : 'Şəxsi'}
              </span>
            </div>

            <button className={styles.btnCall} onClick={() => setPhoneRevealed(true)}>
              📞 {phoneRevealed ? listing.satıcıZəng : `Nömrəni göstər · ${maskedPhone}`}
            </button>
            <button className={styles.btnMessage}>💬 Mesaj yaz</button>

            <div className={styles.cardDivider} />

            <div className={styles.promoGrid}>
              <button className={styles.promoTile} onClick={() => setPromoteOpen(true)}>
                <span className={styles.promoIcon}>↑</span>
                <span>İrəli çək</span>
                <span className={styles.promoPrice}>{PROMO_PRICES.ireli_cek} AZN</span>
              </button>
              <button className={styles.promoTile} onClick={() => setPromoteOpen(true)}>
                <span className={styles.promoIcon}>♦</span>
                <span>VIP</span>
                <span className={styles.promoPrice}>{PROMO_PRICES.vip} AZN</span>
              </button>
              <button className={styles.promoTile} onClick={() => setPromoteOpen(true)}>
                <span className={styles.promoIcon}>♛</span>
                <span>Premium</span>
                <span className={styles.promoPrice}>{PROMO_PRICES.premium_vip} AZN</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {promoteOpen && user && (
        <PromoteModal onClose={() => setPromoteOpen(false)} onConfirm={handlePromote} />
      )}

      {similar.length > 0 && (
        <section className={styles.similarSection}>
          <div className={styles.similarContainer}>
            <div className={styles.similarHead}>
              <h2>Bənzər Elanlar</h2>
              <Link to="/elanlar" className={styles.similarViewAll}>
                Hamısını göstər
              </Link>
            </div>
            <ListingGrid listings={similar} />
          </div>
        </section>
      )}
    </div>
  );
}
