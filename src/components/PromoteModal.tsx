import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PromoTier } from '../types';
import { PROMO_LABELS, PROMO_PRICES } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import styles from './PromoteModal.module.css';

const TIERS: { key: PromoTier; icon: string }[] = [
  { key: 'ireli_cek', icon: '↑' },
  { key: 'vip', icon: '♦' },
  { key: 'premium_vip', icon: '♛' },
];

interface PromoteModalProps {
  onClose: () => void;
  onConfirm: (tier: PromoTier) => Promise<void>;
}

export default function PromoteModal({ onClose, onConfirm }: PromoteModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<PromoTier | null>(null);
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const selectedPrice = selected ? PROMO_PRICES[selected] : 0;
  const insufficientBalance = selected !== null && user.balans < selectedPrice;

  const handleConfirm = async () => {
    if (!selected || insufficientBalance) return;
    setLoading(true);
    try {
      await onConfirm(selected);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = () => {
    onClose();
    navigate('/kabinet');
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

        <div className={styles.balanceRow}>
          <span>Şəxsi hesab balansı</span>
          <span className={styles.balanceValue}>{user.balans.toFixed(2)} AZN</span>
        </div>

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
            <button className={styles.topUpBtn} onClick={handleTopUp}>
              Balansı artır
            </button>
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
