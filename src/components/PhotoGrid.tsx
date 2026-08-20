import { useRef, useState } from 'react';
import type { ListingPhoto } from '../types/newListingForm';
import { photoPreviewUrl } from '../types/newListingForm';
import styles from './PhotoGrid.module.css';

interface PhotoGridProps {
  photos: ListingPhoto[];
  onChange: (photos: ListingPhoto[]) => void;
  maxPhotos: number;
}

let photoIdCounter = 0;
function nextPhotoId() {
  photoIdCounter += 1;
  return `photo-${photoIdCounter}`;
}

export default function PhotoGrid({ photos, onChange, maxPhotos }: PhotoGridProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const newPhotos: ListingPhoto[] = Array.from(files).map((file) => ({
      id: nextPhotoId(),
      kind: 'new',
      file,
    }));
    onChange([...photos, ...newPhotos].slice(0, maxPhotos));
  };

  const removePhoto = (id: string) => {
    onChange(photos.filter((p) => p.id !== id));
  };

  const handleDragStart = (idx: number) => {
    setDragIndex(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (idx !== overIndex) setOverIndex(idx);
  };

  const handleDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const reordered = [...photos];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(idx, 0, moved);
    onChange(reordered);
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className={styles.grid}>
      {photos.map((photo, idx) => (
        <div
          key={photo.id}
          className={`${styles.thumb} ${dragIndex === idx ? styles.dragging : ''} ${
            overIndex === idx && dragIndex !== null && dragIndex !== idx ? styles.dragOver : ''
          }`}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDrop={() => handleDrop(idx)}
          onDragEnd={handleDragEnd}
        >
          <img src={photoPreviewUrl(photo)} alt={`Şəkil ${idx + 1}`} draggable={false} />
          {idx === 0 && <span className={styles.coverBadge}>Əsas şəkil</span>}
          <button type="button" className={styles.remove} onClick={() => removePhoto(photo.id)}>
            ✕
          </button>
        </div>
      ))}
      {photos.length < maxPhotos && (
        <button type="button" className={styles.addTile} onClick={() => fileInputRef.current?.click()}>
          <span className={styles.addIcon}>📷</span>
          Şəkil əlavə etmək
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
