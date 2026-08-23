import { useState } from 'react';
import type { Listing } from '../types';
import styles from './IndividualSellerCard.module.css';

interface IndividualSellerCardProps {
  listing: Listing;
  isOwner: boolean;
  onPromoteClick: () => void;
}

function memberSince(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('az-AZ', { month: '2-digit', year: 'numeric' });
}

export default function IndividualSellerCard({ listing, isOwner, onPromoteClick }: IndividualSellerCardProps) {
  const [phoneRevealed, setPhoneRevealed] = useState(false);

  const maskedPhone = listing.satıcıZəng
    ? listing.satıcıZəng.replace(/(\+994\d{2})\d{3}(\d{2})(\d{2})/, '$1 XXX $2 $3')
    : '';

  return (
    <div className={styles.contactCard}>
      <div className={styles.price}>{listing.qiymət.toLocaleString()} ₼</div>
      <div className={styles.featureRow}>
        {listing.kredit && <span className={styles.feature}>Kredit</span>}
        {listing.barter && <span className={styles.feature}>Barter</span>}
      </div>

      <div className={styles.cardDivider} />

      <div className={styles.sellerRow}>
        <span className={styles.sellerTypeBadge}>Şəxsi</span>
        {listing.satıcıAd && <p className={styles.sellerName}>{listing.satıcıAd}</p>}
      </div>
      {listing.şəhər && <p className={styles.sellerMeta}>{listing.şəhər}</p>}
      {listing.satıcıÜzvlükTarixi && (
        <p className={styles.sellerMeta}>
          Satıcı {memberSince(listing.satıcıÜzvlükTarixi)} tarixindən AutoPulse-da
        </p>
      )}

      {listing.satıcıZəng && (
        <button className={styles.btnCall} onClick={() => setPhoneRevealed(true)}>
          📞 {phoneRevealed ? listing.satıcıZəng : `Nömrəni göstər · ${maskedPhone}`}
        </button>
      )}
      <button className={styles.btnMessage}>💬 Mesaj yaz</button>

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
