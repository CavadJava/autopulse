import { useParams } from 'react-router-dom';
import RealListingDetail from './RealListingDetail';
import styles from './ListingDetail.module.css';

export default function ListingRouter() {
  const { id } = useParams<{ id: string }>();

  if (id?.startsWith('shop-') || id?.startsWith('user-')) {
    return <RealListingDetail />;
  }
  // No mock/sample listings exist anymore — every real listing goes through
  // the shop-/user- prefixed path above. Anything else (including legacy
  // "mock-*" links still produced by Compare.tsx's saved comparisons) has no
  // real listing behind it.
  return <div className={styles.error}>Elan tapılmadı.</div>;
}
