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

// Generic hotspot positions (percent of image box) — paired with the listing's
// own equipment list so every car gets plausible, data-driven callouts without
// hand-authoring positions per listing.
const HOTSPOT_POSITIONS = [
  { top: '28%', left: '22%' },
  { top: '20%', left: '48%' },
  { top: '35%', left: '68%' },
  { top: '58%', left: '15%' },
  { top: '62%', left: '52%' },
  { top: '55%', left: '80%' },
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
              className={styles.hotspot}
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
