import { useEffect, useState } from 'react';
import { getShopNotifications, markShopNotificationRead } from '../../api/notifications';
import type { UserNotification } from '../../api/notifications';
import styles from './MyShopBildirisler.module.css';

export default function MyShopBildirisler() {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setNotifications(await getShopNotifications());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleOpen = async (n: UserNotification) => {
    if (n.isRead) return;
    await markShopNotificationRead(n.notificationId);
    setNotifications((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
    );
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>Yüklənir...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {notifications.length === 0 ? (
        <p className={styles.empty}>Hələ heç bir bildiriş yoxdur.</p>
      ) : (
        notifications.map((n) => (
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
        ))
      )}
    </div>
  );
}
