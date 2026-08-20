import { useNavigate } from 'react-router-dom';
import type { Plan } from '../types';
import styles from './PricingCard.module.css';

export default function PricingCard({ plan }: { plan: Plan }) {
  const navigate = useNavigate();

  const handlePurchase = () => {
    navigate(`/checkout?planId=${plan.id}`);
  };

  const isPopular = plan.id === 'business' || plan.id === 'premium_vip';

  return (
    <div className={`${styles.card} ${isPopular ? styles.popular : ''}`}>
      {isPopular && <div className={styles.badge}>Populyar</div>}
      <h3>{plan.ad}</h3>
      <p className={styles.desc}>{plan.təsvir}</p>
      <div className={styles.price}>
        <span className={styles.amount}>{plan.qiymət === 0 ? 'Pulsuz' : `$${plan.qiymət}`}</span>
        {plan.qiymət > 0 && <span className={styles.period}>/ay</span>}
      </div>
      <ul className={styles.features}>
        {plan.xüsusiyyətlər.map((feature, idx) => (
          <li key={idx}>
            <span className={styles.check}>✓</span> {feature}
          </li>
        ))}
      </ul>
      <button
        onClick={handlePurchase}
        className={`${styles.cta} ${isPopular ? styles.ctaPrimary : ''}`}
      >
        {plan.qiymət === 0 ? 'Başla' : 'Satın Al'}
      </button>
    </div>
  );
}
