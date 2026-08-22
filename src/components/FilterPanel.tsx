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

// Small icon per section — purely decorative, gives each collapsible
// group its own visual identity instead of a flat list of plain text labels.
const SECTION_ICONS: Record<string, string> = {
  marka: '🚗',
  qiymət: '💰',
  şəhər: '📍',
  yanacaq: '⛽',
  ban: '🚙',
  ötürücü: '⚙️',
  rəng: '🎨',
  vəziyyət: '✨',
  digər: '➕',
};

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

  const activeCount = Object.values(filters).filter((v) => v !== undefined && v !== false).length;

  const SectionHeader = ({ id, label }: { id: string; label: string }) => (
    <button className={styles.sectionHeader} onClick={() => toggleSection(id)} type="button">
      <span className={styles.sectionHeaderLeft}>
        <span className={styles.sectionIcon}>{SECTION_ICONS[id]}</span>
        {label}
      </span>
      <span className={expanded[id] ? styles.chevronBtnOpen : styles.chevronBtn}>▾</span>
    </button>
  );

  const Option = ({
    active,
    label,
    onClick,
  }: {
    active: boolean;
    label: string;
    onClick: () => void;
  }) => (
    <button type="button" className={active ? styles.optionActive : styles.option} onClick={onClick}>
      <span className={active ? styles.checkboxActive : styles.checkbox}>{active && '✓'}</span>
      {label}
    </button>
  );

  return (
    <aside className={styles.panel}>
      <button
        type="button"
        className={styles.mobileToggle}
        onClick={() => setMobileOpen((v) => !v)}
      >
        <h3 className={styles.title}>
          🔍 Filtrlər
          {activeCount > 0 && <span className={styles.activeBadge}>{activeCount}</span>}
        </h3>
        <span className={mobileOpen ? styles.chevronOpen : styles.chevron}>▾</span>
      </button>

      <div className={mobileOpen ? styles.bodyOpen : styles.body}>
        <div className={styles.desktopTitleRow}>
          <h3 className={styles.title}>
            🔍 Filtrlər
            {activeCount > 0 && <span className={styles.activeBadge}>{activeCount}</span>}
          </h3>
          {activeCount > 0 && (
            <button type="button" className={styles.clearBtn} onClick={() => onFilterChange({})}>
              Təmizlə
            </button>
          )}
        </div>

        <div className={styles.section}>
          <SectionHeader id="marka" label="Marka" />
          {expanded.marka && (
            <div className={styles.options}>
              {markaList.map((m) => (
                <Option
                  key={m}
                  label={m}
                  active={filters.marka === m}
                  onClick={() => handleFilterChange('marka', filters.marka === m ? undefined : m)}
                />
              ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <SectionHeader id="qiymət" label="Qiymət" />
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
              <span className={styles.rangeSep}>—</span>
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
          <SectionHeader id="şəhər" label="Şəhər" />
          {expanded.şəhər && (
            <div className={styles.options}>
              {şəhərList.map((ş) => (
                <Option
                  key={ş}
                  label={ş}
                  active={filters.şəhər === ş}
                  onClick={() => handleFilterChange('şəhər', filters.şəhər === ş ? undefined : ş)}
                />
              ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <SectionHeader id="yanacaq" label="Yanacaq" />
          {expanded.yanacaq && (
            <div className={styles.options}>
              {yanacaqList.map((y) => (
                <Option
                  key={y}
                  label={y}
                  active={filters.yanacaq === y}
                  onClick={() => handleFilterChange('yanacaq', filters.yanacaq === y ? undefined : y)}
                />
              ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <SectionHeader id="ban" label="Ban Növü" />
          {expanded.ban && (
            <div className={styles.options}>
              {banList.map((b) => (
                <Option
                  key={b}
                  label={b}
                  active={filters.ban === b}
                  onClick={() => handleFilterChange('ban', filters.ban === b ? undefined : b)}
                />
              ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <SectionHeader id="ötürücü" label="Ötürücü" />
          {expanded.ötürücü && (
            <div className={styles.options}>
              {ötürücüList.map((ö) => (
                <Option
                  key={ö}
                  label={ö}
                  active={filters.ötürücü === ö}
                  onClick={() => handleFilterChange('ötürücü', filters.ötürücü === ö ? undefined : ö)}
                />
              ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <SectionHeader id="rəng" label="Rəng" />
          {expanded.rəng && (
            <div className={styles.options}>
              {rəngList.map((r) => (
                <Option
                  key={r}
                  label={r}
                  active={filters.rəng === r}
                  onClick={() => handleFilterChange('rəng', filters.rəng === r ? undefined : r)}
                />
              ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <SectionHeader id="vəziyyət" label="Vəziyyət" />
          {expanded.vəziyyət && (
            <div className={styles.options}>
              {vəziyyətList.map((v) => (
                <Option
                  key={v}
                  label={v}
                  active={filters.vəziyyət === v}
                  onClick={() => handleFilterChange('vəziyyət', filters.vəziyyət === v ? undefined : v)}
                />
              ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <SectionHeader id="digər" label="Digər" />
          {expanded.digər && (
            <div className={styles.options}>
              <Option
                label="Kredit Mövcuddur"
                active={filters.kredit || false}
                onClick={() => handleFilterChange('kredit', !filters.kredit)}
              />
              <Option
                label="Barter Qəbul Edir"
                active={filters.barter || false}
                onClick={() => handleFilterChange('barter', !filters.barter)}
              />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
