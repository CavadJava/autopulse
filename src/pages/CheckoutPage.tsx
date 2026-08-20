import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getPricingPlans } from '../api/pricing';
import { Plan } from '../types';
import CheckoutFlow from '../components/CheckoutFlow';
import styles from './CheckoutPage.module.css';

export default function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('planId');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (planId) {
          const plans = await getPricingPlans();
          const found = plans.find((p) => p.id === planId);
          setPlan(found || null);
        }
      } catch (error) {
        console.error('Failed to fetch plan:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [planId]);

  if (loading) return <div className={styles.loading}>Yüklənir...</div>;
  if (!plan) return <div className={styles.error}>Plan tapılmadı.</div>;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1>Ödəniş</h1>
        <CheckoutFlow planId={plan.id} planName={plan.ad} price={plan.qiymət} />
      </div>
    </div>
  );
}
