import { useState } from 'react';
import type { Filters } from './FilterPanel';
import styles from './QuickFilterBar.module.css';

interface QuickFilterBarProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  resultCount: number;
  newTodayCount: number;
}

type Vəziyyət = 'hamısı' | 'Yeni' | 'İşlənmiş';

export default function QuickFilterBar({
  filters,
  onFilterChange,
  resultCount,
  newTodayCount,
}: QuickFilterBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const markaList = ['BMW', 'Mercedes', 'Toyota', 'Hyundai', 'Volkswagen', 'Audi'];
  const şəhərList = ['Bakı', 'Gəncə', 'Sumqayıt', 'Lənkəran'];
  const banList = ['Sedan', 'SUV', 'Kupe', 'Minivan', 'Pikap'];

  const vəziyyət: Vəziyyət = (filters.vəziyyət as Vəziyyət) || 'hamısı';

  const setField = (key: keyof Filters, value: string | number | boolean | undefined) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const handleReset = () => {
    onFilterChange({});
  };

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <select
          className={styles.select}
          value={filters.marka ?? ''}
          onChange={(e) => setField('marka', e.target.value || undefined)}
        >
          <option value="">Marka</option>
          {markaList.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select className={styles.select} disabled>
          <option>Model</option>
        </select>

        <div className={styles.toggleGroup}>
          <button
            className={vəziyyət === 'hamısı' ? styles.toggleActive : styles.toggle}
            onClick={() => setField('vəziyyət', undefined)}
          >
            Hamısı
          </button>
          <button
            className={vəziyyət === 'Yeni' ? styles.toggleActive : styles.toggle}
            onClick={() => setField('vəziyyət', 'Yeni')}
          >
            Yeni
          </button>
          <button
            className={vəziyyət === 'İşlənmiş' ? styles.toggleActive : styles.toggle}
            onClick={() => setField('vəziyyət', 'İşlənmiş')}
          >
            Sürülmüş
          </button>
        </div>

        <select
          className={styles.select}
          value={filters.şəhər ?? ''}
          onChange={(e) => setField('şəhər', e.target.value || undefined)}
        >
          <option value="">Şəhər</option>
          {şəhərList.map((ş) => (
            <option key={ş} value={ş}>
              {ş}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <input
          className={styles.numInput}
          type="number"
          placeholder="Qiymət, min."
          value={filters.qiymətMin ?? ''}
          onChange={(e) => setField('qiymətMin', e.target.value ? parseInt(e.target.value) : undefined)}
        />
        <input
          className={styles.numInput}
          type="number"
          placeholder="maks."
          value={filters.qiymətMax ?? ''}
          onChange={(e) => setField('qiymətMax', e.target.value ? parseInt(e.target.value) : undefined)}
        />

        <select className={styles.select} defaultValue="AZN">
          <option value="AZN">AZN</option>
          <option value="USD">USD</option>
        </select>

        <button
          className={filters.kredit ? styles.toggleActive : styles.toggle}
          onClick={() => setField('kredit', !filters.kredit)}
        >
          Kredit
        </button>
        <button
          className={filters.barter ? styles.toggleActive : styles.toggle}
          onClick={() => setField('barter', !filters.barter)}
        >
          Barter
        </button>

        <select
          className={styles.select}
          value={filters.ban ?? ''}
          onChange={(e) => setField('ban', e.target.value || undefined)}
        >
          <option value="">Ban növü</option>
          {banList.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <input
          className={styles.numInput}
          type="number"
          placeholder="İl, min."
          value={filters.ilMin ?? ''}
          onChange={(e) => setField('ilMin', e.target.value ? parseInt(e.target.value) : undefined)}
        />
        <input
          className={styles.numInput}
          type="number"
          placeholder="maks."
          value={filters.ilMax ?? ''}
          onChange={(e) => setField('ilMax', e.target.value ? parseInt(e.target.value) : undefined)}
        />
      </div>

      <div className={styles.footer}>
        <div className={styles.today}>
          <span className={styles.todayLabel}>Bu gün:</span>{' '}
          <span className={styles.todayCount}>{newTodayCount} yeni elan</span>
        </div>

        <div className={styles.footerCenter}>
          <div className={styles.toggleGroup}>
            <button className={styles.toggleActive}>Hamısı</button>
            <button className={styles.toggle}>
              Satışdadır
            </button>
            <button className={styles.toggle}>
              Sifarişlə
              <span className={styles.newDot}>yeni</span>
            </button>
          </div>
          <button className={styles.resetLink} onClick={handleReset}>
            Sıfırla
          </button>
          <button className={styles.moreBtn} onClick={() => setMoreOpen((v) => !v)}>
            Daha çox filtr {moreOpen ? '▲' : '▼'}
          </button>
        </div>

        <button className={styles.showBtn}>{resultCount} elanı göstər</button>
      </div>
    </div>
  );
}
