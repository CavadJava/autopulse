import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { placeBid, AuksionUnauthorizedError, BidTooLowError, AuctionEndedError, type Listing, type Bid } from '../api/auksion';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/formatPrice';
import styles from './BidBox.module.css';

export default function BidBox({
  listing,
  bids,
  onBidPlaced,
}: {
  listing: Listing;
  bids: Bid[];
  onBidPlaced: (listing: Listing) => void;
}) {
  const { user } = useAuth();
  const [amount, setAmount] = useState(String(listing.minNextBid));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Resync the input whenever minNextBid changes (e.g. someone else's bid
  // raises it via the background poll) so the user never silently submits
  // a now-stale, too-low amount.
  useEffect(() => {
    setAmount(String(listing.minNextBid));
  }, [listing.minNextBid]);

  const price = listing.currentBid ?? listing.startingBid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const updated = await placeBid(listing.id, Number(amount));
      onBidPlaced(updated);
      setAmount(String(updated.minNextBid));
    } catch (err) {
      if (err instanceof AuksionUnauthorizedError) {
        setError('Təklif vermək üçün daxil olun.');
      } else if (err instanceof BidTooLowError) {
        setError(`Minimum təklif: ${formatPrice(err.minimum)} ₼`);
      } else if (err instanceof AuctionEndedError) {
        setError('Hərrac bitib.');
      } else {
        setError('Xəta baş verdi. Yenidən cəhd edin.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.box}>
      <div className={styles.price}>{formatPrice(price)} ₼</div>
      <div className={styles.bidCount}>{listing.bidCount} təklif</div>

      {listing.status === 'ended' ? (
        <p className={styles.ended}>Hərrac bitib.</p>
      ) : (
        <form onSubmit={handleSubmit} className={styles.form}>
          {!user && (
            <Link to="/giris" className={styles.loginPrompt}>
              Təklif vermək üçün daxil olun
            </Link>
          )}
          <input
            type="number"
            step="0.01"
            placeholder={String(listing.minNextBid)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={styles.input}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'Göndərilir...' : 'Təklif ver'}
          </button>
        </form>
      )}

      <h4 className={styles.historyTitle}>Təklif tarixçəsi</h4>
      <ul className={styles.history}>
        {bids.map((bid) => (
          <li key={bid.id}>
            {formatPrice(bid.amount)} ₼ — {new Date(bid.createdAt).toLocaleString('az-AZ')}
          </li>
        ))}
      </ul>
    </div>
  );
}
