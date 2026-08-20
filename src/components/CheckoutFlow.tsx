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
  const [saveCard, setSaveCard] = useState(false);
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

  if (step === 'form') {
    return (
      <div className={styles.paymentCard}>
        <div className={styles.paymentHeader}>
          <span className={styles.paymentBrand}>
            <span className={styles.paymentBrandAccent}>Auto</span>Pulse
          </span>
          <div className={styles.cardLogos}>
            <span className={styles.cardLogoVisa}>VISA</span>
            <span className={styles.cardLogoMc} />
          </div>
        </div>

        <p className={styles.paymentSubtitle}>Siz AutoPulse-da təqdim olunan xidmətin ödənişini edirsiniz.</p>

        <div className={styles.paymentAmountRow}>
          <span>Ödəniləcək məbləğ</span>
          <span className={styles.paymentAmount}>{price.toFixed(2)} AZN</span>
        </div>

        <form onSubmit={handleFormSubmit} className={styles.paymentForm}>
          <FloatingField
            label="Kartın nömrəsi"
            value={cardData.nömrə}
            onChange={(v) => handleCardChange('nömrə', v.replace(/\D/g, ''))}
            maxLength={16}
            inputMode="numeric"
          />
          <div className={styles.paymentRow}>
            <FloatingField
              label="Son istifadə tarixi"
              value={cardData.tarix}
              onChange={(v) => {
                let val = v.replace(/\D/g, '');
                if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2, 4);
                handleCardChange('tarix', val);
              }}
              maxLength={5}
              placeholder="AA/İİ"
              inputMode="numeric"
            />
            <FloatingField
              label="CVV/CVC"
              value={cardData.cvv}
              onChange={(v) => handleCardChange('cvv', v.replace(/\D/g, ''))}
              maxLength={3}
              inputMode="numeric"
            />
          </div>
          <FloatingField
            label="Kart sahibinin adı"
            value={cardData.ad}
            onChange={(v) => handleCardChange('ad', v)}
          />

          <label className={styles.saveCardRow}>
            <span className={saveCard ? styles.checkboxActive : styles.checkbox} onClick={() => setSaveCard((v) => !v)} />
            Sürətli ödənişlər üçün kartı yadda saxla
          </label>

          <button type="submit" disabled={loading} className={styles.paymentSubmitBtn}>
            {loading ? 'Emal edilir...' : 'Bank kartı ilə ödəyin'}
          </button>
        </form>

        <div className={styles.paymentFooter}>
          <span>Verified by VISA</span>
          <span>MasterCard SecureCode</span>
          <span>PCI DSS</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.checkout}>
      <div className={styles.summary}>
        <h3>Sifariş Xülasəsi</h3>
        <div className={styles.summaryRow}>
          <span>{planName}</span>
          <span className={styles.price}>{price} AZN</span>
        </div>
        <div className={styles.total}>
          <span>Cəmi</span>
          <span className={styles.price}>{price} AZN</span>
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

function FloatingField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
  inputMode?: 'numeric' | 'text';
}) {
  return (
    <div className={styles.floatingField}>
      <input
        type="text"
        className={styles.floatingInput}
        placeholder={placeholder ?? ' '}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        inputMode={inputMode}
        required
      />
      <label className={styles.floatingLabel}>{label}</label>
    </div>
  );
}
