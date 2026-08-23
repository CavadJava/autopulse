import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getRealListingById } from '../api/listings';
import type { ApiListing } from '../api/listings';
import type { Listing } from '../types';
import InteractiveGallery from '../components/InteractiveGallery';
import ListingDetailTabs from '../components/ListingDetailTabs';
import styles from './RealListingDetail.module.css';

// Maps a real backend listing (ApiListing) onto the mock Listing shape that
// InteractiveGallery/ListingDetailTabs already know how to render — those
// components stay untouched, this is the only adapter. Fields the real
// backend doesn't have a dedicated column for live in detailsJson, which is
// `{}` for any listing created before this feature shipped — every read
// here falls back to a sane default so old rows render without error.
function apiListingToMockShape(l: ApiListing): Listing {
  const d = l.detailsJson ?? {};
  const exterior = l.images.filter((i) => i.kind === 'exterior').map((i) => i.minioUrl || i.s3Url);
  return {
    id: `${l.source}-${l.id}`,
    marka: l.marka,
    model: l.model,
    il: l.il,
    qiymət: l.qiymet,
    şəhər: d.şəhər ?? '',
    yürüş: l.yurus,
    yanacaq: (l.yanacaq as Listing['yanacaq']) || 'Benzin',
    ban: l.ban,
    ötürücü: d.ötürücü ?? '',
    mühərrik: d.mühərrik ?? '',
    rəng: d.rəng ?? '',
    vəziyyət: d.vəziyyət ?? 'İşlənmiş',
    kredit: d.kredit ?? false,
    barter: d.barter ?? false,
    təsvir: l.details,
    // Images without a `kind` column value (rows created before this
    // feature) default to 'exterior' server-side, so they still surface here.
    şəkillər: exterior,
    interyerŞəkillər: l.images.filter((i) => i.kind === 'interior').map((i) => i.minioUrl || i.s3Url),
    təchizatŞəkillər: l.images.filter((i) => i.kind === 'features').map((i) => i.minioUrl || i.s3Url),
    qapılarŞəkillər: l.images.filter((i) => i.kind === 'doors').map((i) => i.minioUrl || i.s3Url),
    satıcıAd: d.satıcıAd ?? l.sellerName,
    satıcıZəng: d.satıcıZəng ?? '',
    satıcıÜzvlükTarixi: new Date().toISOString(),
    tarix: new Date().toISOString(),
    baxışSayı: l.viewCount,
    vipTier: 'standart',
    həcm: d.həcm ?? 0,
    güc: d.güc ?? 0,
    sürətlərQutusu: d.sürətlərQutusu ?? 0,
    satıcıTipi: l.sellerType,
    yerlərSayı: d.yerlərSayı ?? 0,
    bazarÜçünYığılıb: d.bazarÜçünYığılıb ?? '',
    vuruğuVar: d.vuruğuVar ?? false,
    rənglənib: d.rənglənib ?? false,
    qəzalı: d.qəzalı ?? false,
    təchizat: d.təchizat ?? [],
  };
}

export default function RealListingDetail() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [sellerName, setSellerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const [listingNumber, setListingNumber] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setNotFound(false);
      setPhoneRevealed(false);
      if (!id) return;

      const [source, numericIdStr] = id.split('-');
      const numericId = Number(numericIdStr);
      if ((source !== 'shop' && source !== 'user') || Number.isNaN(numericId)) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        const detail = await getRealListingById(source, numericId);
        if (!detail) {
          setNotFound(true);
        } else {
          setListing(apiListingToMockShape(detail));
          setSellerName(detail.sellerName);
          setListingNumber(String(numericId).padStart(8, '0'));
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className={styles.loading}>Yüklənir...</div>;
  if (notFound || !listing) return <div className={styles.error}>Elan tapılmadı.</div>;

  const maskedPhone = listing.satıcıZəng
    ? listing.satıcıZəng.replace(/(\+994\d{2})\d{3}(\d{2})(\d{2})/, '$1 XXX $2 $3')
    : '';

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to="/elanlar">{listing.marka || 'Elanlar'}</Link>
        {listing.model && (
          <>
            <span className={styles.breadcrumbSep}>·</span>
            <span className={styles.breadcrumbCurrent}>{listing.model}</span>
          </>
        )}
        {listingNumber && (
          <>
            <span className={styles.breadcrumbSep}>·</span>
            <span className={styles.breadcrumbId}>Elan № {listingNumber}</span>
          </>
        )}
      </div>

      <div className={styles.container}>
        <div className={styles.main}>
          <InteractiveGallery listing={listing} />

          <h1 className={styles.title}>
            {listing.marka} {listing.model}
          </h1>
          <p className={styles.meta}>
            {listing.il} · {listing.şəhər} · {listing.yürüş.toLocaleString()} km
          </p>
          <p className={styles.subMeta}>👁 {listing.baxışSayı.toLocaleString()} baxış</p>

          <ListingDetailTabs listing={listing} similar={[]} />
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.contactCard}>
            <div className={styles.price}>{listing.qiymət.toLocaleString()} ₼</div>
            <div className={styles.featureRow}>
              {listing.kredit && <span className={styles.feature}>Kredit</span>}
              {listing.barter && <span className={styles.feature}>Barter</span>}
            </div>

            <div className={styles.cardDivider} />

            <div className={styles.sellerRow}>
              <span className={styles.sellerTypeBadge}>
                {listing.satıcıTipi === 'diler' ? 'Diler / Salon' : 'Şəxsi'}
              </span>
              {sellerName ? (
                <Link to={`/magazalar/${sellerName}`} className={styles.sellerName}>
                  {sellerName} →
                </Link>
              ) : (
                listing.satıcıAd && <p className={styles.sellerName}>{listing.satıcıAd}</p>
              )}
            </div>

            {listing.satıcıZəng && (
              <button className={styles.btnCall} onClick={() => setPhoneRevealed(true)}>
                📞 {phoneRevealed ? listing.satıcıZəng : `Nömrəni göstər · ${maskedPhone}`}
              </button>
            )}
            <button className={styles.btnMessage}>💬 Mesaj yaz</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
