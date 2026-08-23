import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getMyShopProducts,
  shopLogout,
  createShopProduct,
  uploadProductImages,
  uploadShopLogo,
  updateShopProduct,
  updateShopProfile,
  deleteShopProduct,
  deleteProductImage,
  restoreShopProduct,
  promoteShopListing,
  ShopUnauthorizedError,
} from '../../api/shop';
import type { ShopProduct } from '../../api/shop';
import { InsufficientBalanceError } from '../../api/auth';
import { getShopUnreadCount } from '../../api/chat';
import { getShopNotificationsUnreadCount } from '../../api/notifications';
import type { PromoTier } from '../../types';
import PromoteModal from '../../components/PromoteModal';
import styles from './MyShop.module.css';

const EMPTY_FORM = {
  name: '',
  title: '',
  details: '',
  marka: '',
  model: '',
  il: '',
  qiymet: '',
  qiymetUsd: '',
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

  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editImageFiles, setEditImageFiles] = useState<File[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'hamisi' | 'saytda' | 'legv_edilib'>('hamisi');
  const [restoringProductId, setRestoringProductId] = useState<number | null>(null);
  const [promotingProduct, setPromotingProduct] = useState<ShopProduct | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);

  const [profileAddress, setProfileAddress] = useState('');
  const [profileContactName, setProfileContactName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

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

  useEffect(() => {
    const poll = async () => {
      try {
        setUnreadCount(await getShopUnreadCount());
        setNotifUnread(await getShopNotificationsUnreadCount());
      } catch {
        // Non-fatal.
      }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
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
    setNotice(null);
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
        qiymetUsd: form.qiymetUsd ? parseInt(form.qiymetUsd, 10) : 0,
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

  const startEdit = (product: ShopProduct) => {
    setEditingProductId(product.id);
    setEditForm({
      name: product.name,
      title: product.title,
      details: product.details,
      marka: product.marka,
      model: product.model,
      il: String(product.il || ''),
      qiymet: String(product.qiymet || ''),
      qiymetUsd: String(product.qiymetUsd || ''),
      yurus: String(product.yurus || ''),
      yanacaq: product.yanacaq,
      ban: product.ban,
    });
    setEditImageFiles([]);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingProductId(null);
    setEditForm(EMPTY_FORM);
    setEditImageFiles([]);
    setEditError(null);
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProductId === null) return;
    setEditError(null);
    if (!editForm.name.trim() || !editForm.title.trim()) {
      setEditError('Ad və başlıq tələb olunur.');
      return;
    }
    setEditSaving(true);
    try {
      await updateShopProduct(editingProductId, {
        name: editForm.name,
        title: editForm.title,
        details: editForm.details,
        marka: editForm.marka,
        model: editForm.model,
        il: editForm.il ? parseInt(editForm.il, 10) : 0,
        qiymet: editForm.qiymet ? parseInt(editForm.qiymet, 10) : 0,
        qiymetUsd: editForm.qiymetUsd ? parseInt(editForm.qiymetUsd, 10) : 0,
        yurus: editForm.yurus ? parseInt(editForm.yurus, 10) : 0,
        yanacaq: editForm.yanacaq,
        ban: editForm.ban,
      });
      if (editImageFiles.length > 0) {
        try {
          await uploadProductImages(editingProductId, editImageFiles);
        } catch (err) {
          if (err instanceof ShopUnauthorizedError) {
            navigate('/magaza-giris');
            return;
          }
          setNotice('Məhsul yeniləndi, amma yeni şəkillər yüklənmədi.');
        }
      }
      cancelEdit();
      await loadProducts();
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setEditError('Məhsul yenilənərkən xəta baş verdi.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!window.confirm('Bu məhsulu silmək istədiyinizə əminsiniz?')) return;
    setDeletingProductId(productId);
    try {
      await deleteShopProduct(productId);
      await loadProducts();
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setNotice('Məhsul silinərkən xəta baş verdi.');
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleRestoreProduct = async (productId: number) => {
    setRestoringProductId(productId);
    try {
      await restoreShopProduct(productId);
      await loadProducts();
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setNotice('Məhsul bərpa edilərkən xəta baş verdi.');
    } finally {
      setRestoringProductId(null);
    }
  };

  const handleDeleteImage = async (productId: number, imageId: number) => {
    try {
      await deleteProductImage(productId, imageId);
      await loadProducts();
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setNotice('Şəkil silinərkən xəta baş verdi.');
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

  const handleProfileSave = async () => {
    setProfileSaving(true);
    setProfileError(null);
    try {
      await updateShopProfile(profileAddress, profileContactName);
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setProfileError('Profil yenilənərkən xəta baş verdi.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePromote = async (tier: PromoTier) => {
    if (!promotingProduct) return;
    try {
      await promoteShopListing(promotingProduct.id, tier);
      setPromoteError(null);
      await loadProducts();
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      if (err instanceof InsufficientBalanceError) {
        setPromoteError(`Balansınız kifayət etmir (${err.required} AZN lazımdır).`);
      } else {
        setPromoteError('Yüksəltmə zamanı xəta baş verdi.');
      }
      throw err;
    }
  };

  const visibleProducts = products.filter((product) => {
    if (activeTab === 'hamisi') return true;
    return product.status === activeTab;
  });

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
        <div className={styles.headerActions}>
          <Link to="/magazam/mesajlar" className={styles.logoutBtn}>
            💬 Mesajlar {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
          </Link>
          <Link to="/magazam/bildirisler" className={styles.logoutBtn}>
            🔔 Bildirişlər {notifUnread > 0 && <span className={styles.badge}>{notifUnread}</span>}
          </Link>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Çıxış
          </button>
        </div>
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

      <div className={styles.logoSection}>
        <div className={styles.logoLabel}>Ünvan və əlaqə şəxsi</div>
        <input
          className={styles.input}
          placeholder="Ünvan"
          value={profileAddress}
          onChange={(e) => setProfileAddress(e.target.value)}
        />
        <input
          className={styles.input}
          placeholder="Əlaqə şəxsinin adı (Ad Soyad)"
          value={profileContactName}
          onChange={(e) => setProfileContactName(e.target.value)}
        />
        <button className={styles.uploadBtn} onClick={handleProfileSave} disabled={profileSaving}>
          {profileSaving ? 'Yadda saxlanılır...' : 'Yadda saxla'}
        </button>
        {profileError && <p className={styles.formError}>{profileError}</p>}
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
            placeholder="Qiymət (USD, opsional)"
            value={form.qiymetUsd}
            onChange={(e) => setForm({ ...form, qiymetUsd: e.target.value })}
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

      <div className={styles.tabBar}>
        <button
          className={activeTab === 'hamisi' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('hamisi')}
        >
          Bütün elanlar ({products.length})
        </button>
        <button
          className={activeTab === 'saytda' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('saytda')}
        >
          Saytda ({products.filter((p) => p.status === 'saytda').length})
        </button>
        <button
          className={activeTab === 'legv_edilib' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('legv_edilib')}
        >
          Ləğv edilib ({products.filter((p) => p.status === 'legv_edilib').length})
        </button>
      </div>

      {error && <p className={styles.status}>{error}</p>}

      {!error && visibleProducts.length === 0 && (
        <p className={styles.status}>Bu bölmədə heç bir məhsul yoxdur.</p>
      )}

      {!error && visibleProducts.length > 0 && (
        <div className={styles.grid}>
          {visibleProducts.map((product) => (
            <div key={product.id} className={styles.productCard}>
              {editingProductId === product.id ? (
                <form onSubmit={handleUpdateProduct} className={styles.form}>
                  <input
                    className={styles.input}
                    placeholder="Ad (slug)"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    placeholder="Başlıq"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    placeholder="Marka"
                    value={editForm.marka}
                    onChange={(e) => setEditForm({ ...editForm, marka: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    placeholder="Model"
                    value={editForm.model}
                    onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    type="number"
                    placeholder="İl"
                    value={editForm.il}
                    onChange={(e) => setEditForm({ ...editForm, il: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    type="number"
                    placeholder="Qiymət (AZN)"
                    value={editForm.qiymet}
                    onChange={(e) => setEditForm({ ...editForm, qiymet: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    type="number"
                    placeholder="Qiymət (USD, opsional)"
                    value={editForm.qiymetUsd}
                    onChange={(e) => setEditForm({ ...editForm, qiymetUsd: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    type="number"
                    placeholder="Yürüş (km)"
                    value={editForm.yurus}
                    onChange={(e) => setEditForm({ ...editForm, yurus: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    placeholder="Yanacaq"
                    value={editForm.yanacaq}
                    onChange={(e) => setEditForm({ ...editForm, yanacaq: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    placeholder="Ban növü"
                    value={editForm.ban}
                    onChange={(e) => setEditForm({ ...editForm, ban: e.target.value })}
                  />
                  <textarea
                    className={styles.textarea}
                    placeholder="Təsvir"
                    value={editForm.details}
                    onChange={(e) => setEditForm({ ...editForm, details: e.target.value })}
                  />

                  {product.images && product.images.length > 0 && (
                    <div className={styles.imageManageGrid}>
                      {product.images.map((img) => (
                        <div key={img.id} className={styles.imageManageItem}>
                          <img src={img.minioUrl} alt="" className={styles.imageManageThumb} />
                          <div className={styles.storageLabels}>
                            <span className={styles.storageLabel}>MinIO</span>
                            {img.s3Url && <span className={styles.storageLabel}>AWS S3</span>}
                          </div>
                          <button
                            type="button"
                            className={styles.imageDeleteBtn}
                            onClick={() => handleDeleteImage(product.id, img.id)}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setEditImageFiles(Array.from(e.target.files ?? []))}
                  />
                  {editError && <p className={styles.formError}>{editError}</p>}
                  <div className={styles.editActions}>
                    <button className={styles.submitBtn} type="submit" disabled={editSaving}>
                      {editSaving ? 'Yenilənir...' : 'Yadda saxla'}
                    </button>
                    <button type="button" className={styles.cancelBtn} onClick={cancelEdit}>
                      Ləğv et
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {product.images?.[0] && (
                    <img
                      src={product.images[0].minioUrl}
                      alt={product.title}
                      className={styles.productImage}
                    />
                  )}
                  {product.images && product.images.length > 0 && (
                    <div className={styles.storageLabels}>
                      <span className={styles.storageLabel}>MinIO</span>
                      {product.images[0].s3Url && <span className={styles.storageLabel}>AWS S3</span>}
                    </div>
                  )}
                  <div className={styles.productTitle}>{product.title}</div>
                  {product.details && <div className={styles.productDetails}>{product.details}</div>}
                  {product.status === 'legv_edilib' && (
                    <div className={styles.statusBadge}>Ləğv edilib</div>
                  )}
                  <div className={styles.productActions}>
                    <button className={styles.editBtn} onClick={() => startEdit(product)}>
                      ✎ Redaktə et
                    </button>
                    {product.status === 'legv_edilib' ? (
                      <button
                        className={styles.restoreBtn}
                        onClick={() => handleRestoreProduct(product.id)}
                        disabled={restoringProductId === product.id}
                      >
                        {restoringProductId === product.id ? 'Bərpa olunur...' : '↺ Bərpa et'}
                      </button>
                    ) : (
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDeleteProduct(product.id)}
                        disabled={deletingProductId === product.id}
                      >
                        {deletingProductId === product.id ? 'Silinir...' : '🗑 Sil'}
                      </button>
                    )}
                    <button
                      className={styles.editBtn}
                      onClick={() => setPromotingProduct(product)}
                    >
                      ↑ Yüksəlt
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {promoteError && <p className={styles.status}>{promoteError}</p>}

      {promotingProduct && (
        <PromoteModal
          onClose={() => setPromotingProduct(null)}
          onConfirm={handlePromote}
          balans={Infinity}
        />
      )}
    </div>
  );
}
