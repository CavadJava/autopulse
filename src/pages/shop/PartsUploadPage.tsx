import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadPartsExcel, getUploadStatus, PartsUnauthorizedError } from '../../api/parts';
import type { UploadJob } from '../../api/parts';
import { getMyShopProducts, ShopUnauthorizedError } from '../../api/shop';
import styles from './PartsUploadPage.module.css';

export default function PartsUploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<UploadJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Source workbooks can run ~195MB, so the browser may still be sending the
  // file body for minutes before the server even responds with a jobId.
  // Warn on tab close/reload during that window — there is no resume
  // support, so navigating away loses all upload progress.
  useEffect(() => {
    if (!submitting) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [submitting]);

  // Mount-time auth probe: this page has no read endpoint of its own, so it
  // reuses the existing shop-session-aware getMyShopProducts() call (the
  // same one MyShop.tsx uses) purely to detect an unauthenticated visitor
  // and redirect before the upload form is usable, rather than only failing
  // once the user submits the form and hits a 401 from the upload call.
  useEffect(() => {
    let cancelled = false;
    getMyShopProducts()
      .then(() => {
        if (!cancelled) setCheckingAuth(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ShopUnauthorizedError) {
          navigate('/magaza-giris');
          return;
        }
        // Any other failure (network blip, 500) shouldn't block access to
        // the upload form itself — only an explicit unauthorized redirects.
        setCheckingAuth(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    setSubmitting(true);
    setUploadPercent(0);
    try {
      const { jobId } = await uploadPartsExcel(file, setUploadPercent);
      setUploadPercent(null);
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
      setUploadPercent(null);
    }
  };

  if (checkingAuth) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>Yüklənir...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1>Ehtiyat Hissələri Excel Yüklə</h1>

      <label className={styles.field}>
        Fayl seç (.xlsx)
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <button type="button" onClick={handleUpload} disabled={!file || submitting}>
        {submitting
          ? uploadPercent !== null
            ? `Yüklənir... ${uploadPercent}%`
            : 'Yüklənir...'
          : 'Yüklə'}
      </button>

      {submitting && (
        <p className={styles.warning}>
          Fayl böyük ola bilər — yükləmə bitənə qədər səhifəni bağlamayın və ya yeniləməyin,
          əks halda yükləmə sıfırdan başlamalı olacaq.
        </p>
      )}

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
