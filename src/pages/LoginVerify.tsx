import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { requestOtp, verifyOtp } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import styles from './Login.module.css';
import verifyStyles from './LoginVerify.module.css';

export default function LoginVerify() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const zəng = (location.state as { zəng?: string } | null)?.zəng;

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  if (!zəng) {
    navigate('/giris');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await verifyOtp(zəng, code);
      login(user);
      navigate('/kabinet');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kod yanlışdır.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResent(true);
    setError(null);
    await requestOtp(zəng);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={verifyStyles.header}>
          <button className={verifyStyles.back} onClick={() => navigate('/giris')}>
            ‹
          </button>
          <h1>Nömrənin təsdiqlənməsi</h1>
        </div>

        <p className={verifyStyles.hint}>{zəng} nömrəsinə SMS-kod göndərildi</p>
        <p className={verifyStyles.mockHint}>Mock kod: 1234</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>SMS-kod</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="1234"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className={styles.input}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'Yoxlanılır...' : 'Təsdiqlə'}
          </button>
        </form>

        <button className={verifyStyles.resend} onClick={handleResend}>
          {resent ? 'Kod yenidən göndərildi ✓' : 'SMS-kod yenidən göndərilsin'}
        </button>
      </div>
    </div>
  );
}
