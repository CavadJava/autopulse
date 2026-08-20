import styles from './StatsBar.module.css';

export default function StatsBar() {
  return (
    <div className={styles.stats}>
      <div className={styles.stat}>
        <div className={styles.number}>15,420+</div>
        <div className={styles.label}>Aktiv Elan</div>
      </div>
      <div className={styles.stat}>
        <div className={styles.number}>8,950+</div>
        <div className={styles.label}>Səmərəli Satış</div>
      </div>
      <div className={styles.stat}>
        <div className={styles.number}>12,500+</div>
        <div className={styles.label}>Xoşbəxt İstifadəçi</div>
      </div>
    </div>
  );
}
