import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerShop, ShopRegisterError } from '../../api/shop';
import styles from './ShopRegister.module.css';

export default function ShopRegister() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerShop(name, title, email, password);
      navigate('/magazam');
    } catch (err) {
      if (err instanceof ShopRegisterError) {
        setError(err.message);
      } else {
        setError('Qeydiyyat zamanı xəta baş verdi.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Mağaza qeydiyyatı</h1>
        <p className={styles.subtitle}>Yeni mağaza hesabı yaradın.</p>

        <label className={styles.field}>
          <span className={styles.label}>Mağaza adı (slug)</span>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="məs. avto555"
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Başlıq</span>
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="məs. Avto 555"
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Email</span>
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          {submitting ? 'Qeydiyyatdan keçirilir...' : 'Qeydiyyatdan keç'}
        </button>

        <p className={styles.subtitle}>
          Artıq hesabınız var? <Link to="/magaza-giris">Daxil olun</Link>
        </p>
      </form>
    </div>
  );
}
