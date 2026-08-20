import { useEffect, useState } from 'react';
import { getPricingPlans } from '../api/pricing';
import type { Plan } from '../types';
import PricingCard from '../components/PricingCard';
import styles from './Pricing.module.css';

type Dövr = 'aylıq' | 'illik';

export default function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dövr, setDövr] = useState<Dövr>('aylıq');

  useEffect(() => {
    (async () => {
      try {
        const data = await getPricingPlans();
        setPlans(data);
      } catch (error) {
        console.error('Failed to fetch pricing plans:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const subscriptionPlans = plans
    .filter((p) => p.tip === 'subscription')
    .filter((p) => !p.dövr || p.dövr === dövr);
  const vipPlans = plans.filter((p) => p.tip === 'vip_tier');

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.eyebrow}>Qiymətlər</div>
        <h1>Sadə, şəffaf qiymətləndirmə</h1>
        <p>Fərdi istifadəçidən böyük dilerlərə qədər — hər ölçüdə biznes üçün.</p>
      </div>

      {loading ? (
        <p className={styles.loading}>Yüklənir...</p>
      ) : (
        <>
          <section className={styles.section}>
            <div className={styles.container}>
              <div className={styles.sectionHead}>
                <div>
                  <h2>Hesab Planları</h2>
                  <p className={styles.subtitle}>
                    Fərdi istifadəçi üçün pulsuz, biznes hesablar üçün aylıq və ya illik abunə
                  </p>
                </div>
                <div className={styles.dövrToggle}>
                  <button
                    className={dövr === 'aylıq' ? styles.dövrActive : styles.dövr}
                    onClick={() => setDövr('aylıq')}
                  >
                    Aylıq
                  </button>
                  <button
                    className={dövr === 'illik' ? styles.dövrActive : styles.dövr}
                    onClick={() => setDövr('illik')}
                  >
                    İllik <span className={styles.savingsBadge}>2 ay pulsuz</span>
                  </button>
                </div>
              </div>
              <div className={styles.grid}>
                {subscriptionPlans.map((plan) => (
                  <PricingCard key={plan.id} plan={plan} />
                ))}
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.container}>
              <h2>Elan Yeniltmə Seçənəkləri</h2>
              <p className={styles.subtitle}>
                Hər elana ayrıca VIP/Premium VIP yeniltməsi tətbiq edin — siyahıda yuxarıda görünün
              </p>
              <div className={styles.grid}>
                {vipPlans.map((plan) => (
                  <PricingCard key={plan.id} plan={plan} />
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      <section className={styles.faqSection}>
        <div className={styles.container}>
          <h2>Tez-tez soruşulan suallar</h2>
          <div className={styles.faqGrid}>
            <div className={styles.faqItem}>
              <h3>Hər iki planı birlikdə istifadə edə biləm?</h3>
              <p>Bəli! Biznes abunəsi + VIP elan seçimlərini birlikdə istifadə edə bilərsiniz.</p>
            </div>
            <div className={styles.faqItem}>
              <h3>Hər zaman ləğv edə biləm?</h3>
              <p>Bəli, istənilən zaman ləğv edə bilərsiniz. Qalan müddətdən geri verərik.</p>
            </div>
            <div className={styles.faqItem}>
              <h3>Kart məlumatlarım təhlükəsiz?</h3>
              <p>Bütün ödənişlər SSL şifrələmə ilə qorunur.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
