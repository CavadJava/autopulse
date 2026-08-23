import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getRealListingById } from '../api/listings';
import type { ApiListing } from '../api/listings';
import styles from './RealListingDetail.module.css';

export default function RealListingDetail() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<ApiListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setNotFound(false);
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
          setListing(detail);
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
      </div>

      <div className={styles.container}>
        <div className={styles.main}>
          {listing.images.length > 0 ? (
            <div className={styles.gallery}>
              {listing.images.map((img, i) => (
                <img key={i} src={img.minioUrl || img.s3Url} alt={listing.title} className={styles.galleryImage} />
              ))}
            </div>
          ) : (
            <div className={styles.noImage}>Şəkil yoxdur</div>
          )}

          <h1 className={styles.title}>{listing.title}</h1>
          {(() => {
            const metaParts = [
              [listing.marka, listing.model].filter(Boolean).join(' '),
              listing.il > 0 ? String(listing.il) : '',
              listing.yurus > 0 ? `${listing.yurus.toLocaleString()} km` : '',
              listing.yanacaq,
              listing.ban,
            ].filter(Boolean);
            return metaParts.length > 0 ? (
              <p className={styles.meta}>{metaParts.join(' · ')}</p>
            ) : null;
          })()}
          {listing.details && <p className={styles.details}>{listing.details}</p>}
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.contactCard}>
            <div className={styles.price}>{listing.qiymet.toLocaleString()} ₼</div>

            <div className={styles.cardDivider} />

            <div className={styles.sellerRow}>
              <span className={styles.sellerTypeBadge}>
                {listing.sellerType === 'diler' ? 'Diler / Salon' : 'Şəxsi'}
              </span>
              {listing.sellerName && (
                <Link to={`/magazalar/${listing.sellerName}`} className={styles.sellerName}>
                  {listing.sellerName} →
                </Link>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
