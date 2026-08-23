CREATE TABLE avto444.admin_notifications (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  filters     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.admin_notification_recipients (
  id                BIGSERIAL PRIMARY KEY,
  notification_id   BIGINT NOT NULL REFERENCES avto444.admin_notifications(id),
  recipient_type    TEXT NOT NULL CHECK (recipient_type IN ('user', 'shop')),
  recipient_id      BIGINT NOT NULL,
  is_read           BOOLEAN NOT NULL DEFAULT false,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_notif_recipients_lookup
  ON avto444.admin_notification_recipients (recipient_type, recipient_id, is_read);
