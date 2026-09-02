CREATE SCHEMA IF NOT EXISTS auksion;

CREATE TABLE auksion.listings (
    id                   BIGSERIAL PRIMARY KEY,
    make                 TEXT NOT NULL,
    model                TEXT NOT NULL,
    year                 INT NOT NULL,
    description          TEXT NOT NULL DEFAULT '',
    images               JSONB NOT NULL DEFAULT '[]',
    starting_bid         NUMERIC(12,2) NOT NULL,
    current_bid          NUMERIC(12,2),
    bid_count            INT NOT NULL DEFAULT 0,
    end_time             TIMESTAMPTZ NOT NULL,
    status               TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
    created_by_admin_id  BIGINT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auksion.bids (
    id              BIGSERIAL PRIMARY KEY,
    listing_id      BIGINT NOT NULL REFERENCES auksion.listings(id),
    bidder_user_id  BIGINT NOT NULL REFERENCES avto444."user"(id),
    amount          NUMERIC(12,2) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auksion_bids_listing ON auksion.bids (listing_id, created_at DESC);
CREATE INDEX idx_auksion_listings_end_time ON auksion.listings (end_time);
