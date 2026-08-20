import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { topUpBalance } from '../../api/auth';
import styles from './KabinetOverview.module.css';

const TOPUP_PRESETS = [12, 20, 50];

export default function KabinetOverview() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState(20);
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const handleTopUp = async () => {
    setLoading(true);
    try {
      await topUpBalance(amount);
      login({ ...user, balans: user.balans + amount });
      setModalOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className={styles.title}>Ümumi statistika</h1>

      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.balanceCard}`}>
          <div className={styles.statLabel}>Şəxsi hesab</div>
          <div className={styles.balanceRow}>
            <div className={styles.balanceValue}>{user.balans.toFixed(2)} AZN</div>
            <button className={styles.topUpBtn} onClick={() => setModalOpen(true)}>
              Artır
            </button>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.paidCard}`}>
          <div className={styles.statLabel}>Ödənişli elan balansı</div>
          <div className={styles.balanceRow}>
            <div className={styles.balanceValue}>0</div>
            <button className={styles.placeAdBtn} onClick={() => navigate('/qiymetler')}>
              Elan yerləşdir
            </button>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.summaryCard}`}>
          <div className={styles.statLabel}>Elanların statistikası</div>
          <div className={styles.summaryGrid}>
            <div>
              <div className={styles.summaryValue}>{user.elanlarSayı}</div>
              <div className={styles.summaryLabel}>Saytda</div>
            </div>
            <div>
              <div className={styles.summaryValue}>{Math.max(user.elanlarSayı - 1, 0)}</div>
              <div className={styles.summaryLabel}>İmtina olunmuş</div>
            </div>
            <div>
              <div className={styles.summaryValue}>0</div>
              <div className={styles.summaryLabel}>Müddəti başa çatmış</div>
            </div>
          </div>
        </div>
      </div>

      <section className={styles.historySection}>
        <h2>Əməliyyat tarixçəsi</h2>
        <p className={styles.empty}>Hal hazırda sizin əməliyyatınız yoxdur.</p>
        <p className={styles.emptySub}>Burda sizin ödəniş tarixçəniz göstəriləcək.</p>
      </section>

      {modalOpen && (
        <div className={styles.modalOverlay} onClick={() => setModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Şəxsi hesabın balansını artır</h3>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            <p className={styles.modalLabel}>Artırılacaq məbləğ, AZN</p>
            <div className={styles.modalAmount}>{amount}</div>
            <div className={styles.presetRow}>
              {TOPUP_PRESETS.map((p) => (
                <button
                  key={p}
                  className={amount === p ? styles.presetActive : styles.preset}
                  onClick={() => setAmount(p)}
                >
                  {p} AZN
                </button>
              ))}
            </div>
            <button className={styles.confirmBtn} onClick={handleTopUp} disabled={loading}>
              {loading ? 'Yüklənir...' : 'Balansı artır'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
