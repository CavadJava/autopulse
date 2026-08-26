import type { Part } from '../api/parts';
import PartCard from './PartCard';
import styles from './PartsGrid.module.css';

export interface PartsGridProps {
  parts: Part[];
  selectedPartIds: number[];
  onToggleSelect: (partId: number) => void;
}

export default function PartsGrid({ parts, selectedPartIds, onToggleSelect }: PartsGridProps) {
  if (parts.length === 0) {
    return <p className={styles.empty}>Heç bir hissə tapılmadı.</p>;
  }

  return (
    <div className={styles.grid}>
      {parts.map((part) => (
        <PartCard
          key={part.id}
          part={part}
          selected={selectedPartIds.includes(part.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}
