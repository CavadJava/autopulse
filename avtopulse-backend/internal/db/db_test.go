package db

import (
	"context"
	"os"
	"testing"
)

func TestConnectAndMigrate(t *testing.T) {
	dsn := os.Getenv("AVTOPULSE_TEST_DSN")
	if dsn == "" {
		t.Skip("AVTOPULSE_TEST_DSN not set, skipping integration test")
	}

	ctx := context.Background()
	pool, err := Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer pool.Close()

	if err := RunMigrations(ctx, pool, "../../migrations"); err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}

	var name string
	err = pool.QueryRow(ctx, `SELECT name FROM avto444.shop WHERE name = 'avto444'`).Scan(&name)
	if err != nil {
		t.Fatalf("expected seeded shop 'avto444', query failed: %v", err)
	}
	if name != "avto444" {
		t.Fatalf("expected name 'avto444', got %q", name)
	}
}
