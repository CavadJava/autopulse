import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import styles from './KabinetProfil.module.css';

export default function KabinetProfil() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleDelete = () => {
    logout();
    navigate('/');
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h2>Şəxsi məlumat</h2>
        <button className={styles.deleteLink} onClick={handleDelete}>
          Şəxsi kabineti sil
        </button>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Hesab tipi:</span>
        <span className={styles.value}>{user.hesabTipi === 'biznes' ? 'Biznes' : 'Fərdi'}</span>
      </div>

      {user.hesabTipi === 'fərdi' ? (
        <div className={styles.row}>
          <span className={styles.label}>Telefon nömrəsi:</span>
          <span className={styles.value}>{user.zəng}</span>
        </div>
      ) : (
        <>
          <div className={styles.row}>
            <span className={styles.label}>E-mail:</span>
            <span className={styles.value}>{user.email}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Ünvan:</span>
            <span className={styles.value}>{user.ünvan}</span>
          </div>
        </>
      )}

      <div className={styles.row}>
        <span className={styles.label}>Şifrə:</span>
        <span className={styles.value}>
          **************
          <button className={styles.changeLink}>Dəyişmək</button>
        </span>
      </div>
    </div>
  );
}
