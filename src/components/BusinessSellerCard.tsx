import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { Listing } from '../types';
import styles from './BusinessSellerCard.module.css';

interface BusinessSellerCardProps {
  listing: Listing;
  sellerName: string;
  logoUrl?: string;
  contactName?: string;
  workTimes?: string;
  address?: string;
  activeListingCount?: number;
  qiymetUsd?: number;
  isOwner: boolean;
  onPromoteClick: () => void;
  onMessageClick: () => void;
}

function memberSince(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('az-AZ', { month: '2-digit', year: 'numeric' });
}

export default function BusinessSellerCard({
  listing,
  sellerName,
  logoUrl,
  contactName,
  workTimes,
  address,
  activeListingCount,
  qiymetUsd,
  isOwner,
  onPromoteClick,
  onMessageClick,
}: BusinessSellerCardProps) {
  const [phoneRevealed, setPhoneRevealed] = useState(false);

  const maskedPhone = listing.satıcıZəng
    ? listing.satıcıZəng.replace(/(\+994\d{2})\d{3}(\d{2})(\d{2})/, '$1 XXX $2 $3')
    : '';

  return (
    <div className={styles.contactCard}>
      <div className={styles.priceRow}>
        <div className={styles.price}>{listing.qiymət.toLocaleString()} ₼</div>
        {qiymetUsd ? <div className={styles.priceUsd}>≈ {qiymetUsd.toLocaleString()} $</div> : null}
      </div>
      <div className={styles.featureRow}>
        {listing.kredit && <span className={styles.feature}>Kredit</span>}
        {listing.barter && <span className={styles.feature}>Barter</span>}
      </div>

      <div className={styles.cardDivider} />

      <div className={styles.sellerHeader}>
        {logoUrl && <img src={logoUrl} alt={sellerName} className={styles.logo} />}
        <div>
          {contactName && <p className={styles.sellerName}>{contactName}</p>}
          <span className={styles.sellerTypeBadge}>Diler / Salon</span>
        </div>
      </div>

      {listing.şəhər && <p className={styles.sellerMeta}>{listing.şəhər}</p>}
      {listing.satıcıÜzvlükTarixi && (
        <p className={styles.sellerMeta}>
          Satıcı {memberSince(listing.satıcıÜzvlükTarixi)} tarixindən AutoPulse-da
        </p>
      )}
      {typeof activeListingCount === 'number' && (
        <p className={styles.sellerMeta}>Elan sayı: {activeListingCount}</p>
      )}
      {workTimes && <p className={styles.sellerMeta}>{workTimes}</p>}
      {address && <p className={styles.sellerMeta}>{address}</p>}

      {listing.satıcıZəng && (
        <button className={styles.btnCall} onClick={() => setPhoneRevealed(true)}>
          📞 {phoneRevealed ? listing.satıcıZəng : `Nömrəni göstər · ${maskedPhone}`}
        </button>
      )}
      <button className={styles.btnMessage} onClick={onMessageClick}>💬 Mesaj yaz</button>

      {sellerName && (
        <Link to={`/magazalar/${sellerName}`} className={styles.shopLink}>
          Mağazaya bax →
        </Link>
      )}

      {isOwner && (
        <>
          <div className={styles.cardDivider} />
          <div className={styles.promoGrid}>
            <button className={styles.promoTile} onClick={onPromoteClick}>
              <span className={styles.promoIcon}>↑</span>
              <span>İrəli çək</span>
              <span className={styles.promoPrice}>3 AZN</span>
            </button>
            <button className={styles.promoTile} onClick={onPromoteClick}>
              <span className={styles.promoIcon}>♦</span>
              <span>VIP</span>
              <span className={styles.promoPrice}>5 AZN</span>
            </button>
            <button className={styles.promoTile} onClick={onPromoteClick}>
              <span className={styles.promoIcon}>♛</span>
              <span>Premium</span>
              <span className={styles.promoPrice}>7 AZN</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
