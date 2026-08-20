import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BRANDS, CAR_GENERATIONS, DEFAULT_GENERATIONS, MODIFICATIONS, DEFAULT_MODIFICATIONS } from '../api/mockData/brands';
import { getListingById, updateListing } from '../api/listings';
import type { Listing } from '../types';
import {
  initialNewListingForm,
  type Kateqoriya,
  type ListingPhoto,
  type NewListingFormState,
} from '../types/newListingForm';
import PhotoGrid from '../components/PhotoGrid';
import styles from './NewListing.module.css';

// Maps the color names used elsewhere in the app (ListingCard filters, mock data)
// to a swatch hex from RƏNGLƏR below, so editing an existing listing pre-selects
// its color instead of leaving the whole rest of the form hidden.
const RƏNG_NAME_TO_HEX: Record<string, string> = {
  Qara: '#000000',
  Ağ: '#F2EFE8',
  Gümüş: '#B7BCC4',
  Qırmızı: '#E11B1B',
  Mavi: '#4E9AE0',
};

const RƏNG_HEX_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(RƏNG_NAME_TO_HEX).map(([name, hex]) => [hex, name])
);

function listingToFormState(listing: Listing): NewListingFormState {
  return {
    kateqoriya: 'Minik',
    marka: listing.marka,
    model: listing.model,
    il: listing.il,
    ban: listing.ban,
    nəsil: 'Cari nəsil',
    mühərrikNövü: listing.yanacaq === 'Elektrik' ? 'Elektro' : listing.yanacaq,
    ötürücü: listing.ötürücü,
    sürətlərQutusu: String(listing.sürətlərQutusu),
    modifikasiya: listing.mühərrik,
    yerlərSayı: listing.yerlərSayı,
    rəng: RƏNG_NAME_TO_HEX[listing.rəng] ?? '#000000',
    bazarÜçünYığılıb: listing.bazarÜçünYığılıb,
    yürüş: String(listing.yürüş),
    yürüşVahidi: 'km',
    şəkillər: listing.şəkillər.map((url, idx) => ({
      id: `existing-${idx}`,
      kind: 'existing' as const,
      url,
    })),
    təchizat: listing.təchizat,
    vuruğuVar: listing.vuruğuVar,
    rənglənib: listing.rənglənib,
    qəzalı: listing.qəzalı,
    vinKod: '',
    əlavəMəlumat: listing.təsvir,
    şəhər: listing.şəhər,
    qiymət: String(listing.qiymət),
    valyuta: 'AZN',
    kreditlə: listing.kredit,
    barterMümkündür: listing.barter,
    ad: listing.satıcıAd,
    email: '',
    telefon: listing.satıcıZəng,
  };
}

function formStateToListingPatch(form: NewListingFormState): Partial<Listing> {
  return {
    marka: form.marka,
    model: form.model,
    il: form.il ?? 0,
    ban: form.ban,
    yanacaq: (form.mühərrikNövü === 'Elektro' ? 'Elektrik' : form.mühərrikNövü) as Listing['yanacaq'],
    ötürücü: form.ötürücü,
    sürətlərQutusu: parseInt(form.sürətlərQutusu) || 0,
    mühərrik: form.modifikasiya,
    yerlərSayı: form.yerlərSayı ?? 5,
    rəng: (form.rəng && RƏNG_HEX_TO_NAME[form.rəng]) || 'Digər',
    bazarÜçünYığılıb: form.bazarÜçünYığılıb,
    yürüş: parseInt(form.yürüş) || 0,
    təchizat: form.təchizat,
    vuruğuVar: form.vuruğuVar,
    rənglənib: form.rənglənib,
    qəzalı: form.qəzalı,
    təsvir: form.əlavəMəlumat,
    şəhər: form.şəhər,
    qiymət: parseInt(form.qiymət) || 0,
    kredit: form.kreditlə,
    barter: form.barterMümkündür,
    satıcıAd: form.ad,
    satıcıZəng: form.telefon,
  };
}

const KATEQORİYALAR: { key: Kateqoriya; icon: string; label: string }[] = [
  { key: 'Minik', icon: '🚗', label: 'Minik' },
  { key: 'Kommersiya', icon: '🚚', label: 'Kommersiya' },
  { key: 'Moto', icon: '🏍', label: 'Moto' },
];

const BAN_LIST = ['Sedan', 'Offroader / SUV, 5 qapı', 'Hetçbek', 'Universal', 'Kupe', 'Minivan', 'Pikap'];
const MÜHƏRRIK_LIST = ['Benzin', 'Dizel', 'Hibrid', 'Elektro'];
const ÖTÜRÜCÜ_LIST = ['Ön', 'Arxa', 'Tam'];
const SÜRƏT_QUTUSU_LIST = ['Mexaniki', 'Avtomat (Reduktor)', 'Robot', 'Variator'];
const YERLƏR_LIST = [2, 4, 5, 7, 8];
const RƏNGLƏR = [
  '#000000', '#3B3F45', '#7C838D', '#B7BCC4', '#F2EFE8', '#F1EFC9',
  '#7A2222', '#E11B1B', '#F2A5B8', '#E29A3A', '#E9C13A', '#F5E642',
  '#5B6E28', '#1F4B3F', '#4CB94E', '#A9C9A0', '#4E9AE0', '#1B3EDB',
  '#6B21D8', '#7A4A22',
];
const BAZAR_LIST = ['Amerika', 'Avropa', 'Digər', 'Dubay', 'Koreya', 'Rusiya', 'Rəsmi diler', 'Yaponiya', 'Çin'];
const ŞƏHƏR_LIST = ['Bakı', 'Gəncə', 'Sumqayıt', 'Lənkəran'];
const EQUIPMENT = [
  'Yüngül lehimli disklər', 'ABS', 'Lyuk', 'Yağış sensoru', 'Mərkəzi qapanma',
  'Park radarı', 'Kondisioner', 'Oturacaqların isidilməsi', 'Dəri salon',
  'Ksenon lampalar', 'Arxa görüntü kamerası', 'Yan pərdələr',
  'Oturacaqların ventilyasiyası', '360° kamera', 'Head-up displey',
  'Ön görüntü kamerası', 'İşıq sensoru', 'Start-stop',
];
const CURRENT_YEAR = 2026;
const YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i);
const MAX_DESC_LENGTH = 3000;
const MAX_PHOTOS = 21;
const MIN_PHOTOS = 3;

export default function NewListing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);

  const [form, setForm] = useState<NewListingFormState>(initialNewListingForm);
  const [submitted, setSubmitted] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoadingExisting(true);
      setLoadError(null);
      try {
        const listing = await getListingById(id);
        if (!listing) {
          setLoadError('Elan tapılmadı.');
          return;
        }
        setForm(listingToFormState(listing));
      } catch {
        setLoadError('Elan yüklənərkən xəta baş verdi.');
      } finally {
        setLoadingExisting(false);
      }
    })();
  }, [id]);

  const set = <K extends keyof NewListingFormState>(key: K, value: NewListingFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const brand = useMemo(() => BRANDS.find((b) => b.ad === form.marka), [form.marka]);
  const popularBrands = useMemo(() => BRANDS.filter((b) => b.populyar), []);
  const allBrands = useMemo(() => BRANDS.filter((b) => !b.populyar), []);

  const generationKey = `${form.marka}|${form.model}`;
  const generations = CAR_GENERATIONS[generationKey] ?? DEFAULT_GENERATIONS;
  const modifications = MODIFICATIONS[generationKey] ?? DEFAULT_MODIFICATIONS;

  if (!user) {
    return <Navigate to="/giris" replace />;
  }

  const handleReset = () => {
    setForm(initialNewListingForm);
  };

  const handlePhotosChange = (photos: ListingPhoto[]) => {
    set('şəkillər', photos);
  };

  const toggleEquipment = (item: string) => {
    const next = form.təchizat.includes(item)
      ? form.təchizat.filter((t) => t !== item)
      : [...form.təchizat, item];
    set('təchizat', next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditMode && id) {
      setSaving(true);
      try {
        // Mock update — new (locally-picked) photos aren't uploaded anywhere;
        // only existing photo URLs are persisted, in their current (possibly reordered) order.
        const existingUrls = form.şəkillər
          .filter((p): p is Extract<ListingPhoto, { kind: 'existing' }> => p.kind === 'existing')
          .map((p) => p.url);
        await updateListing(id, { ...formStateToListingPatch(form), şəkillər: existingUrls });
        setSubmitted(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        setLoadError('Yadda saxlanılarkən xəta baş verdi.');
      } finally {
        setSaving(false);
      }
      return;
    }
    // Mock creation — no backend. Real implementation would POST the form + upload images.
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loadingExisting) {
    return <div className={styles.page}><p className={styles.loadingText}>Yüklənir...</p></div>;
  }

  if (loadError && !submitted) {
    return <div className={styles.page}><p className={styles.loadingText}>{loadError}</p></div>;
  }

  if (submitted) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.successState}>
            <div className={styles.successIcon}>✓</div>
            <h1>{isEditMode ? 'Dəyişikliklər yadda saxlanıldı' : 'Elanınız qəbul edildi'}</h1>
            <p>
              {isEditMode
                ? 'Elanınız yeniləndi.'
                : 'Elanınız yoxlanılır və tezliklə saytda dərc olunacaq.'}
            </p>
            <button className={styles.primaryBtn} onClick={() => navigate('/kabinet/elanlarim')}>
              Elanlarıma bax
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <form onSubmit={handleSubmit}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h1>{isEditMode ? 'Elanı redaktə et' : 'Yeni elan'}</h1>
            <button type="button" className={styles.resetBtn} onClick={handleReset}>
              Sıfırla
            </button>
          </div>

          {/* Kateqoriya */}
          <div className={styles.categoryGrid}>
            {KATEQORİYALAR.map((k) => (
              <button
                key={k.key}
                type="button"
                className={form.kateqoriya === k.key ? styles.categoryTileActive : styles.categoryTile}
                onClick={() => set('kateqoriya', k.key)}
              >
                <span className={styles.categoryIcon}>{k.icon}</span>
                <span>{k.label}</span>
              </button>
            ))}
          </div>

          {form.kateqoriya && (
            <>
              {/* Marka */}
              <div className={styles.field}>
                <FloatingInput
                  label="Marka"
                  required
                  value={form.marka}
                  onChange={(v) => {
                    set('marka', v);
                    set('model', '');
                  }}
                  onClear={() => {
                    set('marka', '');
                    set('model', '');
                  }}
                />
              </div>

              {!form.marka && (
                <>
                  <div className={styles.brandSectionLabel}>Populyar</div>
                  <div className={styles.brandGrid}>
                    {popularBrands.map((b) => (
                      <button
                        type="button"
                        key={b.ad}
                        className={styles.brandItem}
                        onClick={() => set('marka', b.ad)}
                      >
                        <span className={styles.brandBadge}>{b.ad.slice(0, 2).toUpperCase()}</span>
                        {b.ad}
                      </button>
                    ))}
                  </div>
                  <div className={styles.brandSectionLabel}>Bütün markalar</div>
                  <div className={styles.brandGrid}>
                    {allBrands.map((b) => (
                      <button
                        type="button"
                        key={b.ad}
                        className={styles.brandItem}
                        onClick={() => set('marka', b.ad)}
                      >
                        <span className={styles.brandBadge}>{b.ad.slice(0, 2).toUpperCase()}</span>
                        {b.ad}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Model */}
              {brand && (
                <>
                  <div className={styles.field}>
                    <FloatingInput
                      label="Model"
                      required
                      value={form.model}
                      onChange={(v) => set('model', v)}
                      onClear={() => set('model', '')}
                    />
                  </div>
                  {!form.model && (
                    <div className={styles.modelGrid}>
                      {brand.modellər.map((m) => (
                        <button
                          type="button"
                          key={m}
                          className={styles.modelItem}
                          onClick={() => set('model', m)}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Buraxılış ili */}
              {form.model && (
                <>
                  <div className={styles.field}>
                    <FloatingInput
                      label="Buraxılış ili"
                      required
                      value={form.il ? String(form.il) : ''}
                      onChange={() => {}}
                      onClear={() => set('il', null)}
                      readOnly
                    />
                  </div>
                  {!form.il && (
                    <div className={styles.yearGrid}>
                      {YEARS.map((y) => (
                        <button
                          type="button"
                          key={y}
                          className={styles.yearItem}
                          onClick={() => set('il', y)}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Ban növü */}
              {form.il && (
                <div className={styles.field}>
                  <label className={styles.selectLabel}>Ban növü *</label>
                  <select
                    className={styles.select}
                    value={form.ban}
                    onChange={(e) => set('ban', e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Seçin
                    </option>
                    {BAN_LIST.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Nəsil */}
              {form.ban && (
                <div className={styles.field}>
                  <div className={styles.blockLabel}>Nəsil *</div>
                  <div className={styles.generationGrid}>
                    {generations.map((g) => (
                      <button
                        type="button"
                        key={g.ad}
                        className={form.nəsil === g.ad ? styles.generationTileActive : styles.generationTile}
                        onClick={() => set('nəsil', g.ad)}
                      >
                        <img src={g.şəkil} alt={g.ad} />
                        <span className={styles.generationLabel}>
                          <span className={styles.radioDot} />
                          {g.period}, {g.ad}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Mühərrik / Ötürücü / Sürətlər qutusu */}
              {form.nəsil && (
                <>
                  <div className={styles.field}>
                    <div className={styles.blockLabel}>Mühərrik *</div>
                    <div className={styles.pillRow}>
                      {MÜHƏRRIK_LIST.map((m) => (
                        <button
                          type="button"
                          key={m}
                          className={form.mühərrikNövü === m ? styles.pillActive : styles.pill}
                          onClick={() => set('mühərrikNövü', m)}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.field}>
                    <div className={styles.blockLabel}>Ötürücü *</div>
                    <div className={styles.pillRow}>
                      {ÖTÜRÜCÜ_LIST.map((o) => (
                        <button
                          type="button"
                          key={o}
                          className={form.ötürücü === o ? styles.pillActive : styles.pill}
                          onClick={() => set('ötürücü', o)}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.field}>
                    <div className={styles.blockLabel}>Sürətlər qutusu *</div>
                    <div className={styles.pillRow}>
                      {SÜRƏT_QUTUSU_LIST.map((s) => (
                        <button
                          type="button"
                          key={s}
                          className={form.sürətlərQutusu === s ? styles.pillActive : styles.pill}
                          onClick={() => set('sürətlərQutusu', s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {form.sürətlərQutusu && (
                    <div className={styles.field}>
                      <label className={styles.selectLabel}>Modifikasiya *</label>
                      <select
                        className={styles.select}
                        value={form.modifikasiya}
                        onChange={(e) => set('modifikasiya', e.target.value)}
                        required
                      >
                        <option value="" disabled>
                          Seçin
                        </option>
                        {modifications.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              {/* Yerlərin sayı */}
              {form.modifikasiya && (
                <div className={styles.field}>
                  <div className={styles.blockLabel}>Yerlərin sayı</div>
                  <div className={styles.circleRow}>
                    {YERLƏR_LIST.map((y) => (
                      <button
                        type="button"
                        key={y}
                        className={form.yerlərSayı === y ? styles.circleActive : styles.circle}
                        onClick={() => set('yerlərSayı', y)}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Rəng */}
              {form.yerlərSayı && (
                <div className={styles.field}>
                  <div className={styles.blockLabel}>Rəng *</div>
                  <div className={styles.colorRow}>
                    {RƏNGLƏR.map((c) => (
                      <button
                        type="button"
                        key={c}
                        className={form.rəng === c ? styles.colorSwatchActive : styles.colorSwatch}
                        style={{ background: c }}
                        onClick={() => set('rəng', c)}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Hansı bazar üçün yığılıb */}
              {form.rəng && (
                <div className={styles.field}>
                  <div className={styles.blockLabel}>Hansı bazar üçün yığılıb</div>
                  <div className={styles.pillRow}>
                    {BAZAR_LIST.map((b) => (
                      <button
                        type="button"
                        key={b}
                        className={form.bazarÜçünYığılıb === b ? styles.pillActive : styles.pill}
                        onClick={() => set('bazarÜçünYığılıb', b)}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {form.kateqoriya && form.rəng && (
          <>
            {/* Yürüş */}
            <div className={styles.card}>
              <div className={styles.blockLabel}>Yürüş *</div>
              <div className={styles.inlineRow}>
                <input
                  type="number"
                  min={0}
                  placeholder="Yürüş *"
                  className={styles.numInput}
                  value={form.yürüş}
                  onChange={(e) => set('yürüş', e.target.value)}
                  required
                />
                <select
                  className={styles.unitSelect}
                  value={form.yürüşVahidi}
                  onChange={(e) => set('yürüşVahidi', e.target.value as 'km' | 'mil')}
                >
                  <option value="km">km</option>
                  <option value="mil">mil</option>
                </select>
              </div>
            </div>

            {/* Şəkillər */}
            <div className={styles.card}>
              <div className={styles.blockLabel}>Şəkillər *</div>
              <div className={styles.warningBox}>
                <strong>Qadağandır!</strong>
                <span>Skrinşotlar, çərçivəli şəkillər və ekran şəkilləri.</span>
              </div>
              <PhotoGrid photos={form.şəkillər} onChange={handlePhotosChange} maxPhotos={MAX_PHOTOS} />
              <p className={styles.photoHint}>
                Minimum {MIN_PHOTOS} şəkil, maksimum {MAX_PHOTOS} şəkil ({form.şəkillər.length}/{MAX_PHOTOS}) ·
                Sıralamaq üçün şəkilləri sürükləyin
              </p>
            </div>

            {/* Təchizat */}
            <div className={styles.card}>
              <div className={styles.blockLabel}>Avtomobilin təchizatı</div>
              <div className={styles.pillRow}>
                {EQUIPMENT.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={form.təchizat.includes(item) ? styles.pillActive : styles.pill}
                    onClick={() => toggleEquipment(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* Vəziyyət */}
            <div className={styles.card}>
              <div className={styles.blockLabel}>Avtomobilin vəziyyəti</div>

              <ConditionRow
                title="Vuruğu var?"
                subtitle="Bir və ya bir neçə detalı dəyişdirilib və ya təmir olunub."
                checked={form.vuruğuVar}
                onToggle={() => set('vuruğuVar', !form.vuruğuVar)}
              />
              <ConditionRow
                title="Rənglənib?"
                subtitle="Bir və ya bir neçə detalı rənglənib və ya kosmetik işlər görülüb."
                checked={form.rənglənib}
                onToggle={() => set('rənglənib', !form.rənglənib)}
              />
              <ConditionRow
                title="Qəzalı və ya ehtiyat hissələr üçün?"
                subtitle="Təmirə ehtiyacı var və ya ümumiyyətlə yararsız vəziyyətdədir."
                checked={form.qəzalı}
                onToggle={() => set('qəzalı', !form.qəzalı)}
                highlighted
              />

              <div className={styles.field}>
                <FloatingInput
                  label="VIN-kod"
                  value={form.vinKod}
                  onChange={(v) => set('vinKod', v)}
                  onClear={() => set('vinKod', '')}
                />
              </div>
              <a className={styles.vinLink} href="#vin-help" onClick={(e) => e.preventDefault()}>
                VIN-kodu haradan tapmaq olar?
              </a>
            </div>

            {/* Əlavə məlumat */}
            <div className={styles.card}>
              <div className={styles.textareaHeader}>
                <div className={styles.blockLabel}>Əlavə məlumat</div>
                <span className={styles.charCount}>
                  {MAX_DESC_LENGTH - form.əlavəMəlumat.length} simvol qalıb
                </span>
              </div>
              <textarea
                className={styles.textarea}
                placeholder="Üstünlüklərini və vacib məqamları qeyd edin"
                maxLength={MAX_DESC_LENGTH}
                value={form.əlavəMəlumat}
                onChange={(e) => set('əlavəMəlumat', e.target.value)}
                rows={6}
              />
            </div>

            {/* Şəhər və qiymət */}
            <div className={styles.card}>
              <div className={styles.blockLabel}>Şəhər və qiymət</div>

              <div className={styles.field}>
                <label className={styles.selectLabel}>Şəhər *</label>
                <select
                  className={styles.select}
                  value={form.şəhər}
                  onChange={(e) => set('şəhər', e.target.value)}
                  required
                >
                  {ŞƏHƏR_LIST.map((ş) => (
                    <option key={ş} value={ş}>{ş}</option>
                  ))}
                </select>
              </div>

              <div className={styles.inlineRow}>
                <input
                  type="number"
                  min={0}
                  placeholder="Qiymət *"
                  className={styles.numInput}
                  value={form.qiymət}
                  onChange={(e) => set('qiymət', e.target.value)}
                  required
                />
                <select
                  className={styles.unitSelect}
                  value={form.valyuta}
                  onChange={(e) => set('valyuta', e.target.value as 'AZN' | 'USD')}
                >
                  <option value="AZN">AZN</option>
                  <option value="USD">USD</option>
                </select>
              </div>

              <div className={styles.checkboxRow}>
                <CheckboxTile
                  label="Kreditlə"
                  checked={form.kreditlə}
                  onToggle={() => set('kreditlə', !form.kreditlə)}
                />
                <CheckboxTile
                  label="Barter mümkündür"
                  checked={form.barterMümkündür}
                  onToggle={() => set('barterMümkündür', !form.barterMümkündür)}
                />
              </div>
            </div>

            {/* Əlaqə məlumatları */}
            <div className={styles.card}>
              <div className={styles.blockLabel}>Əlaqə məlumatları</div>

              <div className={styles.field}>
                <FloatingInput
                  label="Adınız"
                  required
                  value={form.ad}
                  onChange={(v) => set('ad', v)}
                  onClear={() => set('ad', '')}
                />
              </div>
              <div className={styles.field}>
                <FloatingInput
                  label="E-mail"
                  required
                  type="email"
                  value={form.email}
                  onChange={(v) => set('email', v)}
                  onClear={() => set('email', '')}
                />
              </div>
              <div className={styles.field}>
                <FloatingInput
                  label="Telefon nömrəsi"
                  required
                  value={form.telefon || user.zəng || ''}
                  onChange={(v) => set('telefon', v)}
                  onClear={() => set('telefon', '')}
                  verified
                />
              </div>
            </div>

            <div className={styles.submitRow}>
              <p className={styles.agreement}>
                {isEditMode ? 'Dəyişiklikləri yadda saxlayaraq' : 'Elan yerləşdirərək'}, siz AutoPulse-un{' '}
                <a href="#terms" onClick={(e) => e.preventDefault()}>İstifadəçi razılaşması</a> və{' '}
                <a href="#rules" onClick={(e) => e.preventDefault()}>Qaydaları</a> ilə razı olduğunuzu
                təsdiq edirsiniz
              </p>
              <button type="submit" className={styles.submitBtn} disabled={saving}>
                {saving ? 'Yadda saxlanılır...' : isEditMode ? 'Dəyişiklikləri yadda saxla' : 'Elan yerləşdir'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function FloatingInput({
  label,
  value,
  onChange,
  onClear,
  required,
  type = 'text',
  readOnly,
  verified,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  required?: boolean;
  type?: string;
  readOnly?: boolean;
  verified?: boolean;
}) {
  return (
    <div className={styles.floatingWrap}>
      <input
        type={type}
        className={styles.floatingInput}
        placeholder=" "
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        required={required}
      />
      <label className={styles.floatingLabel}>
        {label} {required && <span className={styles.asterisk}>*</span>}
      </label>
      {verified ? (
        <span className={styles.verifiedCheck}>✓</span>
      ) : (
        value && (
          <button type="button" className={styles.floatingClear} onClick={onClear}>
            ✕
          </button>
        )
      )}
    </div>
  );
}

function ConditionRow({
  title,
  subtitle,
  checked,
  onToggle,
  highlighted,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  onToggle: () => void;
  highlighted?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${styles.conditionRow} ${highlighted ? styles.conditionRowHighlighted : ''}`}
      onClick={onToggle}
    >
      <span className={styles.conditionText}>
        <span className={styles.conditionTitle}>{title}</span>
        <span className={styles.conditionSubtitle}>{subtitle}</span>
      </span>
      <span className={checked ? styles.checkboxActive : styles.checkbox} />
    </button>
  );
}

function CheckboxTile({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className={styles.checkboxTile} onClick={onToggle}>
      {label}
      <span className={checked ? styles.checkboxActive : styles.checkbox} />
    </button>
  );
}
