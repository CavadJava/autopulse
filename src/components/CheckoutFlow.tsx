import { useState } from 'react';
import { submitCheckout } from '../api/pricing';
import type { CheckoutPayload } from '../types';
import styles from './CheckoutFlow.module.css';

interface CheckoutFlowProps {
  planId: string;
  planName: string;
  price: number;
}

export default function CheckoutFlow({ planId, planName, price }: CheckoutFlowProps) {
  const [step, setStep] = useState<'method' | 'form' | 'success'>('method');
  const [loading, setLoading] = useState(false);
  const [cardData, setCardData] = useState({
    nömrə: '',
    tarix: '',
    cvv: '',
    ad: '',
  });

  const handleMethodSelect = (method: 'apple_pay' | 'google_pay' | 'card') => {
    if (method === 'apple_pay' || method === 'google_pay') {
      handleSubmit(method);
    } else {
      setStep('form');
    }
  };

  const handleCardChange = (field: string, value: string) => {
    setCardData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (method: 'apple_pay' | 'google_pay' | 'card') => {
    setLoading(true);
    try {
      const payload: CheckoutPayload = {
        planId,
        paymentMethod: method,
        ...(method === 'card' && { cardDetails: cardData }),
      };

      await submitCheckout(payload);
      setStep('success');
    } catch (error) {
      console.error('Checkout failed:', error);
      alert('Ödəniş əməliyyatı uğursuz oldu.');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardData.nömrə || !cardData.tarix || !cardData.cvv || !cardData.ad) {
      alert('Lütfən bütün məlumatları doldurun.');
      return;
    }
    handleSubmit('card');
  };

  return (
    <div className={styles.checkout}>
      <div className={styles.summary}>
        <h3>Sifariş Xülasəsi</h3>
        <div className={styles.summaryRow}>
          <span>{planName}</span>
          <span className={styles.price}>${price}</span>
        </div>
        <div className={styles.total}>
          <span>Cəmi</span>
          <span className={styles.price}>${price}</span>
        </div>
      </div>

      {step === 'method' && (
        <div className={styles.methods}>
          <h3>Ödəniş Metodunu Seçin</h3>
          <button className={styles.methodBtn} onClick={() => handleMethodSelect('apple_pay')} disabled={loading}>
            🍎 Apple Pay
          </button>
          <button className={styles.methodBtn} onClick={() => handleMethodSelect('google_pay')} disabled={loading}>
            🔵 Google Pay
          </button>
          <button className={styles.methodBtn} onClick={() => handleMethodSelect('card')} disabled={loading}>
            💳 Visa / Mastercard
          </button>
        </div>
      )}

      {step === 'form' && (
        <form onSubmit={handleFormSubmit} className={styles.form}>
          <h3>Kart Məlumatları</h3>
          <input
            type="text"
            placeholder="Kart nömrəsi (16 rəqəm)"
            maxLength={16}
            value={cardData.nömrə}
            onChange={(e) => handleCardChange('nömrə', e.target.value.replace(/\D/g, ''))}
            required
          />
          <div className={styles.row}>
            <input
              type="text"
              placeholder="MM/YY"
              maxLength={5}
              value={cardData.tarix}
              onChange={(e) => {
                let val = e.target.value.replace(/\D/g, '');
                if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2, 4);
                handleCardChange('tarix', val);
              }}
              required
            />
            <input
              type="text"
              placeholder="CVV"
              maxLength={3}
              value={cardData.cvv}
              onChange={(e) => handleCardChange('cvv', e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          <input
            type="text"
            placeholder="Kart sahibinin adı"
            value={cardData.ad}
            onChange={(e) => handleCardChange('ad', e.target.value)}
            required
          />
          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'Emal edilir...' : `${price}$ Ödə`}
          </button>
        </form>
      )}

      {step === 'success' && (
        <div className={styles.success}>
          <div className={styles.checkmark}>✓</div>
          <h2>Ödəniş Uğurlu!</h2>
          <p>Sizin {planName} planı aktivləşdirildi.</p>
          <p className={styles.details}>Hesab menecerində planı idarə edə bilərsiniz.</p>
          <button className={styles.backBtn} onClick={() => (window.location.href = '/')}>
            Ana Səhifəyə Qayıt
          </button>
        </div>
      )}
    </div>
  );
}
