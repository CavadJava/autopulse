import styles from './ModelTabs.module.css';

export interface ModelTabsProps {
  activeModel: string;
  onModelChange: (model: string) => void;
}

const MODELS: { key: string; label: string }[] = [
  { key: 'model3', label: 'MODEL 3' },
  { key: 'modely', label: 'MODEL Y' },
  { key: 'models', label: 'MODEL S' },
  { key: 'modelx', label: 'MODEL X' },
  { key: 'cybertruck', label: 'CYBER TRUCK' },
];

export default function ModelTabs({ activeModel, onModelChange }: ModelTabsProps) {
  return (
    <div className={styles.tabs}>
      {MODELS.map((m) => (
        <button
          key={m.key}
          type="button"
          className={m.key === activeModel ? `${styles.tab} ${styles.active}` : styles.tab}
          onClick={() => onModelChange(m.key)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
