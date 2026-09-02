# AutoPulse Auksion MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a browsing + live-bidding auction MVP ("AutoPulse Auksion") as a new `internal/auksion` package on the existing `avtopulse-backend` Go service, plus a new standalone frontend app at `auksion/` (formerly `carsandbids/`) in the `me-github/autopulse` repo.

**Architecture:** One new Go domain package (`internal/auksion`) mounted into the existing `avtopulse-backend` binary at `/api/auksion/*` — same port (8090), same Postgres database, new `auksion` schema. A brand-new Vite/React/TS frontend app lives in `auksion/`, calling that same backend, reusing the existing OTP user-login endpoints (`/api/users/otp/*`) so bidders are the same `avto444.user` accounts. Live-bid updates are client-side polling (no WebSocket). Design doc: `docs/superpowers/specs/2026-09-02-auksion-mvp-design.md`.

**Tech Stack:** Go 1.26, chi v5, pgx v5, Postgres. React 19 + TypeScript + Vite 8 + React Router 7, CSS Modules, Vitest + Testing Library.

## Global Constraints

- Backend: no new Go module, no new binary, no new port. Everything lives in `github.com/CavadJava/avtopulse-backend`'s existing `internal/auksion` package, mounted in the existing `cmd/server/main.go`.
- DB: same `avtopulse` Postgres database as everything else in this backend. New objects live in a new `auksion` Postgres schema (`CREATE SCHEMA IF NOT EXISTS auksion;`), not `avto444`, not `public`. Migration file: `avtopulse-backend/migrations/0015_auksion.sql` (next free number after `0014_seller_name_unique.sql`).
- Currency: AZN. Minimum bid increment is a fixed `100.00` AZN (constant `minIncrement` in `internal/auksion/repository.go`). No reserve price — every auction is "no reserve."
- Soft-close ("son-dəqiqə uzatma"): if a bid lands within the last **2 minutes** before `end_time`, `end_time` is pushed out by **2 minutes**. Both values are the constants `softCloseWindow` / `softCloseExtension` in `internal/auksion/repository.go`.
- Bidders are always `avto444.user` rows (the existing OTP-based individual accounts) — never shops.
- Only `avto444.user` bidders exist in this MVP; auction listings are created only through the admin-only `POST /api/auksion/admin/listings` endpoint (no public seller-submission form in this phase).
- Frontend: new, independent Vite app at `auksion/` (not a route inside the existing root `src/App.tsx`). Brand name in all UI copy and `<title>`: **AutoPulse Auksion**. Mirror the root app's dependency versions exactly (React 19.2.8, react-router-dom 7.18.2, Vite 8.2.0, Vitest 4.1.11, etc. — see Task 5).
- Frontend env var: `VITE_AUKSION_API_BASE` (mirrors the root app's `VITE_AVTOPULSE_API_BASE` pattern), pointing at the same `avtopulse-backend` (`http://localhost:8090` in dev).
- Existing saved reference HTML pages move from `carsandbids/` to `auksion/reference/` — used only for visual reference, never parsed for data, never imported by any code.
- Out of scope for this plan (do not build): Watch List, Collections, Events, FAQ, USDC payment, public seller-submission form, comment threads, reserve-price accept/decline, tiered bid increments, WebSocket, deploy/Caddy/domain config, image-upload UI for admin listing creation (admin supplies already-hosted image URLs as plain strings).
- Go JSON field naming: camelCase (matches every existing package — `parts.Part`, `user.User`, etc.). Verify with a marshal test, the way `parts.Job` already does (see `internal/parts/handler_test.go:105`).
- Known repo-wide gotcha (already bit `parts` and `listings` twice — see `getSellers`/`getParts` in `src/api/parts.ts`): Postgres/pgx returns a `NULL` slice as JSON `null`, not `[]`/`{}`. Every Go handler here must normalize nil slices to empty before writing JSON, and every new frontend API client function must normalize a `null` response field to `[]`.

---

### Task 1: Auksion migration + Go data model

**Files:**
- Create: `avtopulse-backend/migrations/0015_auksion.sql`
- Create: `avtopulse-backend/internal/auksion/model.go`
- Test: `avtopulse-backend/internal/auksion/model_test.go`

**Interfaces:**
- Produces: `Listing` struct, `Bid` struct, `NewListingInput` struct, sentinel errors `ErrNotFound`, `ErrAuctionEnded`, and error type `*BidTooLowError` — all consumed by Task 2 (repository) and Task 3 (handler).

- [ ] **Step 1: Write the migration**

```sql
-- avtopulse-backend/migrations/0015_auksion.sql
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
```

Note: the `status` column is written once (`'live'`) at insert time and never updated by the application — no cron/background job flips it. The Go layer always treats a listing as `ended` once `end_time` has passed, computed on read (Task 2), regardless of the stored column. The column exists for a future manual-cancel admin action (out of scope now), not as the source of truth for "is this live."

- [ ] **Step 2: Write the Go model types**

```go
// avtopulse-backend/internal/auksion/model.go
package auksion

import (
	"errors"
	"time"
)

var ErrNotFound = errors.New("auksion: listing not found")
var ErrAuctionEnded = errors.New("auksion: auction has ended")

// BidTooLowError carries the minimum amount that would have been accepted,
// so the handler can report it back to the client (mirrors the shape of
// user.ErrInsufficientBalance's 402 response in internal/user/handler.go).
type BidTooLowError struct {
	Minimum float64
}

func (e *BidTooLowError) Error() string {
	return "auksion: bid too low"
}

type Listing struct {
	ID          int64     `json:"id"`
	Make        string    `json:"make"`
	Model       string    `json:"model"`
	Year        int       `json:"year"`
	Description string    `json:"description"`
	Images      []string  `json:"images"`
	StartingBid float64   `json:"startingBid"`
	CurrentBid  *float64  `json:"currentBid,omitempty"`
	BidCount    int       `json:"bidCount"`
	// MinNextBid is computed server-side on every read: StartingBid if no
	// bid has been placed yet, otherwise CurrentBid + minIncrement. The
	// frontend must never re-derive this itself — it just displays it.
	MinNextBid float64   `json:"minNextBid"`
	EndTime    time.Time `json:"endTime"`
	// Status is always computed from EndTime vs. now() on read, never taken
	// directly from the DB column — see migration 0015's note.
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type Bid struct {
	ID            int64     `json:"id"`
	ListingID     int64     `json:"listingId"`
	BidderUserID  int64     `json:"bidderUserId"`
	Amount        float64   `json:"amount"`
	CreatedAt     time.Time `json:"createdAt"`
}

type NewListingInput struct {
	Make        string
	Model       string
	Year        int
	Description string
	Images      []string
	StartingBid float64
	EndTime     time.Time
}
```

- [ ] **Step 3: Write the failing marshal test**

```go
// avtopulse-backend/internal/auksion/model_test.go
package auksion

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// TestListing_MarshalsToCamelCaseJSON pins the wire format so the frontend's
// camelCase expectations can't silently regress — same pattern as
// internal/parts's TestJob_MarshalsToCamelCaseJSON.
func TestListing_MarshalsToCamelCaseJSON(t *testing.T) {
	bid := 15100.0
	l := Listing{
		ID: 1, Make: "Tesla", Model: "Model 3", Year: 2022,
		Images: []string{"https://example.com/1.jpg"},
		StartingBid: 15000, CurrentBid: &bid, BidCount: 3, MinNextBid: 15200,
		EndTime: time.Now(), Status: "live", CreatedAt: time.Now(),
	}

	b, err := json.Marshal(l)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	s := string(b)

	for _, key := range []string{
		`"id"`, `"make"`, `"model"`, `"year"`, `"startingBid"`, `"currentBid"`,
		`"bidCount"`, `"minNextBid"`, `"endTime"`, `"status"`, `"createdAt"`,
	} {
		if !strings.Contains(s, key) {
			t.Fatalf("expected JSON to contain camelCase key %s, got: %s", key, s)
		}
	}
	for _, key := range []string{`"ID"`, `"StartingBid"`, `"CurrentBid"`, `"MinNextBid"`} {
		if strings.Contains(s, key) {
			t.Fatalf("expected JSON NOT to contain PascalCase key %s, got: %s", key, s)
		}
	}
}

func TestListing_OmitsCurrentBidWhenNil(t *testing.T) {
	l := Listing{ID: 1, Make: "Tesla", Model: "Model 3", Year: 2022, StartingBid: 15000, MinNextBid: 15000}

	b, err := json.Marshal(l)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if strings.Contains(string(b), `"currentBid"`) {
		t.Fatalf("expected currentBid to be omitted when nil, got: %s", string(b))
	}
}
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd avtopulse-backend && go test ./internal/auksion/... -v`
Expected: FAIL — package `auksion` doesn't build yet if model.go has a typo, or the test simply doesn't exist. (If Step 2 and 3 were both written correctly this should already PASS — if so, skip to Step 5. If model.go has an error, this step's failure output tells you what to fix.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd avtopulse-backend && go test ./internal/auksion/... -v`
Expected: `PASS` for both `TestListing_MarshalsToCamelCaseJSON` and `TestListing_OmitsCurrentBidWhenNil`.

- [ ] **Step 6: Commit**

```bash
git add avtopulse-backend/migrations/0015_auksion.sql avtopulse-backend/internal/auksion/model.go avtopulse-backend/internal/auksion/model_test.go
git commit -m "feat(auksion): add migration + data model for auction listings/bids"
```

---

### Task 2: Auksion repository (Postgres)

**Files:**
- Create: `avtopulse-backend/internal/auksion/repository.go`
- Test: `avtopulse-backend/internal/auksion/repository_pg_test.go`

**Interfaces:**
- Consumes: `Listing`, `Bid`, `NewListingInput`, `ErrNotFound`, `ErrAuctionEnded`, `*BidTooLowError` (Task 1).
- Produces: `Repository` interface + `NewRepository(pool *pgxpool.Pool) Repository`, consumed by Task 3 (handler) and Task 4 (main.go wiring).

- [ ] **Step 1: Write the repository**

```go
// avtopulse-backend/internal/auksion/repository.go
package auksion

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const minIncrement = 100.0
const softCloseWindow = 2 * time.Minute
const softCloseExtension = 2 * time.Minute

type Repository interface {
	ListLive(ctx context.Context) ([]Listing, error)
	GetByID(ctx context.Context, id int64) (*Listing, error)
	ListBids(ctx context.Context, listingID int64, limit int) ([]Bid, error)
	PlaceBid(ctx context.Context, listingID, bidderUserID int64, amount float64) (*Listing, error)
	CreateListing(ctx context.Context, input NewListingInput) (*Listing, error)
}

type pgRepository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &pgRepository{pool: pool}
}

// finalize computes MinNextBid and the effective (never-stale) Status on a
// row that was just read from the DB. Every read path must go through this.
func finalize(l Listing) Listing {
	if l.CurrentBid != nil {
		l.MinNextBid = *l.CurrentBid + minIncrement
	} else {
		l.MinNextBid = l.StartingBid
	}
	if time.Now().After(l.EndTime) {
		l.Status = "ended"
	} else {
		l.Status = "live"
	}
	return l
}

func scanListing(row pgx.Row) (*Listing, error) {
	var l Listing
	var imagesRaw []byte
	err := row.Scan(&l.ID, &l.Make, &l.Model, &l.Year, &l.Description, &imagesRaw,
		&l.StartingBid, &l.CurrentBid, &l.BidCount, &l.EndTime, &l.CreatedAt)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(imagesRaw, &l.Images); err != nil {
		return nil, err
	}
	if l.Images == nil {
		l.Images = []string{}
	}
	final := finalize(l)
	return &final, nil
}

const listingColumns = `id, make, model, year, description, images, starting_bid, current_bid, bid_count, end_time, created_at`

func (r *pgRepository) ListLive(ctx context.Context) ([]Listing, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+listingColumns+`
		FROM auksion.listings
		WHERE status = 'live' AND end_time > now()
		ORDER BY end_time ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []Listing
	for rows.Next() {
		l, err := scanListing(rows)
		if err != nil {
			return nil, err
		}
		results = append(results, *l)
	}
	if results == nil {
		results = []Listing{}
	}
	return results, rows.Err()
}

func (r *pgRepository) GetByID(ctx context.Context, id int64) (*Listing, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+listingColumns+` FROM auksion.listings WHERE id = $1`, id)
	l, err := scanListing(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return l, nil
}

func (r *pgRepository) ListBids(ctx context.Context, listingID int64, limit int) ([]Bid, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, listing_id, bidder_user_id, amount, created_at
		FROM auksion.bids
		WHERE listing_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, listingID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []Bid
	for rows.Next() {
		var b Bid
		if err := rows.Scan(&b.ID, &b.ListingID, &b.BidderUserID, &b.Amount, &b.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, b)
	}
	if results == nil {
		results = []Bid{}
	}
	return results, rows.Err()
}

func (r *pgRepository) CreateListing(ctx context.Context, input NewListingInput) (*Listing, error) {
	images := input.Images
	if images == nil {
		images = []string{}
	}
	imagesJSON, err := json.Marshal(images)
	if err != nil {
		return nil, err
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO auksion.listings (make, model, year, description, images, starting_bid, end_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING `+listingColumns+`
	`, input.Make, input.Model, input.Year, input.Description, imagesJSON, input.StartingBid, input.EndTime)

	return scanListing(row)
}

// PlaceBid runs entirely inside one transaction with a row lock on the
// listing, so two concurrent bids on the same listing can never both
// "win" — the second transaction blocks on FOR UPDATE until the first
// commits, then re-validates against the now-updated current_bid.
func (r *pgRepository) PlaceBid(ctx context.Context, listingID, bidderUserID int64, amount float64) (*Listing, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var currentBid *float64
	var startingBid float64
	var endTime time.Time
	err = tx.QueryRow(ctx, `
		SELECT current_bid, starting_bid, end_time FROM auksion.listings WHERE id = $1 FOR UPDATE
	`, listingID).Scan(&currentBid, &startingBid, &endTime)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	if time.Now().After(endTime) {
		return nil, ErrAuctionEnded
	}

	minimum := startingBid
	if currentBid != nil {
		minimum = *currentBid + minIncrement
	}
	if amount < minimum {
		return nil, &BidTooLowError{Minimum: minimum}
	}

	newEndTime := endTime
	if time.Until(endTime) < softCloseWindow {
		newEndTime = endTime.Add(softCloseExtension)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE auksion.listings
		SET current_bid = $1, bid_count = bid_count + 1, end_time = $2, updated_at = now()
		WHERE id = $3
	`, amount, newEndTime, listingID); err != nil {
		return nil, err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO auksion.bids (listing_id, bidder_user_id, amount) VALUES ($1, $2, $3)
	`, listingID, bidderUserID, amount); err != nil {
		return nil, err
	}

	row := tx.QueryRow(ctx, `SELECT `+listingColumns+` FROM auksion.listings WHERE id = $1`, listingID)
	updated, err := scanListing(row)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return updated, nil
}
```

- [ ] **Step 2: Write the failing integration test**

```go
// avtopulse-backend/internal/auksion/repository_pg_test.go
package auksion

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/CavadJava/avtopulse-backend/internal/db"
	"github.com/CavadJava/avtopulse-backend/internal/user"
)

func TestRepository_CreateListingAndPlaceBid(t *testing.T) {
	dsn := os.Getenv("AVTOPULSE_TEST_DSN")
	if dsn == "" {
		t.Skip("AVTOPULSE_TEST_DSN not set, skipping integration test")
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer pool.Close()

	if err := db.RunMigrations(ctx, pool, "../../migrations"); err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}

	userRepo := user.NewRepository(pool)
	bidder, err := userRepo.FindOrCreateByPhone(ctx, "+994000000auksion1")
	if err != nil {
		t.Fatalf("FindOrCreateByPhone failed: %v", err)
	}

	repo := NewRepository(pool)

	listing, err := repo.CreateListing(ctx, NewListingInput{
		Make: "Tesla", Model: "Model 3", Year: 2022,
		Description: "Test listing", Images: []string{"https://example.com/1.jpg"},
		StartingBid: 15000, EndTime: time.Now().Add(1 * time.Hour),
	})
	if err != nil {
		t.Fatalf("CreateListing failed: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM auksion.bids WHERE listing_id = $1`, listing.ID)
	defer pool.Exec(ctx, `DELETE FROM auksion.listings WHERE id = $1`, listing.ID)

	if listing.MinNextBid != 15000 {
		t.Fatalf("expected MinNextBid=15000 for a fresh listing, got %v", listing.MinNextBid)
	}
	if listing.Status != "live" {
		t.Fatalf("expected status=live, got %v", listing.Status)
	}

	// First bid below starting_bid must be rejected with the minimum.
	_, err = repo.PlaceBid(ctx, listing.ID, bidder.ID, 14000)
	var tooLow *BidTooLowError
	if !errors.As(err, &tooLow) || tooLow.Minimum != 15000 {
		t.Fatalf("expected BidTooLowError{Minimum:15000}, got %v", err)
	}

	// A valid first bid at exactly starting_bid succeeds.
	updated, err := repo.PlaceBid(ctx, listing.ID, bidder.ID, 15000)
	if err != nil {
		t.Fatalf("PlaceBid failed: %v", err)
	}
	if updated.CurrentBid == nil || *updated.CurrentBid != 15000 {
		t.Fatalf("expected current_bid=15000, got %v", updated.CurrentBid)
	}
	if updated.BidCount != 1 {
		t.Fatalf("expected bid_count=1, got %d", updated.BidCount)
	}
	if updated.MinNextBid != 15100 {
		t.Fatalf("expected next MinNextBid=15100 (15000+100 increment), got %v", updated.MinNextBid)
	}

	// A second bid below current_bid+increment is rejected.
	_, err = repo.PlaceBid(ctx, listing.ID, bidder.ID, 15050)
	if !errors.As(err, &tooLow) || tooLow.Minimum != 15100 {
		t.Fatalf("expected BidTooLowError{Minimum:15100}, got %v", err)
	}

	bids, err := repo.ListBids(ctx, listing.ID, 20)
	if err != nil {
		t.Fatalf("ListBids failed: %v", err)
	}
	if len(bids) != 1 || bids[0].Amount != 15000 {
		t.Fatalf("expected 1 bid of 15000, got %+v", bids)
	}
}

func TestRepository_PlaceBid_SoftCloseExtendsEndTime(t *testing.T) {
	dsn := os.Getenv("AVTOPULSE_TEST_DSN")
	if dsn == "" {
		t.Skip("AVTOPULSE_TEST_DSN not set, skipping integration test")
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer pool.Close()
	if err := db.RunMigrations(ctx, pool, "../../migrations"); err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}

	userRepo := user.NewRepository(pool)
	bidder, err := userRepo.FindOrCreateByPhone(ctx, "+994000000auksion2")
	if err != nil {
		t.Fatalf("FindOrCreateByPhone failed: %v", err)
	}

	repo := NewRepository(pool)
	originalEnd := time.Now().Add(90 * time.Second) // inside the 2-minute soft-close window
	listing, err := repo.CreateListing(ctx, NewListingInput{
		Make: "Tesla", Model: "Model Y", Year: 2023, StartingBid: 20000, EndTime: originalEnd,
	})
	if err != nil {
		t.Fatalf("CreateListing failed: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM auksion.bids WHERE listing_id = $1`, listing.ID)
	defer pool.Exec(ctx, `DELETE FROM auksion.listings WHERE id = $1`, listing.ID)

	updated, err := repo.PlaceBid(ctx, listing.ID, bidder.ID, 20000)
	if err != nil {
		t.Fatalf("PlaceBid failed: %v", err)
	}
	if !updated.EndTime.After(originalEnd) {
		t.Fatalf("expected end_time to be extended past %v, got %v", originalEnd, updated.EndTime)
	}
}

func TestRepository_PlaceBid_RejectsAfterEndTime(t *testing.T) {
	dsn := os.Getenv("AVTOPULSE_TEST_DSN")
	if dsn == "" {
		t.Skip("AVTOPULSE_TEST_DSN not set, skipping integration test")
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer pool.Close()
	if err := db.RunMigrations(ctx, pool, "../../migrations"); err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}

	userRepo := user.NewRepository(pool)
	bidder, err := userRepo.FindOrCreateByPhone(ctx, "+994000000auksion3")
	if err != nil {
		t.Fatalf("FindOrCreateByPhone failed: %v", err)
	}

	repo := NewRepository(pool)
	listing, err := repo.CreateListing(ctx, NewListingInput{
		Make: "Tesla", Model: "Model S", Year: 2021, StartingBid: 30000,
		EndTime: time.Now().Add(-1 * time.Minute), // already ended
	})
	if err != nil {
		t.Fatalf("CreateListing failed: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM auksion.bids WHERE listing_id = $1`, listing.ID)
	defer pool.Exec(ctx, `DELETE FROM auksion.listings WHERE id = $1`, listing.ID)

	_, err = repo.PlaceBid(ctx, listing.ID, bidder.ID, 30000)
	if !errors.Is(err, ErrAuctionEnded) {
		t.Fatalf("expected ErrAuctionEnded, got %v", err)
	}

	fetched, err := repo.GetByID(ctx, listing.ID)
	if err != nil {
		t.Fatalf("GetByID failed: %v", err)
	}
	if fetched.Status != "ended" {
		t.Fatalf("expected computed status=ended, got %v", fetched.Status)
	}
}
```

- [ ] **Step 3: Run the tests to verify they fail (or are skipped)**

Run: `cd avtopulse-backend && AVTOPULSE_TEST_DSN="postgres://localhost:5432/avtopulse_test?sslmode=disable" go test ./internal/auksion/... -run TestRepository -p 1 -v`

A local `avtopulse_test` database already exists on this machine (confirmed via `psql -lqt`) — no need to create one. If it's ever missing, create it with `createdb avtopulse_test`. Expected before the fix/first run: compiles and runs; if it fails, the failure output tells you which assertion is wrong.

- [ ] **Step 4: Run the tests to verify they pass**

Run: same command as Step 3.
Expected: `PASS` for all three tests. Note `-p 1` — required because Postgres integration tests across this repo's packages share one DB and must not run in parallel (documented gotcha in the auto-parts sibling project).

- [ ] **Step 5: Commit**

```bash
git add avtopulse-backend/internal/auksion/repository.go avtopulse-backend/internal/auksion/repository_pg_test.go
git commit -m "feat(auksion): add Postgres repository with transactional bid placement"
```

---

### Task 3: Auksion HTTP handler

**Files:**
- Create: `avtopulse-backend/internal/auksion/handler.go`
- Test: `avtopulse-backend/internal/auksion/handler_test.go`

**Interfaces:**
- Consumes: `Repository` (Task 2), `Listing`/`Bid`/`ErrNotFound`/`ErrAuctionEnded`/`*BidTooLowError` (Task 1).
- Produces: `AuthFunc` type, `NewHandler(repo Repository, authFunc AuthFunc, requireAdmin func(http.HandlerFunc) http.HandlerFunc) http.Handler`, consumed by Task 4 (main.go wiring).

- [ ] **Step 1: Write the handler**

```go
// avtopulse-backend/internal/auksion/handler.go
package auksion

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

// AuthFunc extracts the authenticated user ID from a request (via the
// user_session cookie) — same shape as internal/parts's AuthFunc, so this
// package doesn't need to import internal/user or internal/auth directly.
type AuthFunc func(req *http.Request) (int64, error)

type auksionHandlers struct {
	repo         Repository
	authFunc     AuthFunc
}

func NewHandler(repo Repository, authFunc AuthFunc, requireAdmin func(http.HandlerFunc) http.HandlerFunc) http.Handler {
	h := &auksionHandlers{repo: repo, authFunc: authFunc}
	r := chi.NewRouter()

	r.Get("/listings", h.ListListings)
	r.Get("/listings/{id}", h.GetListing)
	r.Post("/listings/{id}/bids", h.PlaceBid)
	r.Post("/admin/listings", requireAdmin(h.CreateListing))

	return r
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func (h *auksionHandlers) ListListings(w http.ResponseWriter, req *http.Request) {
	listings, err := h.repo.ListLive(req.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, listings)
}

func (h *auksionHandlers) GetListing(w http.ResponseWriter, req *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid listing id", http.StatusBadRequest)
		return
	}

	listing, err := h.repo.GetByID(req.Context(), id)
	if errors.Is(err, ErrNotFound) {
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	bids, err := h.repo.ListBids(req.Context(), id, 20)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"listing": listing,
		"bids":    bids,
	})
}

type placeBidRequest struct {
	Amount float64 `json:"amount"`
}

func (h *auksionHandlers) PlaceBid(w http.ResponseWriter, req *http.Request) {
	userID, err := h.authFunc(req)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid listing id", http.StatusBadRequest)
		return
	}

	var body placeBidRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	listing, err := h.repo.PlaceBid(req.Context(), id, userID, body.Amount)
	if errors.Is(err, ErrNotFound) {
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}
	if errors.Is(err, ErrAuctionEnded) {
		writeJSON(w, http.StatusConflict, map[string]any{"error": "auction_ended"})
		return
	}
	var tooLow *BidTooLowError
	if errors.As(err, &tooLow) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "bid_too_low", "minimum": tooLow.Minimum})
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, listing)
}

type createListingRequest struct {
	Make        string   `json:"make"`
	Model       string   `json:"model"`
	Year        int      `json:"year"`
	Description string   `json:"description"`
	Images      []string `json:"images"`
	StartingBid float64  `json:"startingBid"`
	EndTime     string   `json:"endTime"` // RFC3339
}

func (h *auksionHandlers) CreateListing(w http.ResponseWriter, req *http.Request) {
	var body createListingRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Make == "" || body.Model == "" || body.StartingBid <= 0 {
		http.Error(w, "make, model and a positive startingBid are required", http.StatusBadRequest)
		return
	}
	endTime, err := parseRFC3339(body.EndTime)
	if err != nil {
		http.Error(w, "endTime must be RFC3339", http.StatusBadRequest)
		return
	}

	listing, err := h.repo.CreateListing(req.Context(), NewListingInput{
		Make: body.Make, Model: body.Model, Year: body.Year, Description: body.Description,
		Images: body.Images, StartingBid: body.StartingBid, EndTime: endTime,
	})
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, listing)
}
```

Add the small RFC3339 helper at the bottom of the same file (`"time"` is already in the top import block above):

```go
func parseRFC3339(s string) (time.Time, error) {
	return time.Parse(time.RFC3339, s)
}
```

- [ ] **Step 2: Write the failing handler tests**

```go
// avtopulse-backend/internal/auksion/handler_test.go
package auksion

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fakeRepo struct {
	listings   []Listing
	byID       map[int64]*Listing
	bids       []Bid
	placeBidFn func(ctx context.Context, listingID, bidderUserID int64, amount float64) (*Listing, error)
	created    *Listing
}

func (f *fakeRepo) ListLive(ctx context.Context) ([]Listing, error) { return f.listings, nil }
func (f *fakeRepo) GetByID(ctx context.Context, id int64) (*Listing, error) {
	l, ok := f.byID[id]
	if !ok {
		return nil, ErrNotFound
	}
	return l, nil
}
func (f *fakeRepo) ListBids(ctx context.Context, listingID int64, limit int) ([]Bid, error) {
	return f.bids, nil
}
func (f *fakeRepo) PlaceBid(ctx context.Context, listingID, bidderUserID int64, amount float64) (*Listing, error) {
	return f.placeBidFn(ctx, listingID, bidderUserID, amount)
}
func (f *fakeRepo) CreateListing(ctx context.Context, input NewListingInput) (*Listing, error) {
	l := &Listing{ID: 1, Make: input.Make, Model: input.Model, StartingBid: input.StartingBid, MinNextBid: input.StartingBid, Status: "live"}
	f.created = l
	return l, nil
}

func alwaysAuthorized(req *http.Request) (int64, error)   { return 42, nil }
func alwaysUnauthorized(req *http.Request) (int64, error) { return 0, errors.New("unauthorized") }
func alwaysAdmin(next http.HandlerFunc) http.HandlerFunc  { return next }

func TestHandler_ListListings(t *testing.T) {
	repo := &fakeRepo{listings: []Listing{{ID: 1, Make: "Tesla", Model: "Model 3", Status: "live"}}}
	h := NewHandler(repo, alwaysAuthorized, alwaysAdmin)

	req := httptest.NewRequest(http.MethodGet, "/listings", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got []Listing
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("bad JSON response: %v", err)
	}
	if len(got) != 1 || got[0].Make != "Tesla" {
		t.Fatalf("unexpected listings: %+v", got)
	}
}

func TestHandler_GetListing_NotFound(t *testing.T) {
	repo := &fakeRepo{byID: map[int64]*Listing{}}
	h := NewHandler(repo, alwaysAuthorized, alwaysAdmin)

	req := httptest.NewRequest(http.MethodGet, "/listings/999", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestHandler_PlaceBid_RequiresAuth(t *testing.T) {
	repo := &fakeRepo{}
	h := NewHandler(repo, alwaysUnauthorized, alwaysAdmin)

	req := httptest.NewRequest(http.MethodPost, "/listings/1/bids", strings.NewReader(`{"amount":100}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestHandler_PlaceBid_TooLow(t *testing.T) {
	repo := &fakeRepo{
		placeBidFn: func(ctx context.Context, listingID, bidderUserID int64, amount float64) (*Listing, error) {
			return nil, &BidTooLowError{Minimum: 15100}
		},
	}
	h := NewHandler(repo, alwaysAuthorized, alwaysAdmin)

	req := httptest.NewRequest(http.MethodPost, "/listings/1/bids", strings.NewReader(`{"amount":15000}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
	var body map[string]any
	json.Unmarshal(rec.Body.Bytes(), &body)
	if body["minimum"] != 15100.0 {
		t.Fatalf("expected minimum=15100, got %+v", body)
	}
}

func TestHandler_PlaceBid_AuctionEnded(t *testing.T) {
	repo := &fakeRepo{
		placeBidFn: func(ctx context.Context, listingID, bidderUserID int64, amount float64) (*Listing, error) {
			return nil, ErrAuctionEnded
		},
	}
	h := NewHandler(repo, alwaysAuthorized, alwaysAdmin)

	req := httptest.NewRequest(http.MethodPost, "/listings/1/bids", strings.NewReader(`{"amount":15000}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", rec.Code)
	}
}

func TestHandler_PlaceBid_Success(t *testing.T) {
	bid := 15000.0
	repo := &fakeRepo{
		placeBidFn: func(ctx context.Context, listingID, bidderUserID int64, amount float64) (*Listing, error) {
			return &Listing{ID: listingID, CurrentBid: &bid, BidCount: 1, MinNextBid: 15100, Status: "live"}, nil
		},
	}
	h := NewHandler(repo, alwaysAuthorized, alwaysAdmin)

	req := httptest.NewRequest(http.MethodPost, "/listings/1/bids", strings.NewReader(`{"amount":15000}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestHandler_CreateListing_RequiresAdmin(t *testing.T) {
	repo := &fakeRepo{}
	rejectAdmin := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
		}
	}
	h := NewHandler(repo, alwaysAuthorized, rejectAdmin)

	req := httptest.NewRequest(http.MethodPost, "/admin/listings", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestHandler_CreateListing_Success(t *testing.T) {
	repo := &fakeRepo{}
	h := NewHandler(repo, alwaysAuthorized, alwaysAdmin)

	body := `{"make":"Tesla","model":"Model 3","year":2022,"startingBid":15000,"endTime":"` +
		time.Now().Add(1*time.Hour).Format(time.RFC3339) + `"}`
	req := httptest.NewRequest(http.MethodPost, "/admin/listings", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if repo.created == nil || repo.created.Make != "Tesla" {
		t.Fatalf("expected CreateListing to be called with make=Tesla, got %+v", repo.created)
	}
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd avtopulse-backend && go test ./internal/auksion/... -run TestHandler -v`
Expected: FAIL to compile until `handler.go` from Step 1 exists — write Step 1 and Step 2 together, then run.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd avtopulse-backend && go test ./internal/auksion/... -v`
Expected: all `TestHandler_*` tests `PASS`, plus the Task 1/2 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add avtopulse-backend/internal/auksion/handler.go avtopulse-backend/internal/auksion/handler_test.go
git commit -m "feat(auksion): add HTTP handler for listings/bids/admin listing creation"
```

---

### Task 4: Wire auksion into main.go

**Files:**
- Modify: `avtopulse-backend/cmd/server/main.go`

**Interfaces:**
- Consumes: `auksion.NewRepository`, `auksion.NewHandler` (Task 2, 3); existing `userSessions` (`user.SessionStore`, already constructed at `main.go:60`) and `adminHandlerHooks.RequireAdminMiddleware()` (already constructed at `main.go:232`).

- [ ] **Step 1: Add the import**

In `avtopulse-backend/cmd/server/main.go`, add to the import block (alphabetically, after `"github.com/CavadJava/avtopulse-backend/internal/adminnotify"` and before `"github.com/CavadJava/avtopulse-backend/internal/auth"`):

```go
	"github.com/CavadJava/avtopulse-backend/internal/auksion"
```

- [ ] **Step 2: Mount the route**

Insert this block right after the existing admin routes block ends (after the `r.Post("/api/admin/shop-products/{id}/cancel", ...)` block, i.e. right before the `adminNotifyRepo := adminnotify.NewRepository(pool)` line at `main.go:255`):

```go
	auksionRepo := auksion.NewRepository(pool)
	auksionAuthFunc := func(req *http.Request) (int64, error) {
		cookie, err := req.Cookie("user_session")
		if err != nil {
			return 0, err
		}
		return userSessions.Lookup(req.Context(), cookie.Value)
	}
	r.Mount("/api/auksion", auksion.NewHandler(auksionRepo, auksionAuthFunc, adminHandlerHooks.RequireAdminMiddleware()))
```

- [ ] **Step 3: Build**

Run: `cd avtopulse-backend && go build ./...`
Expected: builds with no errors.

- [ ] **Step 4: Run the full backend test suite**

Run: `cd avtopulse-backend && go test ./... -p 1`
Expected: all packages `PASS` (integration tests will `SKIP` if `AVTOPULSE_TEST_DSN` isn't set in this shell — that's fine, but run with it set at least once locally to actually exercise Task 2's tests).

- [ ] **Step 5: Manual smoke test**

A local MinIO instance is already running on this machine (`http://127.0.0.1:9000`, started before this plan's execution began — verify with `curl -s http://127.0.0.1:9000/minio/health/live`, expect `200`; if it's down, restart it with `MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin minio server ~/minio-data/avtopulse-local --address :9000 --console-address :9091 &`). A local Postgres dev database `avtopulse` already exists too. Start the backend with these confirmed-working local dev values:

```bash
cd avtopulse-backend
export AVTOPULSE_DSN="postgres://localhost:5432/avtopulse?sslmode=disable"
export AVTOPULSE_PORT=8090
export AVTOPULSE_MINIO_ENDPOINT=127.0.0.1:9000
export AVTOPULSE_MINIO_ACCESS_KEY=minioadmin
export AVTOPULSE_MINIO_SECRET_KEY=minioadmin
export AVTOPULSE_MINIO_BUCKET=avtopulse-local
export AVTOPULSE_MINIO_PUBLIC_URL=http://127.0.0.1:9000/avtopulse-local
export ADMIN_USERNAME=localadmin
export ADMIN_PASSWORD=localdevpass123
nohup go run ./cmd/server > /tmp/avtopulse-backend-smoketest.log 2>&1 &
disown
sleep 3
curl -s -o /dev/null -w "healthz: %{http_code}\n" http://localhost:8090/healthz
```

Expected: `healthz: 200`. If not, check `/tmp/avtopulse-backend-smoketest.log`.

```bash
# Log in as admin, create a listing, confirm it shows up live.
curl -s -c /tmp/admin.jar -X POST http://localhost:8090/api/admin/login \
  -H 'Content-Type: application/json' -d '{"username":"localadmin","password":"localdevpass123"}'
curl -s -b /tmp/admin.jar -X POST http://localhost:8090/api/auksion/admin/listings \
  -H 'Content-Type: application/json' \
  -d '{"make":"Tesla","model":"Model 3","year":2022,"startingBid":15000,"endTime":"2099-01-01T00:00:00Z"}'
curl -s http://localhost:8090/api/auksion/listings
```

Then stop the server (`go run` spawns a separate compiled-binary child process, so killing by matching the `go run` command line does not work — find the real PID by the port it's listening on instead):

```bash
kill -9 $(lsof -ti:8090)
```

MinIO stays running for later tasks — do not stop it.

Expected: the last call returns a JSON array containing the listing just created, with `"minNextBid":15000` and `"status":"live"`.

- [ ] **Step 6: Commit**

```bash
git add avtopulse-backend/cmd/server/main.go
git commit -m "feat(auksion): mount /api/auksion routes on the existing avtopulse-backend"
```

---

### Task 5: Scaffold the `auksion/` frontend app

**Files:**
- Create: `auksion/package.json`, `auksion/tsconfig.json`, `auksion/tsconfig.app.json`, `auksion/tsconfig.node.json`, `auksion/vite.config.ts`, `auksion/vitest.config.ts`, `auksion/index.html`, `auksion/.env.local.example`, `auksion/src/main.tsx`, `auksion/src/App.tsx`, `auksion/src/styles/globals.css`, `auksion/src/test/setup.ts`, `auksion/public/favicon.svg`
- Move: `carsandbids/*.html` → `auksion/reference/*.html`

**Interfaces:**
- Produces: a buildable, testable Vite app skeleton at `auksion/` that all later frontend tasks add files into.

- [ ] **Step 1: Move the reference HTML files**

```bash
mkdir -p auksion/reference
git mv "carsandbids/2013 Ferrari 458 Spider VIN： ZFF68NHA1D0191058 for Sale - Cars & Bids (9_2_2026 11：49：19 AM).html" auksion/reference/ 2>/dev/null || true
git mv carsandbids/*.html auksion/reference/
rmdir carsandbids 2>/dev/null || true
```

(If `git mv` complains about the untracked files, use `mv carsandbids/*.html auksion/reference/ && git add auksion/reference/` instead — the files were untracked per `git status`, so a plain `mv` + `git add` works just as well.)

- [ ] **Step 2: package.json**

```json
{
  "name": "auksion",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "react-router-dom": "^7.18.2"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.6",
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.4",
    "jsdom": "^29.1.1",
    "oxlint": "^1.75.0",
    "typescript": "~6.0.2",
    "vite": "^8.2.0",
    "vitest": "^4.1.11"
  }
}
```

- [ ] **Step 3: tsconfig files, vite/vitest config**

`auksion/tsconfig.json` — copy verbatim from the root `tsconfig.json`.
`auksion/tsconfig.app.json` — copy verbatim from the root `tsconfig.app.json`.
`auksion/tsconfig.node.json` — copy verbatim from the root `tsconfig.node.json`.

```ts
// auksion/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

```ts
// auksion/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '.worktrees/**'],
  },
});
```

- [ ] **Step 4: index.html, .env.local.example, favicon**

```html
<!-- auksion/index.html -->
<!doctype html>
<html lang="az">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
    <title>AutoPulse Auksion — Canlı Avtomobil Hərracları</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```bash
# auksion/.env.local.example
echo '# Base URL for the avtopulse-backend Go service (same backend the root
# autopulse frontend uses). Leave empty in production if /api is proxied
# through the same origin.
VITE_AUKSION_API_BASE=http://localhost:8090' > auksion/.env.local.example
```

```bash
mkdir -p auksion/public
cp public/favicon.svg auksion/public/favicon.svg
```

- [ ] **Step 5: main.tsx, App.tsx skeleton, globals.css, test setup**

```tsx
// auksion/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

```tsx
// auksion/src/App.tsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function Home() {
  return <h1>AutoPulse Auksion</h1>;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </Router>
  );
}
```

`auksion/src/styles/globals.css` — copy verbatim from the root `src/styles/globals.css` (same design-token family, keeps AutoPulse Auksion visually part of the AutoPulse brand family).

`auksion/src/test/setup.ts` — copy verbatim from the root `src/test/setup.ts`.

- [ ] **Step 6: Write a smoke test**

```tsx
// auksion/src/App.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the AutoPulse Auksion heading on the home route', () => {
    render(<App />);
    expect(screen.getByText('AutoPulse Auksion')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Install and verify**

Run:
```bash
cd auksion && npm install && npm test && npm run build
```
Expected: `npm install` succeeds, `npm test` shows the one `App` test passing, `npm run build` produces `auksion/dist/` with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add auksion/
git commit -m "feat(auksion): scaffold new Vite/React app, move carsandbids/ HTML to auksion/reference/"
```

---

### Task 6: Auksion API client

**Files:**
- Create: `auksion/src/api/auksion.ts`
- Test: `auksion/src/api/auksion.test.ts`

**Interfaces:**
- Produces: `Listing`, `Bid` types, `getLiveListings()`, `getListing(id)`, `placeBid(id, amount)`, `AuksionUnauthorizedError`, `BidTooLowError`, `AuctionEndedError` — consumed by Task 9 (Home/AuctionCard) and Task 10/11 (BidBox/ListingDetail).

- [ ] **Step 1: Write the API client**

```ts
// auksion/src/api/auksion.ts
const API_BASE = import.meta.env.VITE_AUKSION_API_BASE ?? '';

export interface Listing {
  id: number;
  make: string;
  model: string;
  year: number;
  description: string;
  images: string[];
  startingBid: number;
  currentBid?: number;
  bidCount: number;
  minNextBid: number;
  endTime: string;
  status: 'live' | 'ended';
  createdAt: string;
}

export interface Bid {
  id: number;
  listingId: number;
  bidderUserId: number;
  amount: number;
  createdAt: string;
}

export interface ListingDetail {
  listing: Listing;
  bids: Bid[];
}

export class AuksionUnauthorizedError extends Error {}
export class BidTooLowError extends Error {
  minimum: number;
  constructor(minimum: number) {
    super('Bid too low');
    this.minimum = minimum;
  }
}
export class AuctionEndedError extends Error {}

export async function getLiveListings(): Promise<Listing[]> {
  const res = await fetch(`${API_BASE}/api/auksion/listings`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`getLiveListings failed: ${res.status}`);
  }
  // Same nil-slice-as-null gotcha as the root app's parts/listings clients.
  const data = await res.json();
  return data ?? [];
}

export async function getListing(id: number): Promise<ListingDetail> {
  const res = await fetch(`${API_BASE}/api/auksion/listings/${id}`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`getListing failed: ${res.status}`);
  }
  const data = await res.json();
  return { listing: data.listing, bids: data.bids ?? [] };
}

export async function placeBid(id: number, amount: number): Promise<Listing> {
  const res = await fetch(`${API_BASE}/api/auksion/listings/${id}/bids`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  if (res.status === 401) {
    throw new AuksionUnauthorizedError('Not logged in');
  }
  if (res.status === 409) {
    throw new AuctionEndedError('Auction has ended');
  }
  if (res.status === 400) {
    const body = await res.json();
    throw new BidTooLowError(body.minimum);
  }
  if (!res.ok) {
    throw new Error(`placeBid failed: ${res.status}`);
  }
  return res.json();
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// auksion/src/api/auksion.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLiveListings, getListing, placeBid, AuksionUnauthorizedError, BidTooLowError, AuctionEndedError } from './auksion';

describe('auksion api client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('getLiveListings calls GET /api/auksion/listings and normalizes null to []', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => null });

    const result = await getLiveListings();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auksion/listings'),
      expect.objectContaining({ credentials: 'include' })
    );
    expect(result).toEqual([]);
  });

  it('getListing normalizes a null bids field to []', async () => {
    const listing = { id: 1, make: 'Tesla', model: 'Model 3' };
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ listing, bids: null }) });

    const result = await getListing(1);

    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auksion/listings/1'), expect.any(Object));
    expect(result).toEqual({ listing, bids: [] });
  });

  it('placeBid posts the amount and returns the updated listing on success', async () => {
    const updated = { id: 1, currentBid: 15000 };
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => updated });

    const result = await placeBid(1, 15000);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auksion/listings/1/bids'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ amount: 15000 }) })
    );
    expect(result).toEqual(updated);
  });

  it('placeBid throws AuksionUnauthorizedError on 401', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 401 });
    await expect(placeBid(1, 15000)).rejects.toBeInstanceOf(AuksionUnauthorizedError);
  });

  it('placeBid throws BidTooLowError with the minimum on 400', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 400, json: async () => ({ minimum: 15100 }) });
    const err = await placeBid(1, 15000).catch((e) => e);
    expect(err).toBeInstanceOf(BidTooLowError);
    expect(err.minimum).toBe(15100);
  });

  it('placeBid throws AuctionEndedError on 409', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 409 });
    await expect(placeBid(1, 15000)).rejects.toBeInstanceOf(AuctionEndedError);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd auksion && npm test -- src/api/auksion.test.ts`
Expected: FAIL until Step 1's file exists; once both files exist together this should already pass — if not, the failure output shows which assertion is off.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd auksion && npm test -- src/api/auksion.test.ts`
Expected: all 6 tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add auksion/src/api/auksion.ts auksion/src/api/auksion.test.ts
git commit -m "feat(auksion): add API client for listings/bids"
```

---

### Task 7: Auth (OTP login reusing the shared backend)

**Files:**
- Create: `auksion/src/api/auth.ts`, `auksion/src/context/AuthContext.tsx`, `auksion/src/pages/Login.tsx`, `auksion/src/pages/Login.module.css`, `auksion/src/pages/LoginVerify.tsx`, `auksion/src/pages/LoginVerify.module.css`
- Test: `auksion/src/api/auth.test.ts`

**Interfaces:**
- Produces: `AuksionUser` type, `requestOtp(phone)`, `verifyOtp(phone, code)`, `UserOtpError`; `AuthProvider`/`useAuth()`; `<Login>`/`<LoginVerify>` pages — consumed by Task 11 (App.tsx routes, Header).

- [ ] **Step 1: Write the auth API client**

```ts
// auksion/src/api/auth.ts
const API_BASE = import.meta.env.VITE_AUKSION_API_BASE ?? '';

export interface AuksionUser {
  id: number;
  name: string;
  phone: string;
}

export class UserOtpError extends Error {}

export async function requestOtp(phone: string): Promise<{ sent: boolean }> {
  const res = await fetch(`${API_BASE}/api/users/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    throw new Error(`requestOtp failed: ${res.status}`);
  }
  return res.json();
}

export async function verifyOtp(phone: string, code: string): Promise<AuksionUser> {
  const res = await fetch(`${API_BASE}/api/users/otp/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  if (res.status === 401) {
    throw new UserOtpError('Kod yanlışdır');
  }
  if (!res.ok) {
    throw new Error(`verifyOtp failed: ${res.status}`);
  }
  const data = await res.json();
  return data.user as AuksionUser;
}
```

- [ ] **Step 2: Write the failing auth API test**

```ts
// auksion/src/api/auth.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestOtp, verifyOtp, UserOtpError } from './auth';

describe('auksion auth api client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('requestOtp posts the phone number', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ sent: true }) });

    const result = await requestOtp('+994501234567');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/otp/request'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ phone: '+994501234567' }) })
    );
    expect(result).toEqual({ sent: true });
  });

  it('verifyOtp returns the user on success', async () => {
    const user = { id: 1, name: '', phone: '+994501234567' };
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ user }) });

    const result = await verifyOtp('+994501234567', '1234');

    expect(result).toEqual(user);
  });

  it('verifyOtp throws UserOtpError on 401', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 401 });
    await expect(verifyOtp('+994501234567', '0000')).rejects.toBeInstanceOf(UserOtpError);
  });
});
```

- [ ] **Step 3: Run test, verify fail then pass**

Run: `cd auksion && npm test -- src/api/auth.test.ts`
Expected: FAIL until Step 1 exists, then `PASS` for all 3 tests.

- [ ] **Step 4: Write AuthContext**

```tsx
// auksion/src/context/AuthContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuksionUser } from '../api/auth';

const STORAGE_KEY = 'auksion.user';

interface AuthContextValue {
  user: AuksionUser | null;
  login: (user: AuksionUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuksionUser | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const login = (nextUser: AuksionUser) => {
    setUser(nextUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
```

- [ ] **Step 5: Write Login and LoginVerify pages**

```tsx
// auksion/src/pages/Login.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestOtp } from '../api/auth';
import styles from './Login.module.css';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!phone.trim()) {
      setError('Telefon nömrəsini daxil edin.');
      return;
    }
    setLoading(true);
    try {
      await requestOtp(phone);
      navigate('/giris/kod', { state: { phone } });
    } catch {
      setError('SMS-kod göndərilə bilmədi. Yenidən cəhd edin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>AutoPulse Auksion — Giriş</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>Telefon nömrəsi</label>
          <input
            type="tel"
            placeholder="(010) 234-40-71"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={styles.input}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'Göndərilir...' : 'SMS-kod göndərilsin'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

```css
/* auksion/src/pages/Login.module.css */
.page {
  min-height: calc(100vh - 64px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  padding: var(--space-6);
}

.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-8);
  width: 100%;
  max-width: 400px;
  color: var(--text-primary);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.input {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  color: var(--text-primary);
  font-size: 1rem;
}

.error {
  color: var(--error);
  font-size: 0.875rem;
}

.submitBtn {
  background: var(--accent);
  color: var(--bg-primary);
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  font-weight: 600;
  cursor: pointer;
}

.submitBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

```tsx
// auksion/src/pages/LoginVerify.tsx
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { requestOtp, verifyOtp, UserOtpError } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import styles from './Login.module.css';
import verifyStyles from './LoginVerify.module.css';

export default function LoginVerify() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const phone = (location.state as { phone?: string } | null)?.phone;

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  if (!phone) {
    navigate('/giris');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await verifyOtp(phone, code);
      login(user);
      navigate('/');
    } catch (err) {
      setError(err instanceof UserOtpError ? err.message : 'Kod yanlışdır.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResent(true);
    setError(null);
    await requestOtp(phone);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={verifyStyles.header}>
          <button className={verifyStyles.back} onClick={() => navigate('/giris')}>
            ‹
          </button>
          <h1>Nömrənin təsdiqlənməsi</h1>
        </div>
        <p className={verifyStyles.hint}>{phone} nömrəsinə SMS-kod göndərildi</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>SMS-kod</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="1234"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className={styles.input}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'Yoxlanılır...' : 'Təsdiqlə'}
          </button>
        </form>
        <button className={verifyStyles.resend} onClick={handleResend}>
          {resent ? 'Kod yenidən göndərildi ✓' : 'SMS-kod yenidən göndərilsin'}
        </button>
      </div>
    </div>
  );
}
```

```css
/* auksion/src/pages/LoginVerify.module.css */
.header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.back {
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 1.5rem;
  cursor: pointer;
}

.hint {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin: var(--space-2) 0 0;
}

.resend {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 0.875rem;
  margin-top: var(--space-4);
  cursor: pointer;
}
```

- [ ] **Step 6: Verify the full test suite still passes and build succeeds**

Run: `cd auksion && npm test && npm run build`
Expected: all tests `PASS` (auth API tests from Step 3 plus the Task 5/6 tests), build succeeds. (`Login`/`LoginVerify` aren't wired into `App.tsx` yet — that's Task 11 — so there's no new component test here beyond the API client; TypeScript will still typecheck these files during `npm run build`.)

- [ ] **Step 7: Commit**

```bash
git add auksion/src/api/auth.ts auksion/src/api/auth.test.ts auksion/src/context/AuthContext.tsx auksion/src/pages/Login.tsx auksion/src/pages/Login.module.css auksion/src/pages/LoginVerify.tsx auksion/src/pages/LoginVerify.module.css
git commit -m "feat(auksion): OTP login reusing the shared avtopulse-backend user auth"
```

---

### Task 8: CountdownTimer component

**Files:**
- Create: `auksion/src/components/CountdownTimer.tsx`, `auksion/src/components/CountdownTimer.module.css`
- Test: `auksion/src/components/CountdownTimer.test.tsx`

**Interfaces:**
- Produces: `<CountdownTimer endTime={string} onEnd?={() => void} />` — consumed by Task 9 (AuctionCard) and Task 10 (BidBox/ListingDetail).

- [ ] **Step 1: Write the failing test**

```tsx
// auksion/src/components/CountdownTimer.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import CountdownTimer from './CountdownTimer';

describe('CountdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders hours/minutes/seconds remaining', () => {
    render(<CountdownTimer endTime="2026-01-01T01:02:03Z" />);
    expect(screen.getByText('01:02:03')).toBeInTheDocument();
  });

  it('ticks down every second', () => {
    render(<CountdownTimer endTime="2026-01-01T00:00:05Z" />);
    expect(screen.getByText('00:00:05')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('00:00:04')).toBeInTheDocument();
  });

  it('shows Bitdi and calls onEnd once the time is up', () => {
    const onEnd = vi.fn();
    render(<CountdownTimer endTime="2026-01-01T00:00:01Z" onEnd={onEnd} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText('Bitdi')).toBeInTheDocument();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd auksion && npm test -- src/components/CountdownTimer.test.tsx`
Expected: FAIL — `Cannot find module './CountdownTimer'`.

- [ ] **Step 3: Write the component**

```tsx
// auksion/src/components/CountdownTimer.tsx
import { useEffect, useRef, useState } from 'react';
import styles from './CountdownTimer.module.css';

function format(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function CountdownTimer({ endTime, onEnd }: { endTime: string; onEnd?: () => void }) {
  const end = new Date(endTime).getTime();
  const [remaining, setRemaining] = useState(() => end - Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const interval = setInterval(() => {
      const next = end - Date.now();
      setRemaining(next);
      if (next <= 0 && !firedRef.current) {
        firedRef.current = true;
        onEnd?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [end, onEnd]);

  if (remaining <= 0) {
    return <span className={styles.ended}>Bitdi</span>;
  }

  return <span className={styles.timer}>{format(remaining)}</span>;
}
```

```css
/* auksion/src/components/CountdownTimer.module.css */
.timer {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--accent-solidish);
}

.ended {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text-tertiary);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd auksion && npm test -- src/components/CountdownTimer.test.tsx`
Expected: all 3 tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add auksion/src/components/CountdownTimer.tsx auksion/src/components/CountdownTimer.module.css auksion/src/components/CountdownTimer.test.tsx
git commit -m "feat(auksion): add CountdownTimer component"
```

---

### Task 9: AuctionCard + Home page

**Files:**
- Create: `auksion/src/components/AuctionCard.tsx`, `auksion/src/components/AuctionCard.module.css`, `auksion/src/pages/Home.tsx`, `auksion/src/pages/Home.module.css`
- Test: `auksion/src/components/AuctionCard.test.tsx`, `auksion/src/pages/Home.test.tsx`

**Interfaces:**
- Consumes: `Listing` type + `getLiveListings()` (Task 6), `<CountdownTimer>` (Task 8).
- Produces: `<AuctionCard listing={Listing} />`, `<Home>` — consumed by Task 11 (App.tsx routes).

- [ ] **Step 1: Write the failing AuctionCard test**

```tsx
// auksion/src/components/AuctionCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuctionCard from './AuctionCard';
import type { Listing } from '../api/auksion';

const listing: Listing = {
  id: 1, make: 'Tesla', model: 'Model 3', year: 2022, description: '', images: ['https://example.com/1.jpg'],
  startingBid: 15000, currentBid: 15500, bidCount: 2, minNextBid: 15600,
  endTime: new Date(Date.now() + 3600_000).toISOString(), status: 'live', createdAt: new Date().toISOString(),
};

describe('AuctionCard', () => {
  it('shows make/model/year, current bid and a link to the detail page', () => {
    render(
      <MemoryRouter>
        <AuctionCard listing={listing} />
      </MemoryRouter>
    );

    expect(screen.getByText('Tesla Model 3')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
    expect(screen.getByText('15 500 ₼')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/elan/1');
  });

  it('falls back to the starting bid label when no bid has been placed yet', () => {
    render(
      <MemoryRouter>
        <AuctionCard listing={{ ...listing, currentBid: undefined, bidCount: 0 }} />
      </MemoryRouter>
    );

    expect(screen.getByText('15 000 ₼')).toBeInTheDocument();
    expect(screen.getByText('Başlanğıc qiymət')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd auksion && npm test -- src/components/AuctionCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write AuctionCard**

```tsx
// auksion/src/components/AuctionCard.tsx
import { Link } from 'react-router-dom';
import type { Listing } from '../api/auksion';
import CountdownTimer from './CountdownTimer';
import styles from './AuctionCard.module.css';

export default function AuctionCard({ listing }: { listing: Listing }) {
  const price = listing.currentBid ?? listing.startingBid;

  return (
    <Link to={`/elan/${listing.id}`} className={styles.card}>
      <div className={styles.imageContainer}>
        {listing.images[0] && <img src={listing.images[0]} alt={`${listing.make} ${listing.model}`} />}
        <div className={styles.countdownBadge}>
          <CountdownTimer endTime={listing.endTime} />
        </div>
      </div>
      <div className={styles.content}>
        <h3>
          {listing.make} {listing.model}
        </h3>
        <p className={styles.meta}>{listing.year}</p>
        <div className={styles.footer}>
          <div className={styles.price}>{price.toLocaleString('az-AZ')} ₼</div>
          <div className={styles.priceLabel}>
            {listing.currentBid ? `${listing.bidCount} təklif` : 'Başlanğıc qiymət'}
          </div>
        </div>
      </div>
    </Link>
  );
}
```

```css
/* auksion/src/components/AuctionCard.module.css */
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
  text-decoration: none;
  color: var(--text-primary);
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.card:hover {
  border-color: var(--border-strong);
  transform: translateY(-3px);
}

.imageContainer {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  background: var(--bg-elevated);
}

.imageContainer img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.countdownBadge {
  position: absolute;
  bottom: var(--space-2);
  right: var(--space-2);
  background: var(--scrim);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}

.content {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.meta {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.footer {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: var(--space-2);
}

.price {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
}

.priceLabel {
  color: var(--text-tertiary);
  font-size: 0.75rem;
}
```

- [ ] **Step 4: Run the AuctionCard test to verify it passes**

Run: `cd auksion && npm test -- src/components/AuctionCard.test.tsx`
Expected: both tests `PASS`.

- [ ] **Step 5: Write the failing Home test**

```tsx
// auksion/src/pages/Home.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';
import * as api from '../api/auksion';

describe('Home', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getLiveListings');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a card for every live listing returned by the API', async () => {
    vi.mocked(api.getLiveListings).mockResolvedValue([
      {
        id: 1, make: 'Tesla', model: 'Model 3', year: 2022, description: '', images: [],
        startingBid: 15000, bidCount: 0, minNextBid: 15000,
        endTime: new Date(Date.now() + 3600_000).toISOString(), status: 'live', createdAt: new Date().toISOString(),
      },
    ]);

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Tesla Model 3')).toBeInTheDocument());
  });

  it('shows an empty-state message when there are no live listings', async () => {
    vi.mocked(api.getLiveListings).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Hazırda aktiv hərraj yoxdur.')).toBeInTheDocument());
  });
});
```

- [ ] **Step 6: Run the Home test to verify it fails**

Run: `cd auksion && npm test -- src/pages/Home.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Write Home**

```tsx
// auksion/src/pages/Home.tsx
import { useEffect, useState } from 'react';
import { getLiveListings, type Listing } from '../api/auksion';
import AuctionCard from '../components/AuctionCard';
import styles from './Home.module.css';

export default function Home() {
  const [listings, setListings] = useState<Listing[] | null>(null);

  useEffect(() => {
    getLiveListings().then(setListings).catch(() => setListings([]));
  }, []);

  if (listings === null) {
    return <div className={styles.page}>Yüklənir...</div>;
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Aktiv hərraclar</h1>
      {listings.length === 0 ? (
        <p className={styles.empty}>Hazırda aktiv hərraj yoxdur.</p>
      ) : (
        <div className={styles.grid}>
          {listings.map((listing) => (
            <AuctionCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
```

```css
/* auksion/src/pages/Home.module.css */
.page {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: var(--space-8) var(--space-6);
  color: var(--text-primary);
}

.heading {
  font-family: var(--font-display);
  margin-bottom: var(--space-6);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-6);
}

.empty {
  color: var(--text-secondary);
}
```

- [ ] **Step 8: Run the Home test to verify it passes**

Run: `cd auksion && npm test -- src/pages/Home.test.tsx`
Expected: both tests `PASS`.

- [ ] **Step 9: Commit**

```bash
git add auksion/src/components/AuctionCard.tsx auksion/src/components/AuctionCard.module.css auksion/src/components/AuctionCard.test.tsx auksion/src/pages/Home.tsx auksion/src/pages/Home.module.css auksion/src/pages/Home.test.tsx
git commit -m "feat(auksion): add AuctionCard and Home listing grid"
```

---

### Task 10: BidBox component

**Files:**
- Create: `auksion/src/components/BidBox.tsx`, `auksion/src/components/BidBox.module.css`
- Test: `auksion/src/components/BidBox.test.tsx`

**Interfaces:**
- Consumes: `Listing`, `Bid`, `placeBid`, `BidTooLowError`, `AuctionEndedError`, `AuksionUnauthorizedError` (Task 6); `useAuth()` (Task 7); `<CountdownTimer>` (Task 8).
- Produces: `<BidBox listing={Listing} bids={Bid[]} onBidPlaced={(listing: Listing) => void} />` — consumed by Task 11 (ListingDetail).

- [ ] **Step 1: Write the failing test**

```tsx
// auksion/src/components/BidBox.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BidBox from './BidBox';
import * as api from '../api/auksion';
import { AuthProvider } from '../context/AuthContext';

const listing: api.Listing = {
  id: 1, make: 'Tesla', model: 'Model 3', year: 2022, description: '', images: [],
  startingBid: 15000, currentBid: 15000, bidCount: 1, minNextBid: 15100,
  endTime: new Date(Date.now() + 3600_000).toISOString(), status: 'live', createdAt: new Date().toISOString(),
};
const bids: api.Bid[] = [{ id: 1, listingId: 1, bidderUserId: 7, amount: 15000, createdAt: new Date().toISOString() }];

function renderBidBox(onBidPlaced = vi.fn()) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <BidBox listing={listing} bids={bids} onBidPlaced={onBidPlaced} />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('BidBox', () => {
  beforeEach(() => {
    vi.spyOn(api, 'placeBid');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the current price, minimum next bid and bid history', () => {
    renderBidBox();

    expect(screen.getByText('15 000 ₼')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('15100')).toBeInTheDocument();
    expect(screen.getByText('1 təklif')).toBeInTheDocument();
  });

  it('calls placeBid and onBidPlaced with the updated listing on success', async () => {
    const updated = { ...listing, currentBid: 15100, bidCount: 2, minNextBid: 15200 };
    vi.mocked(api.placeBid).mockResolvedValue(updated);
    const onBidPlaced = vi.fn();

    renderBidBox(onBidPlaced);
    fireEvent.change(screen.getByPlaceholderText('15100'), { target: { value: '15100' } });
    fireEvent.click(screen.getByText('Təklif ver'));

    await waitFor(() => expect(onBidPlaced).toHaveBeenCalledWith(updated));
    expect(api.placeBid).toHaveBeenCalledWith(1, 15100);
  });

  it('shows the server-reported minimum when the bid is rejected as too low', async () => {
    vi.mocked(api.placeBid).mockRejectedValue(new api.BidTooLowError(15100));

    renderBidBox();
    fireEvent.change(screen.getByPlaceholderText('15100'), { target: { value: '15050' } });
    fireEvent.click(screen.getByText('Təklif ver'));

    await waitFor(() => expect(screen.getByText('Minimum təklif: 15100 ₼')).toBeInTheDocument());
  });

  it('shows an ended message when the auction has ended', async () => {
    vi.mocked(api.placeBid).mockRejectedValue(new api.AuctionEndedError());

    renderBidBox();
    fireEvent.change(screen.getByPlaceholderText('15100'), { target: { value: '15100' } });
    fireEvent.click(screen.getByText('Təklif ver'));

    await waitFor(() => expect(screen.getByText('Hərrac bitib.')).toBeInTheDocument());
  });

  it('prompts to log in when placing a bid while unauthenticated', async () => {
    vi.mocked(api.placeBid).mockRejectedValue(new api.AuksionUnauthorizedError());

    renderBidBox();
    fireEvent.change(screen.getByPlaceholderText('15100'), { target: { value: '15100' } });
    fireEvent.click(screen.getByText('Təklif ver'));

    await waitFor(() => expect(screen.getByText('Təklif vermək üçün daxil olun.')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd auksion && npm test -- src/components/BidBox.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write BidBox**

```tsx
// auksion/src/components/BidBox.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { placeBid, AuksionUnauthorizedError, BidTooLowError, AuctionEndedError, type Listing, type Bid } from '../api/auksion';
import { useAuth } from '../context/AuthContext';
import styles from './BidBox.module.css';

export default function BidBox({
  listing,
  bids,
  onBidPlaced,
}: {
  listing: Listing;
  bids: Bid[];
  onBidPlaced: (listing: Listing) => void;
}) {
  const { user } = useAuth();
  const [amount, setAmount] = useState(String(listing.minNextBid));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const price = listing.currentBid ?? listing.startingBid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const updated = await placeBid(listing.id, Number(amount));
      onBidPlaced(updated);
      setAmount(String(updated.minNextBid));
    } catch (err) {
      if (err instanceof AuksionUnauthorizedError) {
        setError('Təklif vermək üçün daxil olun.');
      } else if (err instanceof BidTooLowError) {
        setError(`Minimum təklif: ${err.minimum.toLocaleString('az-AZ')} ₼`);
      } else if (err instanceof AuctionEndedError) {
        setError('Hərrac bitib.');
      } else {
        setError('Xəta baş verdi. Yenidən cəhd edin.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.box}>
      <div className={styles.price}>{price.toLocaleString('az-AZ')} ₼</div>
      <div className={styles.bidCount}>{listing.bidCount} təklif</div>

      {listing.status === 'ended' ? (
        <p className={styles.ended}>Hərrac bitib.</p>
      ) : user ? (
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="number"
            step="0.01"
            placeholder={String(listing.minNextBid)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={styles.input}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'Göndərilir...' : 'Təklif ver'}
          </button>
        </form>
      ) : (
        <div className={styles.form}>
          {error && <p className={styles.error}>{error}</p>}
          <Link to="/giris" className={styles.loginPrompt}>
            Təklif vermək üçün daxil olun
          </Link>
        </div>
      )}

      <h4 className={styles.historyTitle}>Təklif tarixçəsi</h4>
      <ul className={styles.history}>
        {bids.map((bid) => (
          <li key={bid.id}>
            {bid.amount.toLocaleString('az-AZ')} ₼ — {new Date(bid.createdAt).toLocaleString('az-AZ')}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```css
/* auksion/src/components/BidBox.module.css */
.box {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  color: var(--text-primary);
}

.price {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 700;
}

.bidCount {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin-bottom: var(--space-4);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.input {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  color: var(--text-primary);
  font-size: 1rem;
}

.error {
  color: var(--error);
  font-size: 0.875rem;
}

.submitBtn {
  background: var(--accent);
  color: var(--bg-primary);
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  font-weight: 600;
  cursor: pointer;
}

.submitBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loginPrompt {
  color: var(--accent);
  font-weight: 600;
}

.ended {
  color: var(--text-tertiary);
}

.historyTitle {
  margin-top: var(--space-6);
  margin-bottom: var(--space-2);
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.history {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: 0.875rem;
  color: var(--text-secondary);
  max-height: 200px;
  overflow-y: auto;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd auksion && npm test -- src/components/BidBox.test.tsx`
Expected: all 5 tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add auksion/src/components/BidBox.tsx auksion/src/components/BidBox.module.css auksion/src/components/BidBox.test.tsx
git commit -m "feat(auksion): add BidBox component (bid form + history)"
```

---

### Task 11: ListingDetail page, Header, and final App.tsx routes

**Files:**
- Create: `auksion/src/pages/ListingDetail.tsx`, `auksion/src/pages/ListingDetail.module.css`, `auksion/src/components/Header.tsx`, `auksion/src/components/Header.module.css`
- Modify: `auksion/src/App.tsx`
- Test: `auksion/src/pages/ListingDetail.test.tsx`

**Interfaces:**
- Consumes: `getListing`, `Listing`, `Bid` (Task 6); `<BidBox>` (Task 10); `<CountdownTimer>` (Task 8); `useAuth()`, `<Login>`, `<LoginVerify>` (Task 7); `<Home>` (Task 9).

- [ ] **Step 1: Write the failing ListingDetail test**

```tsx
// auksion/src/pages/ListingDetail.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ListingDetail from './ListingDetail';
import * as api from '../api/auksion';
import { AuthProvider } from '../context/AuthContext';

describe('ListingDetail', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getListing');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the listing by id from the URL and renders make/model + BidBox', async () => {
    vi.mocked(api.getListing).mockResolvedValue({
      listing: {
        id: 5, make: 'Tesla', model: 'Model Y', year: 2023, description: 'Təmiz maşın', images: [],
        startingBid: 20000, currentBid: 20500, bidCount: 3, minNextBid: 20600,
        endTime: new Date(Date.now() + 3600_000).toISOString(), status: 'live', createdAt: new Date().toISOString(),
      },
      bids: [],
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/elan/5']}>
          <Routes>
            <Route path="/elan/:id" element={<ListingDetail />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('Tesla Model Y')).toBeInTheDocument());
    expect(api.getListing).toHaveBeenCalledWith(5);
    expect(screen.getByText('Təmiz maşın')).toBeInTheDocument();
    expect(screen.getByText('20 500 ₼')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd auksion && npm test -- src/pages/ListingDetail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write ListingDetail**

```tsx
// auksion/src/pages/ListingDetail.tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getListing, type Listing, type Bid } from '../api/auksion';
import BidBox from '../components/BidBox';
import CountdownTimer from '../components/CountdownTimer';
import styles from './ListingDetail.module.css';

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);

  const listingId = Number(id);

  const load = () => {
    getListing(listingId).then((detail) => {
      setListing(detail.listing);
      setBids(detail.bids);
    });
  };

  useEffect(() => {
    load();
    // Poll for live bid updates every 4 seconds while this page is open.
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  if (!listing) {
    return <div className={styles.page}>Yüklənir...</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.gallery}>
        {listing.images[0] ? (
          <img src={listing.images[0]} alt={`${listing.make} ${listing.model}`} />
        ) : (
          <div className={styles.placeholder} />
        )}
      </div>
      <div className={styles.info}>
        <h1>
          {listing.make} {listing.model}
        </h1>
        <p className={styles.meta}>
          {listing.year} · <CountdownTimer endTime={listing.endTime} onEnd={load} /> qalıb
        </p>
        {listing.description && <p className={styles.description}>{listing.description}</p>}
        <BidBox
          listing={listing}
          bids={bids}
          onBidPlaced={(updated) => {
            setListing(updated);
            load();
          }}
        />
      </div>
    </div>
  );
}
```

```css
/* auksion/src/pages/ListingDetail.module.css */
.page {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: var(--space-8) var(--space-6);
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: var(--space-8);
  color: var(--text-primary);
}

.gallery img,
.placeholder {
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
}

.meta {
  color: var(--text-secondary);
  margin: var(--space-2) 0 var(--space-4);
}

.description {
  margin-bottom: var(--space-6);
  line-height: 1.6;
}

@media (max-width: 900px) {
  .page {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Run the ListingDetail test to verify it passes**

Run: `cd auksion && npm test -- src/pages/ListingDetail.test.tsx`
Expected: `PASS`.

- [ ] **Step 5: Write Header**

```tsx
// auksion/src/components/Header.tsx
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Header.module.css';

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand}>
        AutoPulse Auksion
      </Link>
      <nav className={styles.nav}>
        {user ? (
          <button className={styles.logoutBtn} onClick={logout}>
            {user.phone} · Çıxış
          </button>
        ) : (
          <Link to="/giris" className={styles.loginLink}>
            Daxil ol
          </Link>
        )}
      </nav>
    </header>
  );
}
```

```css
/* auksion/src/components/Header.module.css */
.header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-6);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}

.brand {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.125rem;
  color: var(--text-primary);
  text-decoration: none;
}

.loginLink,
.logoutBtn {
  color: var(--text-primary);
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  text-decoration: none;
  font-size: 0.875rem;
}
```

- [ ] **Step 6: Wire final App.tsx routes**

```tsx
// auksion/src/App.tsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Header from './components/Header';
import Home from './pages/Home';
import ListingDetail from './pages/ListingDetail';
import Login from './pages/Login';
import LoginVerify from './pages/LoginVerify';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/elan/:id" element={<ListingDetail />} />
          <Route path="/giris" element={<Login />} />
          <Route path="/giris/kod" element={<LoginVerify />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
```

Update `auksion/src/App.test.tsx` (from Task 5) since `Home`'s heading changed from `<h1>AutoPulse Auksion</h1>` to the Header's brand link plus Home's own "Aktiv hərraclar" heading:

```tsx
// auksion/src/App.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the AutoPulse Auksion brand in the header on the home route', () => {
    render(<App />);
    expect(screen.getByText('AutoPulse Auksion')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the full test suite and build**

Run: `cd auksion && npm test && npm run build`
Expected: every test file `PASS` (App, api/auksion, api/auth, CountdownTimer, AuctionCard, Home, BidBox, ListingDetail), build succeeds.

- [ ] **Step 8: Commit**

```bash
git add auksion/src/pages/ListingDetail.tsx auksion/src/pages/ListingDetail.module.css auksion/src/pages/ListingDetail.test.tsx auksion/src/components/Header.tsx auksion/src/components/Header.module.css auksion/src/App.tsx auksion/src/App.test.tsx
git commit -m "feat(auksion): wire ListingDetail, Header and final app routes"
```

---

### Task 12: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Start the backend**

A local MinIO instance and the local Postgres `avtopulse` dev database are already set up on this machine (see Task 4 Step 5 for how to verify/restart MinIO if needed).

```bash
cd avtopulse-backend
export AVTOPULSE_DSN="postgres://localhost:5432/avtopulse?sslmode=disable"
export AVTOPULSE_PORT=8090
export AVTOPULSE_MINIO_ENDPOINT=127.0.0.1:9000
export AVTOPULSE_MINIO_ACCESS_KEY=minioadmin
export AVTOPULSE_MINIO_SECRET_KEY=minioadmin
export AVTOPULSE_MINIO_BUCKET=avtopulse-local
export AVTOPULSE_MINIO_PUBLIC_URL=http://127.0.0.1:9000/avtopulse-local
export ADMIN_USERNAME=localadmin
export ADMIN_PASSWORD=localdevpass123
nohup go run ./cmd/server > /tmp/avtopulse-backend-e2e.log 2>&1 &
disown
sleep 3
curl -s -o /dev/null -w "healthz: %{http_code}\n" http://localhost:8090/healthz
```

Expected: `healthz: 200`.

- [ ] **Step 2: Start the auksion frontend**

```bash
cd auksion && cp .env.local.example .env.local
nohup npm run dev > /tmp/auksion-frontend-e2e.log 2>&1 &
disown
sleep 3
cat /tmp/auksion-frontend-e2e.log
```

Note the printed local URL (typically `http://localhost:5173`) — call it `$FRONTEND_URL` below.

- [ ] **Step 3: Create a short-lived listing via the admin API**

```bash
curl -s -c /tmp/admin.jar -X POST http://localhost:8090/api/admin/login \
  -H 'Content-Type: application/json' -d '{"username":"localadmin","password":"localdevpass123"}'
curl -s -b /tmp/admin.jar -X POST http://localhost:8090/api/auksion/admin/listings \
  -H 'Content-Type: application/json' \
  -d '{"make":"Tesla","model":"Model 3","year":2022,"description":"Test","images":["https://images.unsplash.com/photo-1560958089-b8a1929cea89"],"startingBid":15000,"endTime":"'"$(date -u -v+2M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+2 minutes' +%Y-%m-%dT%H:%M:%SZ)"'"}'
```

Note the returned `id` — call it `$LISTING_ID` below.

- [ ] **Step 4: Verify the full flow end-to-end via the real HTTP API**

```bash
# Home feed shows the listing live, with a computed minNextBid of 15000.
curl -s http://localhost:8090/api/auksion/listings | grep -o '"minNextBid":[0-9.]*'

# Log in as a bidder (fixed test OTP code "1234", per internal/user/handler.go's otpTestCode).
curl -s -c /tmp/bidder.jar -X POST http://localhost:8090/api/users/otp/request \
  -H 'Content-Type: application/json' -d '{"phone":"+994500000001"}'
curl -s -c /tmp/bidder.jar -X POST http://localhost:8090/api/users/otp/verify \
  -H 'Content-Type: application/json' -d '{"phone":"+994500000001","code":"1234"}'

# Place a bid at the minimum (15000) — expect 200 with currentBid=15000, bidCount=1, minNextBid=15100.
curl -s -b /tmp/bidder.jar -X POST http://localhost:8090/api/auksion/listings/$LISTING_ID/bids \
  -H 'Content-Type: application/json' -d '{"amount":15000}'

# Re-bid at the old minimum again — expect 400 with {"error":"bid_too_low","minimum":15100}.
curl -s -b /tmp/bidder.jar -X POST http://localhost:8090/api/auksion/listings/$LISTING_ID/bids \
  -H 'Content-Type: application/json' -d '{"amount":15000}'

# Frontend dev server itself responds (confirms the Vite app built/serves, not just the backend).
curl -s -o /dev/null -w "frontend: %{http_code}\n" "$FRONTEND_URL"
```

If a browser is available in this environment, also open `$FRONTEND_URL` directly and confirm visually: the home page shows the Tesla Model 3 card with a live countdown badge; the detail page's bid box updates to `15 100 ₼` after the bid above; logging in via `/giris` with any phone number and code `1234` works from the UI; and after the 2-minute window elapses, the BidBox switches to "Hərrac bitib." and the countdown shows "Bitdi". This visual check is a bonus, not a requirement — the curl checks above are the actual pass/fail signal.

- [ ] **Step 5: Stop both dev servers**

```bash
kill -9 $(lsof -ti:8090) 2>/dev/null
kill -9 $(lsof -ti:5173) 2>/dev/null
```

(Adjust the second port if Step 2's output printed a different one.) MinIO stays running — do not stop it.

- [ ] **Step 6: Note the result**

No commit for this task — it's a verification pass. If any step fails, go back to the relevant task, fix it (write a new failing test first if it's a logic bug), and re-run this task's steps from the top.
