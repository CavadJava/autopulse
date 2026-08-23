import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCompare } from '../context/CompareContext';
import { getListingById } from '../api/listings';
import type { Listing } from '../types';
import styles from './Compare.module.css';

interface Row {
  label: string;
  get: (l: Listing) => string;
  highlightDiff?: boolean;
}

const ROWS: Row[] = [
  { label: 'Qiymət', get: (l) => `${l.qiymət.toLocaleString()} ₼`, highlightDiff: true },
  { label: 'İl', get: (l) => String(l.il), highlightDiff: true },
  { label: 'Yürüş', get: (l) => `${l.yürüş.toLocaleString()} km`, highlightDiff: true },
  { label: 'Mühərrik', get: (l) => `${l.mühərrik} · ${l.güc} a.g.` },
  { label: 'Yanacaq', get: (l) => l.yanacaq },
  { label: 'Ötürücü qutusu', get: (l) => `${l.ötürücü} · ${l.sürətlərQutusu} sürət` },
  { label: 'Ban növü', get: (l) => l.ban },
  { label: 'Yerlərin sayı', get: (l) => String(l.yerlərSayı) },
  { label: 'Rəng', get: (l) => l.rəng },
  { label: 'Vəziyyət', get: (l) => l.vəziyyət },
  {
    label: 'Vuruq / Rəng dəyişikliyi',
    get: (l) => `${l.vuruğuVar ? 'Vuruğu var' : 'Vuruğu yoxdur'} · ${l.rənglənib ? 'Rənglənib' : 'Rənglənməyib'}`,
  },
  { label: 'Şəhər', get: (l) => l.şəhər },
];

export default function Compare() {
  const { ids, remove, clear } = useCompare();
  const navigate = useNavigate();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const fetched = await Promise.all(ids.map((id) => getListingById(id)));
        setListings(fetched.filter((l): l is Listing => l !== null));
      } finally {
        setLoading(false);
      }
    })();
  }, [ids]);

  if (ids.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <h1>Müqayisə siyahısı boşdur</h1>
          <p>Elanlara "Müqayisə et" düyməsi ilə əlavə edərək başlayın.</p>
          <button className={styles.emptyBtn} onClick={() => navigate('/elanlar')}>
            Elanlara bax
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className={styles.page}><p className={styles.loading}>Yüklənir...</p></div>;
  }

  // Union of every listing's equipment list, for the equipment comparison rows.
  const allEquipment = Array.from(new Set(listings.flatMap((l) => l.təchizat))).sort();

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Avtomobilləri Müqayisə Et</h1>
          <button className={styles.clearBtn} onClick={clear}>
            Hamısını təmizlə
          </button>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.rowLabelCol}></th>
                {listings.map((l) => (
                  <th key={l.id} className={styles.carCol}>
                    <button className={styles.removeCar} onClick={() => remove(l.id)}>
                      ✕
                    </button>
                    <Link to={`/elan/mock-${l.id}`} className={styles.carLink}>
                      <img src={l.şəkillər[0]} alt={`${l.marka} ${l.model}`} />
                      <span className={styles.carTitle}>
                        {l.marka} {l.model}
                      </span>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const values = listings.map((l) => row.get(l));
                const allSame = values.every((v) => v === values[0]);
                return (
                  <tr key={row.label}>
                    <td className={styles.rowLabelCol}>{row.label}</td>
                    {listings.map((l, idx) => (
                      <td
                        key={l.id}
                        className={
                          row.highlightDiff && !allSame ? styles.diffCell : undefined
                        }
                      >
                        {values[idx]}
                      </td>
                    ))}
                  </tr>
                );
              })}

              <tr>
                <td className={styles.rowLabelCol} colSpan={listings.length + 1}>
                  <span className={styles.sectionLabel}>Təchizat</span>
                </td>
              </tr>
              {allEquipment.map((item) => (
                <tr key={item}>
                  <td className={styles.rowLabelCol}>{item}</td>
                  {listings.map((l) => (
                    <td key={l.id} className={styles.equipCell}>
                      {l.təchizat.includes(item) ? (
                        <span className={styles.equipYes}>✓</span>
                      ) : (
                        <span className={styles.equipNo}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
