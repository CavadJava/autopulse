import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getRealListingById } from '../api/listings';
import type { ApiListing } from '../api/listings';
import type { Listing, PromoTier } from '../types';
import { getMyListings, promoteRealUserListing, InsufficientBalanceError } from '../api/auth';
import { getMyShopProducts, promoteShopListing } from '../api/shop';
import { startConversation, ChatUnauthorizedError } from '../api/chat';
import InteractiveGallery from '../components/InteractiveGallery';
import ListingDetailTabs from '../components/ListingDetailTabs';
import PromoteModal from '../components/PromoteModal';
import IndividualSellerCard from '../components/IndividualSellerCard';
import BusinessSellerCard from '../components/BusinessSellerCard';
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
    satıcıÜzvlükTarixi: l.sellerCreatedAt,
    tarix: new Date().toISOString(),
    baxışSayı: l.viewCount,
    vipTier: l.vipTier,
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
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null>(null);
  const [apiListing, setApiListing] = useState<ApiListing | null>(null);
  const [sellerName, setSellerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [listingNumber, setListingNumber] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

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
          setListing(apiListingToMockShape(detail));
          setApiListing(detail);
          setSellerName(detail.sellerName);
          setListingNumber(String(numericId).padStart(8, '0'));

          // Sessiyasız istifadəçilər üçün hər iki çağırış səssizcə uğursuz
          // olur, isOwner false qalır — promote kartı yalnız sahibə görünür.
          if (source === 'shop') {
            try {
              const myProducts = await getMyShopProducts();
              setIsOwner(myProducts.some((p) => p.id === numericId));
            } catch {
              setIsOwner(false);
            }
          } else {
            try {
              const myListings = await getMyListings();
              setIsOwner(myListings.some((l) => l.id === numericId));
            } catch {
              setIsOwner(false);
            }
          }
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handlePromote = async (tier: PromoTier) => {
    if (!id) return;
    const [source, numericIdStr] = id.split('-');
    const numericId = Number(numericIdStr);
    try {
      if (source === 'shop') {
        await promoteShopListing(numericId, tier);
      } else {
        await promoteRealUserListing(numericId, tier);
      }
      setPromoteError(null);
      const detail = await getRealListingById(source as 'shop' | 'user', numericId);
      if (detail) {
        setListing(apiListingToMockShape(detail));
        setApiListing(detail);
      }
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        setPromoteError(`Balansınız kifayət etmir (${err.required} AZN lazımdır).`);
      } else {
        setPromoteError('Yüksəltmə zamanı xəta baş verdi.');
      }
      throw err;
    }
  };

  const handleMessageClick = async () => {
    if (!id) return;
    const [source, numericIdStr] = id.split('-');
    const numericId = Number(numericIdStr);
    try {
      const conv = await startConversation(source as 'shop' | 'user', numericId);
      navigate(`/kabinet/mesajlarim?c=${conv.id}`);
    } catch (err) {
      if (err instanceof ChatUnauthorizedError) {
        navigate('/giris');
        return;
      }
      setPromoteError('Mesaj başlatarkən xəta baş verdi.');
    }
  };

  if (loading) return <div className={styles.loading}>Yüklənir...</div>;
  if (notFound || !listing) return <div className={styles.error}>Elan tapılmadı.</div>;

  const sourceKind = id?.split('-')[0] as 'shop' | 'user' | undefined;

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
          {sourceKind === 'shop' ? (
            <BusinessSellerCard
              listing={listing}
              sellerName={sellerName}
              logoUrl={apiListing?.sellerLogoUrl}
              contactName={apiListing?.sellerContactName}
              workTimes={apiListing?.sellerWorkTimes}
              address={apiListing?.sellerAddress}
              activeListingCount={apiListing?.sellerActiveListingCount}
              qiymetUsd={apiListing?.qiymetUsd}
              isOwner={isOwner}
              onPromoteClick={() => setPromoteOpen(true)}
              onMessageClick={handleMessageClick}
            />
          ) : (
            <IndividualSellerCard
              listing={listing}
              isOwner={isOwner}
              onPromoteClick={() => setPromoteOpen(true)}
              onMessageClick={handleMessageClick}
            />
          )}
          {promoteError && <p className={styles.promoteError}>{promoteError}</p>}
        </aside>
      </div>

      {promoteOpen && (
        <PromoteModal
          onClose={() => setPromoteOpen(false)}
          onConfirm={handlePromote}
          balans={Infinity}
        />
      )}
    </div>
  );
}
