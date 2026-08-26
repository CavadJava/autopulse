import { useEffect, useState } from 'react';
import ModelTabs from '../components/ModelTabs';
import SellerFilterPanel from '../components/SellerFilterPanel';
import PartsGrid from '../components/PartsGrid';
import SelectionBar from '../components/SelectionBar';
import { getSellers, getParts } from '../api/parts';
import type { Seller, Part } from '../api/parts';
import styles from './Parts.module.css';

export default function Parts() {
  const [activeModel, setActiveModel] = useState('model3');
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [selectedSellerIds, setSelectedSellerIds] = useState<number[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedPartIds, setSelectedPartIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSellers()
      .then(setSellers)
      .catch((error) => console.error('Failed to fetch sellers:', error));
  }, []);

  useEffect(() => {
    setLoading(true);
    getParts({ model: activeModel, sellerIds: selectedSellerIds })
      .then((result) => {
        setParts(result.parts);
        setTotal(result.total);
      })
      .catch((error) => console.error('Failed to fetch parts:', error))
      .finally(() => setLoading(false));
  }, [activeModel, selectedSellerIds]);

  const toggleSelect = (partId: number) => {
    setSelectedPartIds((prev) =>
      prev.includes(partId) ? prev.filter((id) => id !== partId) : [...prev, partId]
    );
  };

  return (
    <div className={styles.page}>
      <ModelTabs activeModel={activeModel} onModelChange={setActiveModel} />
      <div className={styles.container}>
        <SellerFilterPanel
          sellers={sellers}
          selectedSellerIds={selectedSellerIds}
          onChange={setSelectedSellerIds}
        />
        <div className={styles.content}>
          <div className={styles.header}>
            <h1>Ehtiyat Hissələri</h1>
            <p className={styles.count}>{loading ? 'Yüklənir...' : `${total} hissə tapıldı`}</p>
          </div>
          {loading ? (
            <p className={styles.loading}>Yüklənir...</p>
          ) : (
            <PartsGrid parts={parts} selectedPartIds={selectedPartIds} onToggleSelect={toggleSelect} />
          )}
        </div>
      </div>
      <SelectionBar count={selectedPartIds.length} />
    </div>
  );
}
