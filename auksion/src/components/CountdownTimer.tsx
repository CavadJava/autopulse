import { useEffect, useRef, useState } from 'react';
import styles from './CountdownTimer.module.css';

function format(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function CountdownTimer({ endTime, onEnd }: { endTime: string; onEnd?: () => void }) {
  const end = new Date(endTime).getTime();
  const [remaining, setRemaining] = useState(() => end - Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const interval = setInterval(() => {
      const next = end - Date.now();
      setRemaining(next);
      if (next <= 0 && !firedRef.current) {
        firedRef.current = true;
        onEnd?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [end, onEnd]);

  if (remaining <= 0) {
    return <span className={styles.ended}>Bitdi</span>;
  }

  return <span className={styles.timer}>{format(remaining)}</span>;
}
