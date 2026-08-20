import { Link } from 'react-router-dom';
import styles from './Header.module.css';

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoText}>AUTO</span>PULSE
        </Link>
        <nav className={styles.nav}>
          <Link to="/elanlar">Elanlar</Link>
          <Link to="/qiymetler">Qiymətlər</Link>
          <button className={styles.cta}>Elan Ver</button>
          <button className={styles.secondary}>Giriş</button>
        </nav>
      </div>
    </header>
  );
}
