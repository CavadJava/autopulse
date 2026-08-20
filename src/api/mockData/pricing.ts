import { Plan } from '../../types';

export const mockPlans: Plan[] = [
  {
    id: 'free',
    ad: 'Fərdi (Pulsuz)',
    təsvir: 'Ayda 2 elan yerləşdirmə',
    qiymət: 0,
    xüsusiyyətlər: ['Ayda 2 elan', 'Əsas statistika'],
    tip: 'subscription',
  },
  {
    id: 'business',
    ad: 'Biznes (Aylıq)',
    təsvir: 'Limitsiz elan yerləşdirmə',
    qiymət: 49.99,
    xüsusiyyətlər: ['Limitsiz elan', 'Biznes profil badge', 'Statistika paneli'],
    tip: 'subscription',
  },
  {
    id: 'vip',
    ad: 'VIP Elan',
    təsvir: 'Elan siyahında yuxarıda görünüm',
    qiymət: 9.99,
    xüsusiyyətlər: ['Siyahıda yuxarı mövqe', 'Cyan badge', 'Vurğulanmış kart'],
    tip: 'vip_tier',
  },
  {
    id: 'premium_vip',
    ad: 'Premium VIP Elan',
    təsvir: 'Ana səhifədə xüsusi görünüm',
    qiymət: 24.99,
    xüsusiyyətlər: ['Siyahının başında', 'Qızılı badge', 'Böyük kart', 'Ana səhifədə feature'],
    tip: 'vip_tier',
  },
];
