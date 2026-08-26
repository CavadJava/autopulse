import type { Seller } from '../api/parts';
import styles from './SellerFilterPanel.module.css';

export interface SellerFilterPanelProps {
  sellers: Seller[];
  selectedSellerIds: number[];
  onChange: (sellerIds: number[]) => void;
}

export default function SellerFilterPanel({ sellers, selectedSellerIds, onChange }: SellerFilterPanelProps) {
  const toggle = (sellerId: number) => {
    if (selectedSellerIds.includes(sellerId)) {
      onChange(selectedSellerIds.filter((id) => id !== sellerId));
    } else {
      onChange([...selectedSellerIds, sellerId]);
    }
  };

  return (
    <div className={styles.panel}>
      <h3 className={styles.heading}>Satıcılar</h3>
      {sellers.map((seller) => (
        <label key={seller.id} className={styles.row}>
          <input
            type="checkbox"
            checked={selectedSellerIds.includes(seller.id)}
            onChange={() => toggle(seller.id)}
            aria-label={seller.name}
          />
          <span>{seller.name}</span>
        </label>
      ))}
    </div>
  );
}
