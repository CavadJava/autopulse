import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './SearchHero.module.css';

export default function SearchHero() {
  const [marka, setMarka] = useState('');
  const [model, setModel] = useState('');
  const [şəhər, setŞəhər] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (marka) params.append('marka', marka);
    if (model) params.append('model', model);
    if (şəhər) params.append('şəhər', şəhər);
    navigate(`/elanlar?${params.toString()}`);
  };

  return (
    <div className={styles.hero}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>
          <span className={styles.eyebrowDot} />
          Azərbaycanın etibarlı avtomobil bazarı
        </div>
        <h1 className={styles.title}>
          Doğru avtomobili<br />
          <span className={styles.accent}>ağıllı şəkildə tapın.</span>
        </h1>
        <p className={styles.subtitle}>
          Minlərlə yoxlanılmış elan, şəffaf qiymətlər və birbaşa satıcı əlaqəsi — hamısı bir platformada.
        </p>
        <form onSubmit={handleSearch} className={styles.form}>
          <input
            type="text"
            placeholder="Marka (məs. BMW)"
            value={marka}
            onChange={(e) => setMarka(e.target.value)}
          />
          <input
            type="text"
            placeholder="Model (məs. 5 Series)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <input
            type="text"
            placeholder="Şəhər"
            value={şəhər}
            onChange={(e) => setŞəhər(e.target.value)}
          />
          <button type="submit">Axtar</button>
        </form>
      </div>
    </div>
  );
}
