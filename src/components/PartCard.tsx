import type { Part } from '../api/parts';
import styles from './PartCard.module.css';

export interface PartCardProps {
  part: Part;
  selected: boolean;
  onToggleSelect: (partId: number) => void;
}

function formatPrice(label: string, value?: number) {
  if (value === undefined) return null;
  return (
    <div key={label} className={styles.priceRow}>
      <span className={styles.priceLabel}>{label}</span>
      <span className={styles.priceValue}>${value}</span>
    </div>
  );
}

export default function PartCard({ part, selected, onToggleSelect }: PartCardProps) {
  const hasStructuredPrice =
    part.priceMadeInChina !== undefined ||
    part.priceOriginalNew !== undefined ||
    part.priceOriginalUsed !== undefined;

  return (
    <div className={styles.card}>
      <label className={styles.checkboxWrap}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(part.id)}
          aria-label={`Seç: ${part.description ?? part.oem ?? part.id}`}
        />
      </label>
      <div className={styles.imageContainer}>
        {part.imageUrl ? (
          <img src={part.imageUrl} alt={part.description ?? part.oem ?? 'Hissə'} />
        ) : (
          <div className={styles.noImage}>Şəkil yoxdur</div>
        )}
      </div>
      <div className={styles.content}>
        {part.oem && <div className={styles.oem}>{part.oem}</div>}
        {part.description && <p className={styles.description}>{part.description}</p>}
        {part.yearRange && <p className={styles.year}>{part.yearRange}</p>}
        <div className={styles.prices}>
          {hasStructuredPrice ? (
            <>
              {formatPrice('Made in China', part.priceMadeInChina)}
              {formatPrice('Original new', part.priceOriginalNew)}
              {formatPrice('Original used', part.priceOriginalUsed)}
            </>
          ) : (
            part.priceRaw && <div className={styles.priceRawText}>{part.priceRaw}</div>
          )}
        </div>
        <div className={styles.seller}>{part.sellerName}</div>
      </div>
    </div>
  );
}
