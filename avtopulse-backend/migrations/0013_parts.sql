-- migrations/0013_parts.sql
CREATE TABLE avto444.sellers (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.seller_parts (
  id                    BIGSERIAL PRIMARY KEY,
  seller_id             BIGINT NOT NULL REFERENCES avto444.sellers(id),
  model                 TEXT NOT NULL CHECK (model IN ('model3','modely','models','modelx','cybertruck')),
  row_no                INT,
  oem                   TEXT,
  description           TEXT,
  year_range            TEXT,
  price_raw             TEXT,
  price_made_in_china   NUMERIC,
  price_original_new    NUMERIC,
  price_original_used   NUMERIC,
  image_url             TEXT,
  image_url_s3          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_seller_parts_model ON avto444.seller_parts(model);
CREATE INDEX idx_seller_parts_seller ON avto444.seller_parts(seller_id);
