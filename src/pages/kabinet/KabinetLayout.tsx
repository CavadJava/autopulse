import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getUnreadCount } from '../../api/chat';
import styles from './KabinetLayout.module.css';

const TABS = [
  { to: '/kabinet', label: 'Şəxsi kabinet', icon: '📊', end: true },
  { to: '/kabinet/elanlarim', label: 'Mənim elanlarım', icon: '📄', end: false },
  { to: '/kabinet/mesajlarim', label: 'Mesajlarım', icon: '💬', end: false },
  { to: '/kabinet/profil', label: 'Profil', icon: '👤', end: false },
  { to: '/kabinet/kartlarim', label: 'Kartlarım', icon: '💳', end: false },
];

export default function KabinetLayout() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const poll = async () => {
      try {
        setUnreadCount(await getUnreadCount());
      } catch {
        // Non-fatal — badge just stays at its last known value.
      }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [user]);

  if (!user) {
    return <Navigate to="/giris" replace />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <nav className={styles.tabs}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}
            >
              <span className={styles.icon}>{tab.icon}</span>
              {tab.label}
              {tab.to === '/kabinet/mesajlarim' && unreadCount > 0 && (
                <span className={styles.badge}>{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
