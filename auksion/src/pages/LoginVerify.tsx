import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { requestOtp, verifyOtp, UserOtpError } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import styles from './Login.module.css';
import verifyStyles from './LoginVerify.module.css';

export default function LoginVerify() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const phone = (location.state as { phone?: string } | null)?.phone;

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!phone) {
      navigate('/giris');
    }
  }, [phone, navigate]);

  if (!phone) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await verifyOtp(phone, code);
      login(user);
      navigate('/');
    } catch (err) {
      setError(err instanceof UserOtpError ? err.message : 'Kod yanlışdır.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    try {
      await requestOtp(phone);
      setResent(true);
    } catch {
      setError('SMS-kod göndərilə bilmədi. Yenidən cəhd edin.');
    }
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
        <p className={verifyStyles.hint}>{phone} nömrəsinə SMS-kod göndərildi</p>
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
