import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Listing } from '../types';
import styles from './ListingDetailTabs.module.css';

type TabKey = 'overview' | 'features' | 'details' | 'pricing' | 'more';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'features', label: 'Features' },
  { key: 'details', label: 'Vehicle Details' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'more', label: 'More Cars' },
];

const DESCRIPTION_PREVIEW_LENGTH = 160;

interface ListingDetailTabsProps {
  listing: Listing;
  similar: Listing[];
}

export default function ListingDetailTabs({ listing, similar }: ListingDetailTabsProps) {
  const [tab, setTab] = useState<TabKey>('overview');
  const [descExpanded, setDescExpanded] = useState(false);

  const isLongDescription = listing.təsvir.length > DESCRIPTION_PREVIEW_LENGTH;
  const descriptionText =
    !descExpanded && isLongDescription
      ? listing.təsvir.slice(0, DESCRIPTION_PREVIEW_LENGTH).trimEnd() + '…'
      : listing.təsvir;

  return (
    <div className={styles.wrap}>
      <div className={styles.navRow}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? styles.navActive : styles.nav}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className={styles.panel}>
          <h2>Təsvir</h2>
          <p className={styles.description}>
            {descriptionText}
            {isLongDescription && (
              <button className={styles.readMoreBtn} onClick={() => setDescExpanded((v) => !v)}>
                {descExpanded ? ' Qısalt' : ' Davamını oxu'}
              </button>
            )}
          </p>

          <h3 className={styles.subHeading}>Əsas göstəricilər</h3>
          <div className={styles.quickGrid}>
            <div className={styles.quickStat}>
              <span className={styles.quickLabel}>İl</span>
              <span className={styles.quickValue}>{listing.il}</span>
            </div>
            <div className={styles.quickStat}>
              <span className={styles.quickLabel}>Yürüş</span>
              <span className={styles.quickValue}>{listing.yürüş.toLocaleString()} km</span>
            </div>
            <div className={styles.quickStat}>
              <span className={styles.quickLabel}>Yanacaq</span>
              <span className={styles.quickValue}>{listing.yanacaq}</span>
            </div>
            <div className={styles.quickStat}>
              <span className={styles.quickLabel}>Ötürücü</span>
              <span className={styles.quickValue}>{listing.ötürücü}</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'features' && (
        <div className={styles.panel}>
          <h2>Avtomobildə mövcud əşyalar</h2>
          {listing.təchizat.length > 0 ? (
            <div className={styles.equipmentGrid}>
              {listing.təchizat.map((item) => (
                <span key={item} className={styles.equipmentPill}>
                  ✓ {item}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>Əlavə təchizat qeyd olunmayıb.</p>
          )}
        </div>
      )}

      {tab === 'details' && (
        <div className={styles.panel}>
          <h2>Texniki Xarakteristikalar</h2>
          <table className={styles.specsTable}>
            <tbody>
              <tr>
                <td>Marka / Model</td>
                <td>{listing.marka} {listing.model}</td>
              </tr>
              <tr>
                <td>Buraxılış ili</td>
                <td>{listing.il}</td>
              </tr>
              <tr>
                <td>Mühərrik Həcmi</td>
                <td>{listing.mühərrik} · {listing.güc} a.g.</td>
              </tr>
              <tr>
                <td>Yanacaq</td>
                <td>{listing.yanacaq}</td>
              </tr>
              <tr>
                <td>Ban Növü</td>
                <td>{listing.ban}</td>
              </tr>
              <tr>
                <td>Ötürücü Qutusu</td>
                <td>{listing.ötürücü} · {listing.sürətlərQutusu} sürət</td>
              </tr>
              <tr>
                <td>Yerlərin sayı</td>
                <td>{listing.yerlərSayı}</td>
              </tr>
              <tr>
                <td>Rəng</td>
                <td>{listing.rəng}</td>
              </tr>
              <tr>
                <td>Vəziyyət</td>
                <td>{listing.vəziyyət}</td>
              </tr>
              <tr>
                <td>Yürüş</td>
                <td>{listing.yürüş.toLocaleString()} km</td>
              </tr>
              <tr>
                <td>Hansı bazar üçün yığılıb</td>
                <td>{listing.bazarÜçünYığılıb}</td>
              </tr>
              <tr>
                <td>Vuruq / Rəng dəyişikliyi</td>
                <td>
                  {listing.vuruğuVar ? 'Vuruğu var' : 'Vuruğu yoxdur'} ·{' '}
                  {listing.rənglənib ? 'Rənglənib' : 'Rənglənməyib'}
                </td>
              </tr>
            </tbody>
          </table>

          <h2 className={styles.mapHeading}>Yerləşmə</h2>
          <div className={styles.mapPlaceholder}>
            <img src="/mock-map.svg" alt="Xəritə" />
            <p>{listing.şəhər}</p>
          </div>
        </div>
      )}

      {tab === 'pricing' && (
        <div className={styles.panel}>
          <h2>Qiymət</h2>
          <div className={styles.priceBig}>{listing.qiymət.toLocaleString()} ₼</div>
          <div className={styles.priceFeatures}>
            {listing.kredit && <span className={styles.feature}>Kredit mövcuddur</span>}
            {listing.barter && <span className={styles.feature}>Barter qəbul edilir</span>}
          </div>
          <p className={styles.pricingNote}>
            Qiymətə aid sual və ya təklifiniz varsa, satıcı ilə birbaşa əlaqə saxlayın.
          </p>
        </div>
      )}

      {tab === 'more' && (
        <div className={styles.panel}>
          <h2>Bənzər Elanlar</h2>
          {similar.length === 0 ? (
            <p className={styles.empty}>Hazırda bənzər elan tapılmadı.</p>
          ) : (
            <div className={styles.moreGrid}>
              {similar.map((l) => (
                <Link key={l.id} to={`/elan/mock-${l.id}`} className={styles.moreCard}>
                  <img src={l.şəkillər[0]} alt={`${l.marka} ${l.model}`} />
                  <div className={styles.moreCardBody}>
                    <span className={styles.moreCardTitle}>
                      {l.marka} {l.model}
                    </span>
                    <span className={styles.moreCardPrice}>{l.qiymət.toLocaleString()} ₼</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
