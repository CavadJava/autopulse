CREATE TABLE avto444.user (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  phone      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.user_sessions (
  token      TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES avto444.user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE avto444.user_products (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES avto444.user(id),
  marka      TEXT NOT NULL DEFAULT '',
  model      TEXT NOT NULL DEFAULT '',
  il         INT NOT NULL DEFAULT 0,
  qiymet     INT NOT NULL DEFAULT 0,
  yurus      INT NOT NULL DEFAULT 0,
  yanacaq    TEXT NOT NULL DEFAULT '',
  ban        TEXT NOT NULL DEFAULT '',
  title      TEXT NOT NULL DEFAULT '',
  details    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'gozlemede' CHECK (status IN ('gozlemede', 'saytda', 'legv_edilib')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.user_products_images (
  id              BIGSERIAL PRIMARY KEY,
  user_product_id BIGINT NOT NULL REFERENCES avto444.user_products(id),
  minio_url       TEXT NOT NULL,
  s3_url          TEXT,
  sira            INT NOT NULL DEFAULT 0
);
