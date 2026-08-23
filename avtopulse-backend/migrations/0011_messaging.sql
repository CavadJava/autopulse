CREATE TABLE avto444.conversations (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL CHECK (source IN ('shop', 'user')),
  listing_id    BIGINT NOT NULL,
  buyer_user_id BIGINT NOT NULL REFERENCES avto444.user(id),
  seller_type   TEXT NOT NULL CHECK (seller_type IN ('shop', 'user')),
  seller_id     BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, listing_id, buyer_user_id)
);

CREATE TABLE avto444.messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES avto444.conversations(id),
  sender_type     TEXT NOT NULL CHECK (sender_type IN ('shop', 'user')),
  sender_id       BIGINT NOT NULL,
  body            TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_id_idx ON avto444.messages (conversation_id, created_at);
