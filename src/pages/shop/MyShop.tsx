import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getMyShopProducts,
  shopLogout,
  createShopProduct,
  uploadProductImages,
  uploadShopLogo,
  ShopUnauthorizedError,
} from '../../api/shop';
import type { ShopProduct } from '../../api/shop';
import styles from './MyShop.module.css';

const EMPTY_FORM = {
  name: '',
  title: '',
  details: '',
  marka: '',
  model: '',
  il: '',
  qiymet: '',
  yurus: '',
  yanacaq: '',
  ban: '',
};

export default function MyShop() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Page-level notice — separate from formError, so it stays visible even
  // after the create-product form auto-closes on success (e.g. the product
  // was created but its image upload failed).
  const [notice, setNotice] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const loadProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyShopProducts();
      setProducts(data);
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setError('Məhsullar yüklənərkən xəta baş verdi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    try {
      await shopLogout();
    } catch {
      // Best-effort — even if the network call fails, still take the user
      // back to the login page; they're no longer treating themselves as logged in.
    }
    navigate('/magaza-giris');
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.title.trim()) {
      setFormError('Ad və başlıq tələb olunur.');
      return;
    }
    setSaving(true);
    try {
      const created = await createShopProduct({
        name: form.name,
        title: form.title,
        details: form.details,
        marka: form.marka,
        model: form.model,
        il: form.il ? parseInt(form.il, 10) : 0,
        qiymet: form.qiymet ? parseInt(form.qiymet, 10) : 0,
        yurus: form.yurus ? parseInt(form.yurus, 10) : 0,
        yanacaq: form.yanacaq,
        ban: form.ban,
      });
      // The product is already created server-side at this point — a
      // failure below is only an image-upload failure, not a "creation
      // failed" one. Reload the list and reset the form regardless, so the
      // new product shows up, then surface the narrower error via the
      // page-level notice (formError would be invisible once the form closes).
      setForm(EMPTY_FORM);
      setImageFiles([]);
      setShowForm(false);
      setNotice(null);
      if (imageFiles.length > 0) {
        try {
          await uploadProductImages(created.id, imageFiles);
        } catch (err) {
          if (err instanceof ShopUnauthorizedError) {
            navigate('/magaza-giris');
            return;
          }
          setNotice('Məhsul yaradıldı, amma şəkillər yüklənmədi.');
        }
      }
      await loadProducts();
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setFormError('Məhsul yaradılarkən xəta baş verdi.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async () => {
    if (!logoFile) return;
    setLogoError(null);
    setLogoUploading(true);
    try {
      const result = await uploadShopLogo(logoFile);
      setLogoUrl(result.logoUrl);
      setLogoFile(null);
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setLogoError('Loqo yüklənərkən xəta baş verdi.');
    } finally {
      setLogoUploading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>Yüklənir...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Mənim mağazam</h1>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          Çıxış
        </button>
      </div>

      {notice && <p className={styles.formError}>{notice}</p>}

      <div className={styles.logoSection}>
        <div className={styles.logoLabel}>Mağaza logosu</div>
        {logoUrl && <img src={logoUrl} alt="Mağaza logosu" className={styles.logoPreview} />}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
        />
        <button
          className={styles.uploadBtn}
          onClick={handleLogoUpload}
          disabled={!logoFile || logoUploading}
        >
          {logoUploading ? 'Yüklənir...' : 'Logo yüklə'}
        </button>
        {logoError && <p className={styles.formError}>{logoError}</p>}
      </div>

      <button className={styles.toggleFormBtn} onClick={() => setShowForm((v) => !v)}>
        {showForm ? '− Formu bağla' : '+ Yeni məhsul əlavə et'}
      </button>

      {showForm && (
        <form onSubmit={handleCreateProduct} className={styles.form}>
          <input
            className={styles.input}
            placeholder="Ad (slug), məs. toyota-camry-2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="Başlıq, məs. Toyota Camry, 2022"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="Marka"
            value={form.marka}
            onChange={(e) => setForm({ ...form, marka: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="Model"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
          <input
            className={styles.input}
            type="number"
            placeholder="İl"
            value={form.il}
            onChange={(e) => setForm({ ...form, il: e.target.value })}
          />
          <input
            className={styles.input}
            type="number"
            placeholder="Qiymət (AZN)"
            value={form.qiymet}
            onChange={(e) => setForm({ ...form, qiymet: e.target.value })}
          />
          <input
            className={styles.input}
            type="number"
            placeholder="Yürüş (km)"
            value={form.yurus}
            onChange={(e) => setForm({ ...form, yurus: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="Yanacaq"
            value={form.yanacaq}
            onChange={(e) => setForm({ ...form, yanacaq: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="Ban növü"
            value={form.ban}
            onChange={(e) => setForm({ ...form, ban: e.target.value })}
          />
          <textarea
            className={styles.textarea}
            placeholder="Təsvir"
            value={form.details}
            onChange={(e) => setForm({ ...form, details: e.target.value })}
          />
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))}
          />
          {formError && <p className={styles.formError}>{formError}</p>}
          <button className={styles.submitBtn} type="submit" disabled={saving}>
            {saving ? 'Yaradılır...' : 'Məhsulu yarat'}
          </button>
        </form>
      )}

      {error && <p className={styles.status}>{error}</p>}

      {!error && products.length === 0 && (
        <p className={styles.status}>Hələ heç bir məhsulunuz yoxdur.</p>
      )}

      {!error && products.length > 0 && (
        <div className={styles.grid}>
          {products.map((product) => (
            <div key={product.id} className={styles.productCard}>
              {product.images?.[0] && (
                <img
                  src={product.images[0].url}
                  alt={product.title}
                  className={styles.productImage}
                />
              )}
              <div className={styles.productTitle}>{product.title}</div>
              {product.details && <div className={styles.productDetails}>{product.details}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
