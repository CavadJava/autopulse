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
		`SELECT id, name, customer_id, title, COALESCE(details, ''), COALESCE(work_times, ''), COALESCE(logo_url, '') FROM avto444.shop WHERE name = $1`,
		name,
	).Scan(&s.ID, &s.Name, &s.CustomerID, &s.Title, &s.Details, &s.WorkTimes, &s.LogoURL)
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
		`SELECT id, name, customer_id, title, COALESCE(details, ''), COALESCE(work_times, ''), COALESCE(logo_url, '') FROM avto444.shop WHERE id = $1`,
		id,
	).Scan(&s.ID, &s.Name, &s.CustomerID, &s.Title, &s.Details, &s.WorkTimes, &s.LogoURL)
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
		`SELECT id, name, title, COALESCE(details, ''),
		        COALESCE(marka, ''), COALESCE(model, ''), COALESCE(il, 0),
		        COALESCE(qiymet, 0), COALESCE(yurus, 0), COALESCE(yanacaq, ''), COALESCE(ban, '')
		 FROM avto444.shop_products WHERE shop_id = $1 ORDER BY id`,
		shopID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Product{}
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.ID, &p.Name, &p.Title, &p.Details,
			&p.Marka, &p.Model, &p.Il, &p.Qiymet, &p.Yurus, &p.Yanacaq, &p.Ban); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range out {
		images, err := r.listProductImages(ctx, out[i].ID)
		if err != nil {
			return nil, err
		}
		out[i].Images = images
	}

	return out, nil
}

func (r *pgRepository) listProductImages(ctx context.Context, productID int64) ([]ProductImage, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, url, sira FROM avto444.shop_product_images WHERE product_id = $1 ORDER BY sira, id`,
		productID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ProductImage{}
	for rows.Next() {
		var img ProductImage
		if err := rows.Scan(&img.ID, &img.URL, &img.Sira); err != nil {
			return nil, err
		}
		out = append(out, img)
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
