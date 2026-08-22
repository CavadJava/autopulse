package shop

import (
	"context"
	"os"
	"testing"

	"github.com/CavadJava/avtopulse-backend/internal/db"
)

// TestRepository_NullDetailsAndWorkTimes is an integration test that runs
// against a real Postgres instance. It inserts a shop and product with NULL
// `details`/`work_times` columns directly via SQL (the schema allows this;
// the Go struct fields are plain, non-pointer strings) and confirms the
// repository's COALESCE-based queries return empty strings instead of
// erroring on the pgx scan.
func TestRepository_NullDetailsAndWorkTimes(t *testing.T) {
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

	// Clean slate for this test's rows only; does not touch seeded data used
	// by other tests.
	if _, err := pool.Exec(ctx, `DELETE FROM avto444.shop_products WHERE name = 'null-details-product'`); err != nil {
		t.Fatalf("cleanup products failed: %v", err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM avto444.shop WHERE name = 'null-details-shop'`); err != nil {
		t.Fatalf("cleanup shop failed: %v", err)
	}

	var shopID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO avto444.shop (name, customer_id, title, details, work_times, password_hash)
		VALUES ('null-details-shop', 1, 'Null Details Shop', NULL, NULL, 'irrelevant-hash')
		RETURNING id
	`).Scan(&shopID)
	if err != nil {
		t.Fatalf("inserting shop with NULL details/work_times failed: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM avto444.shop WHERE id = $1`, shopID)

	if _, err := pool.Exec(ctx, `
		INSERT INTO avto444.shop_products (name, title, details, shop_id)
		VALUES ('null-details-product', 'Null Details Product', NULL, $1)
	`, shopID); err != nil {
		t.Fatalf("inserting product with NULL details failed: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM avto444.shop_products WHERE shop_id = $1`, shopID)

	repo := NewRepository(pool)

	shopByName, err := repo.GetShopByName(ctx, "null-details-shop")
	if err != nil {
		t.Fatalf("GetShopByName failed on NULL details/work_times row: %v", err)
	}
	if shopByName.Details != "" {
		t.Errorf("expected empty Details, got %q", shopByName.Details)
	}
	if shopByName.WorkTimes != "" {
		t.Errorf("expected empty WorkTimes, got %q", shopByName.WorkTimes)
	}

	shopByID, err := repo.GetShopByID(ctx, shopID)
	if err != nil {
		t.Fatalf("GetShopByID failed on NULL details/work_times row: %v", err)
	}
	if shopByID.Details != "" {
		t.Errorf("expected empty Details, got %q", shopByID.Details)
	}
	if shopByID.WorkTimes != "" {
		t.Errorf("expected empty WorkTimes, got %q", shopByID.WorkTimes)
	}

	products, err := repo.ListProducts(ctx, shopID)
	if err != nil {
		t.Fatalf("ListProducts failed on NULL details row: %v", err)
	}
	if len(products) != 1 {
		t.Fatalf("expected 1 product, got %d", len(products))
	}
	if products[0].Details != "" {
		t.Errorf("expected empty product Details, got %q", products[0].Details)
	}
}

// TestListProducts_EmptyResultIsNotNilSlice verifies ListProducts (which
// shares the same []T{} initialization pattern applied to ListShops) returns
// an empty, non-nil slice for a shop with no products, against a real DB.
func TestListProducts_EmptyResultIsNotNilSlice(t *testing.T) {
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

	products, err := NewRepository(pool).ListProducts(ctx, -1)
	if err != nil {
		t.Fatalf("ListProducts failed: %v", err)
	}
	if products == nil {
		t.Fatalf("expected non-nil empty slice, got nil")
	}
	if len(products) != 0 {
		t.Fatalf("expected 0 products for shop_id -1, got %d", len(products))
	}
}
