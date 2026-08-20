import { useState } from 'react';
import type { SatıcıTipi } from '../types';
import styles from './FilterPanel.module.css';

export interface Filters {
  marka?: string;
  şəhər?: string;
  qiymətMin?: number;
  qiymətMax?: number;
  ilMin?: number;
  ilMax?: number;
  yanacaq?: string;
  ban?: string;
  ötürücü?: string;
  rəng?: string;
  vəziyyət?: string;
  kredit?: boolean;
  barter?: boolean;

  // Advanced ("Daha çox filtr") fields
  həcmMin?: number;
  həcmMax?: number;
  gücMin?: number;
  gücMax?: number;
  yürüşMax?: number;
  sürətlərQutusu?: number;
  satıcıTipi?: SatıcıTipi;
  yerlərSayı?: number;
  bazarÜçünYığılıb?: string;
  vuruğuVar?: boolean;
  rənglənib?: boolean;
  qəzalı?: boolean;
  təchizat?: string[];
}

interface FilterPanelProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
}

export default function FilterPanel({ filters, onFilterChange }: FilterPanelProps) {
  // Collapsed by default — the panel is only ever expanded via the mobile
  // toggle below; on desktop the CSS media query keeps it always visible
  // regardless of this state.
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    marka: true,
    qiymət: true,
    şəhər: false,
    yanacaq: false,
    ban: false,
    ötürücü: false,
    rəng: false,
    vəziyyət: false,
    digər: false,
  });

  const handleFilterChange = (key: keyof Filters, value: string | number | boolean | undefined) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const toggleSection = (section: string) => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const markaList = ['BMW', 'Mercedes', 'Toyota', 'Hyundai', 'Volkswagen', 'Audi'];
  const şəhərList = ['Bakı', 'Gəncə', 'Sumqayıt', 'Lənkəran'];
  const yanacaqList = ['Benzin', 'Dizel', 'Hibrid', 'Elektrik'];
  const banList = ['Sedan', 'SUV', 'Kupe', 'Minivan', 'Pikap'];
  const ötürücüList = ['Avtomatik', 'Mexaniki'];
  const rəngList = ['Qara', 'Ağ', 'Gümüş', 'Qırmızı', 'Mavi'];
  const vəziyyətList = ['Yeni', 'İşlənmiş'];

  return (
    <aside className={styles.panel}>
      <button
        type="button"
        className={styles.mobileToggle}
        onClick={() => setMobileOpen((v) => !v)}
      >
        <h3 className={styles.title}>Filtrlər</h3>
        <span className={mobileOpen ? styles.chevronOpen : styles.chevron}>▾</span>
      </button>

      <div className={mobileOpen ? styles.bodyOpen : styles.body}>
      <div className={styles.section}>
        <button className={styles.sectionHeader} onClick={() => toggleSection('marka')}>
          Marka {expanded.marka ? '−' : '+'}
        </button>
        {expanded.marka && (
          <div className={styles.options}>
            {markaList.map((m) => (
              <label key={m}>
                <input
                  type="checkbox"
                  checked={filters.marka === m}
                  onChange={(e) => handleFilterChange('marka', e.target.checked ? m : undefined)}
                />
                {m}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <button className={styles.sectionHeader} onClick={() => toggleSection('qiymət')}>
          Qiymət {expanded.qiymət ? '−' : '+'}
        </button>
        {expanded.qiymət && (
          <div className={styles.rangeInputs}>
            <input
              type="number"
              placeholder="Min"
              value={filters.qiymətMin ?? ''}
              onChange={(e) =>
                handleFilterChange('qiymətMin', e.target.value ? parseInt(e.target.value) : undefined)
              }
            />
            <input
              type="number"
              placeholder="Max"
              value={filters.qiymətMax ?? ''}
              onChange={(e) =>
                handleFilterChange('qiymətMax', e.target.value ? parseInt(e.target.value) : undefined)
              }
            />
          </div>
        )}
      </div>

      <div className={styles.section}>
        <button className={styles.sectionHeader} onClick={() => toggleSection('şəhər')}>
          Şəhər {expanded.şəhər ? '−' : '+'}
        </button>
        {expanded.şəhər && (
          <div className={styles.options}>
            {şəhərList.map((ş) => (
              <label key={ş}>
                <input
                  type="checkbox"
                  checked={filters.şəhər === ş}
                  onChange={(e) => handleFilterChange('şəhər', e.target.checked ? ş : undefined)}
                />
                {ş}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <button className={styles.sectionHeader} onClick={() => toggleSection('yanacaq')}>
          Yanacaq {expanded.yanacaq ? '−' : '+'}
        </button>
        {expanded.yanacaq && (
          <div className={styles.options}>
            {yanacaqList.map((y) => (
              <label key={y}>
                <input
                  type="checkbox"
                  checked={filters.yanacaq === y}
                  onChange={(e) => handleFilterChange('yanacaq', e.target.checked ? y : undefined)}
                />
                {y}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <button className={styles.sectionHeader} onClick={() => toggleSection('ban')}>
          Ban Növü {expanded.ban ? '−' : '+'}
        </button>
        {expanded.ban && (
          <div className={styles.options}>
            {banList.map((b) => (
              <label key={b}>
                <input
                  type="checkbox"
                  checked={filters.ban === b}
                  onChange={(e) => handleFilterChange('ban', e.target.checked ? b : undefined)}
                />
                {b}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <button className={styles.sectionHeader} onClick={() => toggleSection('ötürücü')}>
          Ötürücü {expanded.ötürücü ? '−' : '+'}
        </button>
        {expanded.ötürücü && (
          <div className={styles.options}>
            {ötürücüList.map((ö) => (
              <label key={ö}>
                <input
                  type="checkbox"
                  checked={filters.ötürücü === ö}
                  onChange={(e) => handleFilterChange('ötürücü', e.target.checked ? ö : undefined)}
                />
                {ö}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <button className={styles.sectionHeader} onClick={() => toggleSection('rəng')}>
          Rəng {expanded.rəng ? '−' : '+'}
        </button>
        {expanded.rəng && (
          <div className={styles.options}>
            {rəngList.map((r) => (
              <label key={r}>
                <input
                  type="checkbox"
                  checked={filters.rəng === r}
                  onChange={(e) => handleFilterChange('rəng', e.target.checked ? r : undefined)}
                />
                {r}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <button className={styles.sectionHeader} onClick={() => toggleSection('vəziyyət')}>
          Vəziyyət {expanded.vəziyyət ? '−' : '+'}
        </button>
        {expanded.vəziyyət && (
          <div className={styles.options}>
            {vəziyyətList.map((v) => (
              <label key={v}>
                <input
                  type="checkbox"
                  checked={filters.vəziyyət === v}
                  onChange={(e) => handleFilterChange('vəziyyət', e.target.checked ? v : undefined)}
                />
                {v}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <button className={styles.sectionHeader} onClick={() => toggleSection('digər')}>
          Digər {expanded.digər ? '−' : '+'}
        </button>
        {expanded.digər && (
          <div className={styles.checkboxes}>
            <label>
              <input
                type="checkbox"
                checked={filters.kredit || false}
                onChange={(e) => handleFilterChange('kredit', e.target.checked)}
              />
              Kredit Mövcuddur
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.barter || false}
                onChange={(e) => handleFilterChange('barter', e.target.checked)}
              />
              Barter Qəbul Edir
            </label>
          </div>
        )}
      </div>
      </div>
    </aside>
  );
}
