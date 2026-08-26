import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadPartsExcel, getUploadStatus, PartsUnauthorizedError } from '../../api/parts';
import type { UploadJob } from '../../api/parts';
import styles from './PartsUploadPage.module.css';

export default function PartsUploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [sellerName, setSellerName] = useState('');
  const [job, setJob] = useState<UploadJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    setSubmitting(true);
    try {
      const { jobId } = await uploadPartsExcel(file, sellerName);
      setJob({ id: jobId, status: 'pending', processed: 0, total: 0 });

      pollRef.current = setInterval(async () => {
        try {
          const status = await getUploadStatus(jobId);
          setJob(status);
          if (status.status === 'done' || status.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch (pollError) {
          console.error('Failed polling upload status:', pollError);
        }
      }, 1000);
    } catch (uploadError) {
      if (uploadError instanceof PartsUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setError('Yükləmə zamanı xəta baş verdi.');
      console.error('Upload failed:', uploadError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1>Ehtiyat Hissələri Excel Yüklə</h1>

      <label className={styles.field}>
        Satıcı adı
        <input
          type="text"
          value={sellerName}
          onChange={(e) => setSellerName(e.target.value)}
          placeholder="Məs: Made in China Store"
        />
      </label>

      <label className={styles.field}>
        Fayl seç (.xlsx)
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <button type="button" onClick={handleUpload} disabled={!file || submitting}>
        {submitting ? 'Yüklənir...' : 'Yüklə'}
      </button>

      {error && <p className={styles.error}>Xəta: {error}</p>}

      {job && (
        <div className={styles.status}>
          <p>Status: {job.status}</p>
          {job.total > 0 && (
            <p>
              {job.processed}/{job.total}
            </p>
          )}
          {job.status === 'failed' && job.error && <p className={styles.error}>Xəta: {job.error}</p>}
          {job.status === 'done' && <p className={styles.success}>Yükləmə tamamlandı.</p>}
        </div>
      )}
    </div>
  );
}
