import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Header.module.css';

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand}>
        AutoPulse Auksion
      </Link>
      <nav className={styles.nav}>
        {user ? (
          <button className={styles.logoutBtn} onClick={logout}>
            {user.phone} · Çıxış
          </button>
        ) : (
          <Link to="/giris" className={styles.loginLink}>
            Daxil ol
          </Link>
        )}
      </nav>
    </header>
  );
}
