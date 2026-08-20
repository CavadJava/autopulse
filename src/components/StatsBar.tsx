import styles from './StatsBar.module.css';

const stats = [
  { number: '15,420+', label: 'Aktiv Elan', trend: '+12%' },
  { number: '8,950+', label: 'Uğurlu Satış', trend: '+8%' },
  { number: '12,500+', label: 'Qeydiyyatlı İstifadəçi', trend: '+21%' },
  { number: '340+', label: 'Biznes Tərəfdaş', trend: '+34%' },
];

export default function StatsBar() {
  return (
    <div className={styles.stats}>
      {stats.map((s) => (
        <div key={s.label} className={styles.stat}>
          <div className={styles.number}>
            {s.number} <span className={styles.trend}>{s.trend}</span>
          </div>
          <div className={styles.label}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}
