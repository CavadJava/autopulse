import { useState } from 'react';
import type { Listing } from '../types';
import styles from './InteractiveGallery.module.css';

type GalleryTab = 'exterior' | 'interior' | 'features' | 'doors';

const TABS: { key: GalleryTab; label: string; icon: string }[] = [
  { key: 'exterior', label: 'Exterior', icon: '🚗' },
  { key: 'interior', label: 'Interior', icon: '💺' },
  { key: 'features', label: 'Key features', icon: '⚡' },
  { key: 'doors', label: 'Doors', icon: '🚪' },
];

// Hotspot positions tuned to where those parts actually sit on a typical
// 3/4-front car photo (like our mock shots): background/skyline off to the
// sides, windshield/mirror upper-mid, wheel/rocker-panel lower, front bumper
// centered low — instead of arbitrary evenly-spread percentages.
const HOTSPOT_POSITIONS = [
  { top: '62%', left: '8%' }, // background, driver's side
  { top: '18%', left: '46%' }, // skyline behind the roofline
  { top: '36%', left: '70%' }, // windshield / A-pillar
  { top: '61%', left: '84%' }, // rear wheel / rocker panel
  { top: '70%', left: '51%' }, // front bumper / grille
  { top: '26%', left: '16%' }, // background, passenger's side
];

interface InteractiveGalleryProps {
  listing: Listing;
}

export default function InteractiveGallery({ listing }: InteractiveGalleryProps) {
  const [activeTab, setActiveTab] = useState<GalleryTab>('exterior');
  const [activeHotspot, setActiveHotspot] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);

  const hotspots = listing.təchizat.slice(0, HOTSPOT_POSITIONS.length).map((label, idx) => ({
    label,
    ...HOTSPOT_POSITIONS[idx],
  }));

  return (
    <div className={styles.gallery}>
      <div className={styles.stage}>
        <img src={listing.şəkillər[selectedImage]} alt={`${listing.marka} ${listing.model}`} />

        {activeTab === 'exterior' &&
          hotspots.map((h, idx) => (
            <button
              key={h.label}
              type="button"
              className={`${styles.hotspot} ${activeHotspot === idx ? styles.hotspotActive : ''}`}
              style={{ top: h.top, left: h.left }}
              onClick={() => setActiveHotspot(activeHotspot === idx ? null : idx)}
            >
              <span className={styles.hotspotDot} />
              {activeHotspot === idx && <span className={styles.hotspotLabel}>{h.label}</span>}
            </button>
          ))}

        <div className={styles.zoomControls}>
          <button type="button" aria-label="Yaxınlaşdır">+</button>
          <button type="button" aria-label="Uzaqlaşdır">−</button>
        </div>
      </div>

      <div className={styles.tabRow}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? styles.tabActive : styles.tab}
            onClick={() => {
              setActiveTab(tab.key);
              setActiveHotspot(null);
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.thumbnails}>
        {listing.şəkillər.map((img, idx) => (
          <button
            key={idx}
            type="button"
            className={selectedImage === idx ? styles.thumbActive : styles.thumb}
            onClick={() => setSelectedImage(idx)}
          >
            <img src={img} alt={`Şəkil ${idx + 1}`} />
            {idx === listing.şəkillər.length - 1 && (
              <span className={styles.photoCountBadge}>
                🖼 {listing.şəkillər.length} şəkil
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
