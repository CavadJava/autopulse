CREATE SCHEMA IF NOT EXISTS avto444;

CREATE TABLE avto444.shop (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT UNIQUE NOT NULL,
  customer_id    BIGINT NOT NULL,
  title          TEXT NOT NULL,
  details        TEXT,
  work_times     TEXT,
  password_hash  TEXT NOT NULL
);

CREATE TABLE avto444.shop_products (
  id       BIGSERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  title    TEXT NOT NULL,
  details  TEXT,
  shop_id  BIGINT NOT NULL REFERENCES avto444.shop(id)
);

CREATE TABLE avto444.shop_sessions (
  token       TEXT PRIMARY KEY,
  shop_id     BIGINT NOT NULL REFERENCES avto444.shop(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
