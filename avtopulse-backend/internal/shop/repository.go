package shop

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("shop: not found")

type Repository interface {
	ListShops(ctx context.Context) ([]ShopSummary, error)
	GetShopByName(ctx context.Context, name string) (*Shop, error)
	GetShopByID(ctx context.Context, id int64) (*Shop, error)
	ListProducts(ctx context.Context, shopID int64) ([]Product, error)
	GetPasswordHash(ctx context.Context, shopID int64) (string, error)
}

type pgRepository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &pgRepository{pool: pool}
}

func (r *pgRepository) ListShops(ctx context.Context) ([]ShopSummary, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, name, title FROM avto444.shop ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ShopSummary{}
	for rows.Next() {
		var s ShopSummary
		if err := rows.Scan(&s.ID, &s.Name, &s.Title); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *pgRepository) GetShopByName(ctx context.Context, name string) (*Shop, error) {
	var s Shop
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, customer_id, title, COALESCE(details, ''), COALESCE(work_times, '') FROM avto444.shop WHERE name = $1`,
		name,
	).Scan(&s.ID, &s.Name, &s.CustomerID, &s.Title, &s.Details, &s.WorkTimes)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *pgRepository) GetShopByID(ctx context.Context, id int64) (*Shop, error) {
	var s Shop
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, customer_id, title, COALESCE(details, ''), COALESCE(work_times, '') FROM avto444.shop WHERE id = $1`,
		id,
	).Scan(&s.ID, &s.Name, &s.CustomerID, &s.Title, &s.Details, &s.WorkTimes)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *pgRepository) ListProducts(ctx context.Context, shopID int64) ([]Product, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name, title, COALESCE(details, '') FROM avto444.shop_products WHERE shop_id = $1 ORDER BY id`,
		shopID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Product{}
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.ID, &p.Name, &p.Title, &p.Details); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *pgRepository) GetPasswordHash(ctx context.Context, shopID int64) (string, error) {
	var hash string
	err := r.pool.QueryRow(ctx, `SELECT password_hash FROM avto444.shop WHERE id = $1`, shopID).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return hash, err
}
