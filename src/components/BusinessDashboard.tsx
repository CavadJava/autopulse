import styles from './BusinessDashboard.module.css';

export default function Dashboard() {
  const stats = {
    totalListings: 15,
    activeListings: 12,
    limit: 9999,
    impressions: 4250,
    clicks: 340,
  };

  const usagePercent = (stats.activeListings / stats.limit) * 100;

  return (
    <div className={styles.dashboard}>
      <h1>Biznes Paneli</h1>
      <p className={styles.subtitle}>Elanlarınız və statistikanız idarə edin</p>

      <div className={styles.statsGrid}>
        <div className={styles.card}>
          <div className={styles.label}>Cəmi Elanlar</div>
          <div className={styles.value}>{stats.totalListings}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.label}>Aktiv Elanlar</div>
          <div className={styles.value}>{stats.activeListings}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.label}>Təsəvvürlər</div>
          <div className={styles.value}>{stats.impressions.toLocaleString()}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.label}>Kliklər</div>
          <div className={styles.value}>{stats.clicks.toLocaleString()}</div>
        </div>
      </div>

      <div className={styles.usageCard}>
        <div className={styles.usageHeader}>
          <h3>Elan Limiti</h3>
          <span className={styles.usageText}>
            {stats.activeListings} / {stats.limit}
          </span>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progress} style={{ width: `${Math.min(usagePercent, 100)}%` }} />
        </div>
        <p className={styles.usageNote}>Biznes planı: limitsiz elan</p>
      </div>

      <div className={styles.actions}>
        <button className={styles.primaryBtn}>+ Yeni Elan</button>
        <button className={styles.secondaryBtn}>Elanlarımı Gör</button>
      </div>
    </div>
  );
}
