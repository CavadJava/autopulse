import styles from './HowItWorks.module.css';

export default function HowItWorks() {
  const steps = [
    { num: '01', title: 'Axtar', desc: 'Markanı, modeli və şəhəri seç' },
    { num: '02', title: 'Müqayisə Et', desc: 'Qiymət, yürüş və özəllikləri müqayisə et' },
    { num: '03', title: 'Satın Al', desc: 'Satıcı ilə əlaqə kur və sazlaş' },
  ];

  return (
    <section className={styles.section}>
      <h2>Necə İşləyir?</h2>
      <div className={styles.steps}>
        {steps.map((step) => (
          <div key={step.num} className={styles.step}>
            <div className={styles.stepNum}>{step.num}</div>
            <h3>{step.title}</h3>
            <p>{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
