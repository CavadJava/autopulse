import { useEffect, useState } from 'react';
import { getMyCards } from '../../api/auth';
import type { SavedCard } from '../../types';
import styles from './KabinetKartlarim.module.css';

export default function KabinetKartlarim() {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getMyCards();
        setCards(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className={styles.empty}>Yüklənir...</p>;

  if (cards.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.icon}>💳</div>
        <p className={styles.emptyText}>
          Sizin yadda saxlanmış kartınız yoxdur. Ödənişlər üçün tez-tez istifadə etdiyiniz kartları
          əlavə edin.
        </p>
        <button className={styles.addBtn}>Yeni kart əlavə et</button>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {cards.map((card) => (
        <div key={card.id} className={styles.cardTile}>
          <span>{card.növ}</span>
          <span>{card.maskedNömrə}</span>
        </div>
      ))}
    </div>
  );
}
