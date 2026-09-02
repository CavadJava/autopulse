import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestOtp } from '../api/auth';
import styles from './Login.module.css';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!phone.trim()) {
      setError('Telefon nömrəsini daxil edin.');
      return;
    }
    setLoading(true);
    try {
      await requestOtp(phone);
      navigate('/giris/kod', { state: { phone } });
    } catch {
      setError('SMS-kod göndərilə bilmədi. Yenidən cəhd edin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>AutoPulse Auksion — Giriş</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>Telefon nömrəsi</label>
          <input
            type="tel"
            placeholder="(010) 234-40-71"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={styles.input}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'Göndərilir...' : 'SMS-kod göndərilsin'}
          </button>
        </form>
      </div>
    </div>
  );
}
