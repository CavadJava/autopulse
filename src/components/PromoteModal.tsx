import { useState } from 'react';
import type { PromoTier } from '../types';
import { PROMO_LABELS, PROMO_PRICES } from '../api/auth';
import styles from './PromoteModal.module.css';

const TIERS: { key: PromoTier; icon: string }[] = [
  { key: 'ireli_cek', icon: '↑' },
  { key: 'vip', icon: '♦' },
  { key: 'premium_vip', icon: '♛' },
];

interface PromoteModalProps {
  onClose: () => void;
  onConfirm: (tier: PromoTier) => Promise<void>;
  // Caller-supplied balance — no longer read from the mock AuthContext, since
  // real shop/user sessions have their own real balance the mock context
  // doesn't know about. Pass Infinity to skip client-side gating entirely
  // and let the server's 402 response be the source of truth instead.
  balans: number;
}

export default function PromoteModal({ onClose, onConfirm, balans }: PromoteModalProps) {
  const [selected, setSelected] = useState<PromoTier | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedPrice = selected ? PROMO_PRICES[selected] : 0;
  const insufficientBalance = selected !== null && balans < selectedPrice;

  const handleConfirm = async () => {
    if (!selected || insufficientBalance) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await onConfirm(selected);
      onClose();
    } catch {
      setErrorMessage('Yüksəltmə zamanı xəta baş verdi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>Elanı yüksəldin</h3>
          <button className={styles.close} onClick={onClose}>
            ✕
          </button>
        </div>

        {Number.isFinite(balans) && (
          <div className={styles.balanceRow}>
            <span>Balans</span>
            <span className={styles.balanceValue}>{balans.toFixed(2)} AZN</span>
          </div>
        )}

        <div className={styles.tierGrid}>
          {TIERS.map((t) => (
            <button
              key={t.key}
              className={selected === t.key ? styles.tierActive : styles.tier}
              onClick={() => setSelected(t.key)}
            >
              <span className={styles.tierIcon}>{t.icon}</span>
              <span className={styles.tierLabel}>{PROMO_LABELS[t.key]}</span>
              <span className={styles.tierPrice}>{PROMO_PRICES[t.key]} AZN</span>
            </button>
          ))}
        </div>

        {insufficientBalance && (
          <div className={styles.warning}>
            <p>Balansınız kifayət etmir. Zəhmət olmasa hesabınızı artırın.</p>
          </div>
        )}

        {errorMessage && (
          <div className={styles.warning}>
            <p>{errorMessage}</p>
          </div>
        )}

        <button
          className={styles.confirmBtn}
          disabled={!selected || insufficientBalance || loading}
          onClick={handleConfirm}
        >
          {loading ? 'Tətbiq edilir...' : selected ? `${PROMO_PRICES[selected]} AZN ödə` : 'Xidmət seçin'}
        </button>
      </div>
    </div>
  );
}
