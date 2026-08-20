import type { Filters } from './FilterPanel';
import styles from './AdvancedFilterPanel.module.css';

interface AdvancedFilterPanelProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
}

const EQUIPMENT = [
  'Yüngül lehimli disklər', 'ABS', 'Lyuk', 'Yağış sensoru', 'Mərkəzi qapanma',
  'Park radarı', 'Kondisioner', 'Oturacaqların isidilməsi',
  'Dəri salon', 'Ksenon lampalar', 'Arxa görüntü kamerası', 'Yan pərdələr',
  'Oturacaqların ventilyasiyası', '360° kamera',
  'Head-up displey', 'Ön görüntü kamerası', 'İşıq sensoru', 'Start-stop',
];

const RƏNG_LIST = ['Qara', 'Ağ', 'Gümüş', 'Qırmızı', 'Mavi'];
const YANACAQ_LIST = ['Benzin', 'Dizel', 'Hibrid', 'Elektrik'];
const ÖTÜRÜCÜ_LIST = ['Avtomatik', 'Mexaniki'];
const SÜRƏT_QUTUSU_LIST = [5, 6, 7, 8, 9];
const YER_SAYI_LIST = [2, 4, 5, 7];
const BAZAR_LIST = ['Avropa', 'ABŞ', 'Koreya', 'Yaponiya', 'Digər'];

export default function AdvancedFilterPanel({ filters, onFilterChange }: AdvancedFilterPanelProps) {
  const setField = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const toggleEquipment = (item: string) => {
    const current = filters.təchizat ?? [];
    const next = current.includes(item) ? current.filter((t) => t !== item) : [...current, item];
    setField('təchizat', next.length ? next : undefined);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.row}>
        <select
          className={styles.select}
          value={filters.rəng ?? ''}
          onChange={(e) => setField('rəng', e.target.value || undefined)}
        >
          <option value="">Rəng</option>
          {RƏNG_LIST.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          className={styles.select}
          value={filters.yanacaq ?? ''}
          onChange={(e) => setField('yanacaq', e.target.value || undefined)}
        >
          <option value="">Yanacaq növü</option>
          {YANACAQ_LIST.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          className={styles.select}
          value={filters.ötürücü ?? ''}
          onChange={(e) => setField('ötürücü', e.target.value || undefined)}
        >
          <option value="">Ötürücü</option>
          {ÖTÜRÜCÜ_LIST.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select
          className={styles.select}
          value={filters.sürətlərQutusu ?? ''}
          onChange={(e) => setField('sürətlərQutusu', e.target.value ? parseInt(e.target.value) : undefined)}
        >
          <option value="">Sürətlər qutusu</option>
          {SÜRƏT_QUTUSU_LIST.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <select
          className={styles.selectSm}
          value={filters.həcmMin ?? ''}
          onChange={(e) => setField('həcmMin', e.target.value ? parseInt(e.target.value) : undefined)}
        >
          <option value="">Həcm (sm³), min.</option>
          {[1000, 1400, 1600, 2000, 2500, 3000].map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <select
          className={styles.selectSm}
          value={filters.həcmMax ?? ''}
          onChange={(e) => setField('həcmMax', e.target.value ? parseInt(e.target.value) : undefined)}
        >
          <option value="">maks.</option>
          {[2000, 2500, 3000, 4000, 5000].map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <input
          className={styles.numInput}
          type="number"
          placeholder="Güc (a.g.), min."
          value={filters.gücMin ?? ''}
          onChange={(e) => setField('gücMin', e.target.value ? parseInt(e.target.value) : undefined)}
        />
        <input
          className={styles.numInput}
          type="number"
          placeholder="maks."
          value={filters.gücMax ?? ''}
          onChange={(e) => setField('gücMax', e.target.value ? parseInt(e.target.value) : undefined)}
        />
        <input
          className={styles.numInput}
          type="number"
          placeholder="Yürüş (km), min."
          disabled
        />
        <input
          className={styles.numInput}
          type="number"
          placeholder="maks."
          value={filters.yürüşMax ?? ''}
          onChange={(e) => setField('yürüşMax', e.target.value ? parseInt(e.target.value) : undefined)}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.toggleGroup}>
          <button
            className={!filters.satıcıTipi ? styles.toggleActive : styles.toggle}
            onClick={() => setField('satıcıTipi', undefined)}
          >
            Hamısı
          </button>
          <button
            className={filters.satıcıTipi === 'diler' ? styles.toggleActive : styles.toggle}
            onClick={() => setField('satıcıTipi', 'diler')}
          >
            Dilerlər
          </button>
          <button
            className={filters.satıcıTipi === 'şəxsi' ? styles.toggleActive : styles.toggle}
            onClick={() => setField('satıcıTipi', 'şəxsi')}
          >
            Şəxsi
          </button>
        </div>

        <select
          className={styles.select}
          value={filters.yerlərSayı ?? ''}
          onChange={(e) => setField('yerlərSayı', e.target.value ? parseInt(e.target.value) : undefined)}
        >
          <option value="">Yerlərin sayı</option>
          {YER_SAYI_LIST.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <select
          className={styles.select}
          value={filters.bazarÜçünYığılıb ?? ''}
          onChange={(e) => setField('bazarÜçünYığılıb', e.target.value || undefined)}
        >
          <option value="">Hansı bazar üçün yığılıb</option>
          {BAZAR_LIST.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        <button
          className={filters.vuruğuVar === false ? styles.toggleActive : styles.toggle}
          onClick={() => setField('vuruğuVar', filters.vuruğuVar === false ? undefined : false)}
        >
          Vuruğu yoxdur
        </button>
      </div>

      <div className={styles.row}>
        <button
          className={filters.rənglənib === false ? styles.toggleActive : styles.toggle}
          onClick={() => setField('rənglənib', filters.rənglənib === false ? undefined : false)}
        >
          Rənglənməyib
        </button>
        <button
          className={filters.qəzalı ? styles.toggleActive : styles.toggle}
          onClick={() => setField('qəzalı', !filters.qəzalı)}
        >
          Yalnız qəzalı avtomobillər
        </button>
      </div>

      <div className={styles.equipmentSection}>
        <div className={styles.equipmentTitle}>Avtomobilin təchizatı</div>
        <div className={styles.equipmentGrid}>
          {EQUIPMENT.map((item) => (
            <button
              key={item}
              className={(filters.təchizat ?? []).includes(item) ? styles.toggleActive : styles.toggle}
              onClick={() => toggleEquipment(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
