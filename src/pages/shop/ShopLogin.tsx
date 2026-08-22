import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { shopLogin, ShopLoginError } from '../../api/shop';
import styles from './ShopLogin.module.css';

export default function ShopLogin() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await shopLogin(name, password);
      navigate('/magazam');
    } catch (err) {
      if (err instanceof ShopLoginError) {
        setError('Ad və ya parol yanlışdır.');
      } else {
        setError('Giriş zamanı xəta baş verdi.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Mağaza girişi</h1>
        <p className={styles.subtitle}>Öz mağazanıza daxil olmaq üçün ad və parolunuzu daxil edin.</p>

        <label className={styles.field}>
          <span className={styles.label}>Mağaza adı</span>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="məs. avto444"
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Parol</span>
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.submitBtn} type="submit" disabled={submitting}>
          {submitting ? 'Daxil olunur...' : 'Daxil ol'}
        </button>
      </form>
    </div>
  );
}
