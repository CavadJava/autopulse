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
// 3/4-front exterior car photo (like our mock shots): background/skyline off
// to the sides, windshield/A-pillar upper-mid, rear wheel/rocker lower,
// front bumper centered low — instead of an arbitrary even grid.
const EXTERIOR_HOTSPOTS = [
  { top: '62%', left: '8%' }, // background, driver's side
  { top: '18%', left: '46%' }, // skyline behind the roofline
  { top: '36%', left: '70%' }, // windshield / A-pillar
  { top: '61%', left: '84%' }, // rear wheel / rocker panel
  { top: '70%', left: '51%' }, // front bumper / grille
  { top: '26%', left: '16%' }, // background, passenger's side
];

// Interior shots are usually dash-forward, so hotspots cluster around the
// steering wheel / dash / seats instead of spreading to the photo edges.
const INTERIOR_HOTSPOTS = [
  { top: '55%', left: '30%' }, // steering wheel
  { top: '35%', left: '55%' }, // dashboard / infotainment
  { top: '65%', left: '68%' }, // front seat
  { top: '30%', left: '20%' }, // instrument cluster
];

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

// How many pixels of horizontal drag it takes to advance one frame while
// spinning — smaller = more sensitive.
const SPIN_DRAG_THRESHOLD = 40;

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

  const [spinMode, setSpinMode] = useState(false);
  const spinDragStartX = useRef<number | null>(null);

  const exteriorHotspots = listing.təchizat
    .slice(0, EXTERIOR_HOTSPOTS.length)
    .map((label, idx) => ({ label, ...EXTERIOR_HOTSPOTS[idx] }));

  // Interior photo: prefer a second shot if the listing has one, otherwise
  // reuse the primary shot rather than showing nothing.
  const interiorImage = listing.şəkillər[1] ?? listing.şəkillər[0];
  const interiorLabels = ['Sükan', 'Mərkəzi ekran', 'Ön oturacaq', 'Cihaz paneli'];
  const interiorHotspots = interiorLabels
    .slice(0, INTERIOR_HOTSPOTS.length)
    .map((label, idx) => ({ label, ...INTERIOR_HOTSPOTS[idx] }));

  const stageImage = activeTab === 'interior' ? interiorImage : listing.şəkillər[selectedImage];
  const activeHotspots = activeTab === 'interior' ? interiorHotspots : exteriorHotspots;
  const showHotspots = (activeTab === 'exterior' || activeTab === 'interior') && zoom === 1 && !spinMode;
  const photoCount = listing.şəkillər.length;
  const showNavArrows = activeTab === 'exterior' && photoCount > 1 && !spinMode;

  // Per-tab thumbnail strips. There's no dedicated interior/features/doors
  // photo set in the mock data, so each tab reuses the listing's own photos
  // in a different order/offset — enough to make each tab feel like it has
  // its own gallery instead of literally the same strip everywhere.
  const thumbnailsByTab: Record<GalleryTab, string[]> = {
    exterior: listing.şəkillər,
    interior: [...listing.şəkillər].reverse(),
    features: listing.şəkillər.length > 1 ? [listing.şəkillər[1], ...listing.şəkillər] : listing.şəkillər,
    doors: listing.şəkillər,
  };
  const activeThumbnails = thumbnailsByTab[activeTab];

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

  const selectTab = (tab: GalleryTab) => {
    setActiveTab(tab);
    setActiveHotspot(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSpinMode(false);
  };

  const goToPrevImage = () => {
    setActiveHotspot(null);
    selectImage((selectedImage - 1 + photoCount) % photoCount);
  };

  const goToNextImage = () => {
    setActiveHotspot(null);
    selectImage((selectedImage + 1) % photoCount);
  };

  const toggleSpinMode = () => {
    setSpinMode((v) => !v);
    setActiveHotspot(null);
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
    if (spinMode) {
      e.preventDefault();
      spinDragStartX.current = e.clientX;
      setDragging(true);
      return;
    }
    if (zoom <= 1) return;
    e.preventDefault();
    dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    setDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (spinMode) {
      if (spinDragStartX.current === null) return;
      const dx = e.clientX - spinDragStartX.current;
      // Advance one frame per SPIN_DRAG_THRESHOLD px, in either direction,
      // then reset the baseline so continued dragging keeps advancing.
      if (Math.abs(dx) >= SPIN_DRAG_THRESHOLD) {
        const framesToAdvance = Math.trunc(dx / SPIN_DRAG_THRESHOLD);
        setSelectedImage((prev) => {
          const next = (prev + framesToAdvance + photoCount * 100) % photoCount;
          return next;
        });
        spinDragStartX.current = e.clientX;
      }
      return;
    }
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPan(clampPan({ x: dragState.current.panX + dx, y: dragState.current.panY + dy }, zoom));
  };

  const endDrag = () => {
    dragState.current = null;
    spinDragStartX.current = null;
    setDragging(false);
  };

  return (
    <div className={styles.gallery}>
      {(activeTab === 'exterior' || activeTab === 'interior') && (
        <div
          ref={stageRef}
          className={styles.stage}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        >
          <img
            src={stageImage}
            alt={`${listing.marka} ${listing.model} — ${activeTab === 'interior' ? 'interior' : 'exterior'}`}
            className={dragging ? styles.dragging : undefined}
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              cursor: spinMode
                ? dragging
                  ? 'grabbing'
                  : 'ew-resize'
                : zoom > 1
                  ? dragging
                    ? 'grabbing'
                    : 'grab'
                  : 'default',
            }}
            draggable={false}
          />

          {showNavArrows && (
            <>
              <button type="button" className={styles.navArrowLeft} onClick={goToPrevImage} aria-label="Əvvəlki şəkil">
                ‹
              </button>
              <button type="button" className={styles.navArrowRight} onClick={goToNextImage} aria-label="Növbəti şəkil">
                ›
              </button>
            </>
          )}

          {activeTab === 'exterior' && photoCount > 1 && (
            <button
              type="button"
              className={spinMode ? styles.spinBtnActive : styles.spinBtn}
              onClick={toggleSpinMode}
            >
              <span className={styles.spinIcon}>360°</span> Spin
            </button>
          )}

          {spinMode && <div className={styles.spinHint}>Fırlatmaq üçün şəkli sürükləyin</div>}

          {showHotspots &&
            activeHotspots.map((h, idx) => (
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

          {!spinMode && (
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
          )}

          {zoom > 1 && <div className={styles.zoomBadge}>{Math.round(zoom * 100)}%</div>}
        </div>
      )}

      {activeTab === 'features' && (
        <div className={styles.featuresPanel}>
          {listing.təchizat.length > 0 ? (
            <div className={styles.featuresGrid}>
              {listing.təchizat.map((item) => (
                <span key={item} className={styles.featurePill}>
                  ✓ {item}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.featuresEmpty}>Əlavə təchizat qeyd olunmayıb.</p>
          )}
        </div>
      )}

      {activeTab === 'doors' && (
        <div className={styles.doorsPanel}>
          <div className={styles.doorsCar}>
            <div className={styles.doorsRoof} />
            {Array.from({ length: listing.yerlərSayı >= 5 ? 4 : 2 }).map((_, idx) => (
              <div key={idx} className={styles.doorSlot}>
                <span className={styles.doorIcon}>🚪</span>
              </div>
            ))}
          </div>
          <p className={styles.doorsCaption}>
            {listing.yerlərSayı >= 5 ? '4 qapı' : '2 qapı'} · {listing.yerlərSayı} yerlik
          </p>
        </div>
      )}

      <div className={styles.tabRow}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? styles.tabActive : styles.tab}
            onClick={() => selectTab(tab.key)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.thumbnails}>
        {activeThumbnails.map((img, idx) => {
          const originalIdx = listing.şəkillər.indexOf(img);
          const isActive = activeTab === 'exterior' && selectedImage === originalIdx;
          return (
            <button
              key={`${activeTab}-${idx}`}
              type="button"
              className={isActive ? styles.thumbActive : styles.thumb}
              onClick={() => {
                if (activeTab === 'exterior') {
                  selectImage(originalIdx);
                } else {
                  selectTab('exterior');
                  selectImage(originalIdx);
                }
              }}
            >
              <img src={img} alt={`Şəkil ${idx + 1}`} />
              {idx === activeThumbnails.length - 1 && (
                <span className={styles.photoCountBadge}>
                  🖼 {activeThumbnails.length} şəkil
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
