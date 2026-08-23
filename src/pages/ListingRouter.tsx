import { useParams } from 'react-router-dom';
import ListingDetail from './ListingDetail';
import RealListingDetail from './RealListingDetail';

export default function ListingRouter() {
  const { id } = useParams<{ id: string }>();

  if (id?.startsWith('shop-') || id?.startsWith('user-')) {
    return <RealListingDetail />;
  }
  // Mock (sample) listings always use a "mock-" prefixed id (e.g. /elan/mock-2)
  // so their plain numeric ids ('1'-'12') can never collide with a real
  // shop_products/user_products row sharing the same numeric id.
  return <ListingDetail />;
}
