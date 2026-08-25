package parts

import (
	"context"
	"os"
	"testing"

	"github.com/CavadJava/avtopulse-backend/internal/db"
)

func TestRepository_InsertAndListParts(t *testing.T) {
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

	repo := NewRepository(pool)

	seller, err := repo.GetOrCreateSeller(ctx, "test-seller-parts")
	if err != nil {
		t.Fatalf("GetOrCreateSeller failed: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM avto444.seller_parts WHERE seller_id = $1`, seller.ID)
	defer pool.Exec(ctx, `DELETE FROM avto444.sellers WHERE id = $1`, seller.ID)

	// GetOrCreateSeller should be idempotent
	seller2, err := repo.GetOrCreateSeller(ctx, "test-seller-parts")
	if err != nil {
		t.Fatalf("second GetOrCreateSeller failed: %v", err)
	}
	if seller2.ID != seller.ID {
		t.Fatalf("expected same seller id, got %d vs %d", seller.ID, seller2.ID)
	}

	oem := "1494949-00-A"
	desc := "The front logo of the Tesla MD3"
	year := "2019-2021"
	price := 1.4

	err = repo.InsertParts(ctx, []NewPart{
		{SellerID: seller.ID, Model: "model3", OEM: &oem, Description: &desc, YearRange: &year, PriceMadeInChina: &price},
	})
	if err != nil {
		t.Fatalf("InsertParts failed: %v", err)
	}

	results, total, err := repo.ListParts(ctx, PartFilter{Model: "model3", SellerIDs: []int64{seller.ID}})
	if err != nil {
		t.Fatalf("ListParts failed: %v", err)
	}
	if total != 1 {
		t.Fatalf("expected total=1, got %d", total)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].OEM == nil || *results[0].OEM != oem {
		t.Fatalf("expected oem %q, got %v", oem, results[0].OEM)
	}
	if results[0].SellerName != "test-seller-parts" {
		t.Fatalf("expected seller name to be joined, got %q", results[0].SellerName)
	}
}
