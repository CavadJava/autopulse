import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestOtp, loginBusiness } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import styles from './Login.module.css';

type Mode = 'fərdi' | 'biznes';

export default function Login() {
  const [mode, setMode] = useState<Mode>('fərdi');
  const [zəng, setZəng] = useState('');
  const [email, setEmail] = useState('');
  const [ünvan, setÜnvan] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleFərdiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!zəng.trim()) {
      setError('Telefon nömrəsini daxil edin.');
      return;
    }
    setLoading(true);
    try {
      await requestOtp(zəng);
      navigate('/giris/kod', { state: { zəng } });
    } catch {
      setError('SMS-kod göndərilə bilmədi. Yenidən cəhd edin.');
    } finally {
      setLoading(false);
    }
  };

  const handleBiznesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await loginBusiness({ email, ünvan });
      login(user);
      navigate('/kabinet');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş uğursuz oldu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>Kabinetə giriş</h1>

        <div className={styles.tabs}>
          <button
            className={mode === 'fərdi' ? styles.tabActive : styles.tab}
            onClick={() => setMode('fərdi')}
          >
            Fərdi
          </button>
          <button
            className={mode === 'biznes' ? styles.tabActive : styles.tab}
            onClick={() => setMode('biznes')}
          >
            Biznes
          </button>
        </div>

        {mode === 'fərdi' ? (
          <form onSubmit={handleFərdiSubmit} className={styles.form}>
            <label className={styles.label}>Telefon nömrəsi</label>
            <input
              type="tel"
              placeholder="(010) 234-40-71"
              value={zəng}
              onChange={(e) => setZəng(e.target.value)}
              className={styles.input}
            />
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? 'Göndərilir...' : 'SMS-kod göndərilsin'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleBiznesSubmit} className={styles.form}>
            <label className={styles.label}>E-mail</label>
            <input
              type="email"
              placeholder="biznes@sirket.az"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
            />
            <label className={styles.label}>Ünvan</label>
            <input
              type="text"
              placeholder="Bakı, Nərimanov r."
              value={ünvan}
              onChange={(e) => setÜnvan(e.target.value)}
              className={styles.input}
            />
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? 'Daxil olunur...' : 'Daxil ol'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
