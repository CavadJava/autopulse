import { useRef, useState } from 'react';
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

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

interface InteractiveGalleryProps {
  listing: Listing;
}

export default function InteractiveGallery({ listing }: InteractiveGalleryProps) {
  const [activeTab, setActiveTab] = useState<GalleryTab>('exterior');
  const [activeHotspot, setActiveHotspot] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const stageRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null
  );
  const [dragging, setDragging] = useState(false);

  const hotspots = listing.təchizat.slice(0, HOTSPOT_POSITIONS.length).map((label, idx) => ({
    label,
    ...HOTSPOT_POSITIONS[idx],
  }));

  const clampPan = (next: { x: number; y: number }, z: number) => {
    if (z <= 1 || !stageRef.current) return { x: 0, y: 0 };
    const { width, height } = stageRef.current.getBoundingClientRect();
    const maxX = (width * (z - 1)) / 2;
    const maxY = (height * (z - 1)) / 2;
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const selectImage = (idx: number) => {
    setSelectedImage(idx);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const zoomIn = () => {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, z + ZOOM_STEP);
      setPan((p) => clampPan(p, next));
      return next;
    });
  };

  const zoomOut = () => {
    setZoom((z) => {
      const next = Math.max(MIN_ZOOM, z - ZOOM_STEP);
      setPan((p) => (next === 1 ? { x: 0, y: 0 } : clampPan(p, next)));
      return next;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    setDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPan(clampPan({ x: dragState.current.panX + dx, y: dragState.current.panY + dy }, zoom));
  };

  const endDrag = () => {
    dragState.current = null;
    setDragging(false);
  };

  return (
    <div className={styles.gallery}>
      <div
        ref={stageRef}
        className={styles.stage}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <img
          src={listing.şəkillər[selectedImage]}
          alt={`${listing.marka} ${listing.model}`}
          className={dragging ? styles.dragging : undefined}
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
          }}
          draggable={false}
        />

        {activeTab === 'exterior' &&
          zoom === 1 &&
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
          <button
            type="button"
            aria-label="Yaxınlaşdır"
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Uzaqlaşdır"
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
          >
            −
          </button>
        </div>

        {zoom > 1 && <div className={styles.zoomBadge}>{Math.round(zoom * 100)}%</div>}
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
            onClick={() => selectImage(idx)}
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
