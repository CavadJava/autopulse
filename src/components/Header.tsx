import { Link } from 'react-router-dom';
import styles from './Header.module.css';

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoMark} />
          <span className={styles.logoText}>Auto</span>Pulse
        </Link>
        <nav className={styles.nav}>
          <div className={styles.links}>
            <Link to="/elanlar">Elanlar</Link>
            <Link to="/qiymetler">Qiymətlər</Link>
            <Link to="/business">Biznes üçün</Link>
          </div>
          <div className={styles.actions}>
            <button className={styles.secondary}>Giriş</button>
            <button className={styles.cta}>Elan Ver</button>
          </div>
        </nav>
      </div>
    </header>
  );
}
