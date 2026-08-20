import styles from './HowItWorks.module.css';

export default function HowItWorks() {
  const steps = [
    { num: '01', title: 'Axtar', desc: 'Markanı, modeli və şəhəri seç, ya da geniş filtr sistemi ilə daralt.' },
    { num: '02', title: 'Müqayisə Et', desc: 'Qiymət, yürüş və texniki xüsusiyyətləri bir baxışda müqayisə et.' },
    { num: '03', title: 'Satın Al', desc: 'Satıcı ilə birbaşa əlaqə qur, kredit və barter seçimlərindən yararlan.' },
  ];

  return (
    <section className={styles.section}>
      <div className={styles.eyebrow}>Proses</div>
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
