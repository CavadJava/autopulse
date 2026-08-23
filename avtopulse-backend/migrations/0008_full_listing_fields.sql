ALTER TABLE avto444.shop_products ADD COLUMN details_json JSONB NOT NULL DEFAULT '{}';
ALTER TABLE avto444.shop_products ADD COLUMN view_count INT NOT NULL DEFAULT 0;

ALTER TABLE avto444.user_products ADD COLUMN details_json JSONB NOT NULL DEFAULT '{}';
ALTER TABLE avto444.user_products ADD COLUMN view_count INT NOT NULL DEFAULT 0;

ALTER TABLE avto444.shop_product_images
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'exterior' CHECK (kind IN ('exterior', 'interior', 'features', 'doors'));

ALTER TABLE avto444.user_products_images
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'exterior' CHECK (kind IN ('exterior', 'interior', 'features', 'doors'));
