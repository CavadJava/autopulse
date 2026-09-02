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
