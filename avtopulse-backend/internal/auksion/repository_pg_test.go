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
	// Deferred cleanup runs LIFO, so the listings delete must be registered
	// first (it runs last) and the bids delete last (it runs first) —
	// otherwise the listings delete fails silently on the FK from
	// auksion.bids and leaves an orphaned row behind.
	defer pool.Exec(ctx, `DELETE FROM auksion.listings WHERE id = $1`, listing.ID)
	defer pool.Exec(ctx, `DELETE FROM auksion.bids WHERE listing_id = $1`, listing.ID)

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
	defer pool.Exec(ctx, `DELETE FROM auksion.listings WHERE id = $1`, listing.ID)
	defer pool.Exec(ctx, `DELETE FROM auksion.bids WHERE listing_id = $1`, listing.ID)

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
	defer pool.Exec(ctx, `DELETE FROM auksion.listings WHERE id = $1`, listing.ID)
	defer pool.Exec(ctx, `DELETE FROM auksion.bids WHERE listing_id = $1`, listing.ID)

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
