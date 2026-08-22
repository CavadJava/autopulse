ALTER TABLE avto444.shop ADD COLUMN logo_url TEXT;

ALTER TABLE avto444.shop_products
  ADD COLUMN marka TEXT,
  ADD COLUMN model TEXT,
  ADD COLUMN il INTEGER,
  ADD COLUMN qiymet INTEGER,
  ADD COLUMN yurus INTEGER,
  ADD COLUMN yanacaq TEXT,
  ADD COLUMN ban TEXT;

CREATE TABLE avto444.shop_product_images (
  id          BIGSERIAL PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES avto444.shop_products(id),
  url         TEXT NOT NULL,
  sira        INTEGER NOT NULL DEFAULT 0
);
