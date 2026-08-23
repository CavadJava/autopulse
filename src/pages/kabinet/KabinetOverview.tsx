import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { topUpBalance, getMe, getMyListings } from '../../api/auth';
import styles from './KabinetOverview.module.css';

const TOPUP_PRESETS = [12, 20, 50];

const PLAN_LABEL: Record<string, string> = {
  free: 'Pulsuz',
  business: 'Biznes',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Gecəniz xeyrə qalsın';
  if (h < 12) return 'Sabahınız xeyir';
  if (h < 18) return 'Gününüz xeyir';
  return 'Axşamınız xeyir';
}

export default function KabinetOverview() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState(20);
  const [loading, setLoading] = useState(false);

  // Real backend counterparts — the rest of this page (hero greeting, plan
  // badge, top-up flow) stays on the mock AuthContext, since a real
  // user_session account has no subscriptionPlan/hesabTipi concept. Only
  // the numbers that DO have a real source (balance, listing counts) are
  // swapped in here.
  const [realBalans, setRealBalans] = useState<number | null>(null);
  const [statusCounts, setStatusCounts] = useState<{ saytda: number; gozlemede: number; legvEdilib: number } | null>(
    null
  );

  useEffect(() => {
    getMe()
      .then((me) => setRealBalans(me.balans))
      .catch(() => setRealBalans(null));
    getMyListings()
      .then((listings) => {
        const counts = { saytda: 0, gozlemede: 0, legvEdilib: 0 };
        listings.forEach((l) => {
          if (l.status === 'saytda') counts.saytda++;
          else if (l.status === 'gozlemede') counts.gozlemede++;
          else if (l.status === 'legv_edilib') counts.legvEdilib++;
        });
        setStatusCounts(counts);
      })
      .catch(() => setStatusCounts(null));
  }, []);

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

  const initial = user.ad?.trim().charAt(0).toUpperCase() || 'A';
  const activeListings = statusCounts?.saytda ?? user.elanlarSayı;
  const quotaUsed = Math.min(activeListings, user.məhdudiyyət);
  const quotaPct = user.məhdudiyyət > 0 ? Math.round((quotaUsed / user.məhdudiyyət) * 100) : 0;

  return (
    <div>
      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.avatar}>{initial}</div>
          <div>
            <div className={styles.heroGreeting}>{greeting()},</div>
            <h1 className={styles.heroName}>{user.ad}</h1>
            <div className={styles.heroMeta}>
              <span className={styles.planBadge}>
                {user.hesabTipi === 'biznes' ? '🏢' : '👤'} {user.hesabTipi === 'biznes' ? 'Biznes hesab' : 'Fərdi hesab'}
              </span>
              <span className={styles.planBadgePlan}>
                ✨ {PLAN_LABEL[user.subscriptionPlan] ?? user.subscriptionPlan} plan
              </span>
            </div>
          </div>
        </div>
        <button className={styles.newListingBtn} onClick={() => navigate('/elan-ver')}>
          + Yeni elan yerləşdir
        </button>
      </div>

      <h2 className={styles.sectionTitle}>Ümumi statistika</h2>

      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.balanceCard}`}>
          <div className={styles.statGlow} />
          <div className={styles.statLabel}>💰 Şəxsi hesab</div>
          <div className={styles.balanceRow}>
            <div className={styles.balanceValue}>{(realBalans ?? user.balans).toFixed(2)} <span className={styles.currency}>AZN</span></div>
            <button className={styles.topUpBtn} onClick={() => setModalOpen(true)}>
              Artır
            </button>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.paidCard}`}>
          <div className={styles.statGlow} />
          <div className={styles.statLabel}>🚀 Ödənişli elan balansı</div>
          <div className={styles.balanceRow}>
            <div className={styles.balanceValue}>0</div>
            <button className={styles.placeAdBtn} onClick={() => navigate('/qiymetler')}>
              Elan yerləşdir
            </button>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.summaryCard}`}>
          <div className={styles.statLabel}>📈 Elanların statistikası</div>
          <div className={styles.summaryGrid}>
            <div>
              <div className={styles.summaryValue}>{statusCounts?.saytda ?? user.elanlarSayı}</div>
              <div className={styles.summaryLabel}>Saytda</div>
            </div>
            <div>
              <div className={styles.summaryValue}>
                {statusCounts?.legvEdilib ?? Math.max(user.elanlarSayı - 1, 0)}
              </div>
              <div className={styles.summaryLabel}>İmtina olunmuş</div>
            </div>
            <div>
              <div className={styles.summaryValue}>0</div>
              <div className={styles.summaryLabel}>Müddəti başa çatmış</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quota */}
      <div className={styles.quotaCard}>
        <div className={styles.quotaHeader}>
          <span>Aktiv elan limiti</span>
          <span className={styles.quotaFraction}>
            {quotaUsed} / {user.məhdudiyyət}
          </span>
        </div>
        <div className={styles.quotaBar}>
          <div className={styles.quotaBarFill} style={{ width: `${quotaPct}%` }} />
        </div>
        {quotaPct >= 80 && (
          <p className={styles.quotaHint}>
            Limitiniz dolmaq üzrədir — daha çox elan yerləşdirmək üçün planınızı yüksəldin.
          </p>
        )}
      </div>

      <section className={styles.historySection}>
        <h2>Əməliyyat tarixçəsi</h2>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🧾</div>
          <p className={styles.empty}>Hal hazırda sizin əməliyyatınız yoxdur.</p>
          <p className={styles.emptySub}>Burda sizin ödəniş tarixçəniz göstəriləcək.</p>
        </div>
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
