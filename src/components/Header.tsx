import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import styles from './Header.module.css';

export default function Header() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate('/');
  };

  const handleNewListing = () => {
    navigate(user ? '/elan-ver' : '/giris');
  };

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
            <button
              className={styles.themeToggle}
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Açıq temaya keç' : 'Tund temaya keç'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            {user ? (
              <div className={styles.userMenu}>
                <button className={styles.userBtn} onClick={() => setMenuOpen((v) => !v)}>
                  <span className={styles.avatar}>👤</span>
                  {user.hesabTipi === 'biznes' ? user.email : user.zəng}
                </button>
                {menuOpen && (
                  <div className={styles.dropdown}>
                    <Link to="/kabinet" onClick={() => setMenuOpen(false)}>
                      Şəxsi kabinet
                    </Link>
                    <button onClick={handleLogout}>Çıxış</button>
                  </div>
                )}
              </div>
            ) : (
              <button className={styles.secondary} onClick={() => navigate('/giris')}>
                Giriş
              </button>
            )}
            <button className={styles.cta} onClick={handleNewListing}>
              Elan Ver
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
