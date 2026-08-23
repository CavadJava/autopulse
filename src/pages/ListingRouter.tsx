import { useParams } from 'react-router-dom';
import ListingDetail from './ListingDetail';
import RealListingDetail from './RealListingDetail';

export default function ListingRouter() {
  const { id } = useParams<{ id: string }>();

  if (id?.startsWith('shop-') || id?.startsWith('user-')) {
    return <RealListingDetail />;
  }
  return <ListingDetail />;
}
