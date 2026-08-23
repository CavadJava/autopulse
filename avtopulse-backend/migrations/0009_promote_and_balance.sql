ALTER TABLE avto444.shop ADD COLUMN balans INT NOT NULL DEFAULT 0;
ALTER TABLE avto444.user ADD COLUMN balans INT NOT NULL DEFAULT 0;

ALTER TABLE avto444.shop_products ADD COLUMN vip_tier TEXT NOT NULL DEFAULT 'standart'
  CHECK (vip_tier IN ('standart', 'vip', 'premium_vip'));
ALTER TABLE avto444.user_products ADD COLUMN vip_tier TEXT NOT NULL DEFAULT 'standart'
  CHECK (vip_tier IN ('standart', 'vip', 'premium_vip'));
