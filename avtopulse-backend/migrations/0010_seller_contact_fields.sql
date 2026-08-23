ALTER TABLE avto444.shop ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE avto444.shop ADD COLUMN contact_name TEXT NOT NULL DEFAULT '';
ALTER TABLE avto444.shop ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- avto444.user already has created_at (from 0006_user_schema.sql) — no migration needed here.

ALTER TABLE avto444.shop_products ADD COLUMN qiymet_usd INT NOT NULL DEFAULT 0;
ALTER TABLE avto444.user_products ADD COLUMN qiymet_usd INT NOT NULL DEFAULT 0;
