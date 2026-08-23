import { useEffect, useState } from 'react';
import { getMyNotifications, markNotificationRead } from '../../api/notifications';
import type { UserNotification } from '../../api/notifications';
import styles from './KabinetBildirisler.module.css';

export default function KabinetBildirisler() {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setNotifications(await getMyNotifications());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleOpen = async (n: UserNotification) => {
    if (n.isRead) return;
    await markNotificationRead(n.notificationId);
    setNotifications((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
    );
  };

  if (loading) {
    return <p className={styles.empty}>Yüklənir...</p>;
  }

  if (notifications.length === 0) {
    return <p className={styles.empty}>Hələ heç bir bildiriş yoxdur.</p>;
  }

  return (
    <div className={styles.page}>
      {notifications.map((n) => (
        <button
          key={n.id}
          className={n.isRead ? styles.item : styles.itemUnread}
          onClick={() => handleOpen(n)}
        >
          <div className={styles.itemHeader}>
            <span className={styles.itemTitle}>{n.title}</span>
            {!n.isRead && <span className={styles.dot} />}
          </div>
          <p className={styles.itemBody}>{n.body}</p>
          <span className={styles.itemDate}>{new Date(n.createdAt).toLocaleDateString('az-AZ')}</span>
        </button>
      ))}
    </div>
  );
}
