import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin, AdminLoginError } from '../api/admin';
import styles from './AdminLogin.module.css';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await adminLogin(username, password);
      navigate('/admin/dashboard');
    } catch (err) {
      if (err instanceof AdminLoginError) {
        setError('İstifadəçi adı və ya parol yanlışdır.');
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
        <h1 className={styles.title}>Superadmin girişi</h1>
        <p className={styles.subtitle}>İdarə panelinə daxil olmaq üçün istifadəçi adı və parolunuzu daxil edin.</p>

        <label className={styles.field}>
          <span className={styles.label}>İstifadəçi adı</span>
          <input
            className={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
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
