import styles from './SelectionBar.module.css';

export interface SelectionBarProps {
  count: number;
}

export default function SelectionBar({ count }: SelectionBarProps) {
  if (count === 0) return null;

  return (
    <div className={styles.bar}>
      {count} məhsul seçildi
    </div>
  );
}
