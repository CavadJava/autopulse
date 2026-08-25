package parts

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("parts: not found")

type Repository interface {
	ListSellers(ctx context.Context) ([]Seller, error)
	GetOrCreateSeller(ctx context.Context, name string) (*Seller, error)
	InsertParts(ctx context.Context, parts []NewPart) error
	ListParts(ctx context.Context, filter PartFilter) ([]Part, int, error)
}

type pgRepository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &pgRepository{pool: pool}
}

func (r *pgRepository) ListSellers(ctx context.Context) ([]Seller, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, name FROM avto444.sellers ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sellers []Seller
	for rows.Next() {
		var s Seller
		if err := rows.Scan(&s.ID, &s.Name); err != nil {
			return nil, err
		}
		sellers = append(sellers, s)
	}
	return sellers, rows.Err()
}

func (r *pgRepository) GetOrCreateSeller(ctx context.Context, name string) (*Seller, error) {
	var s Seller
	err := r.pool.QueryRow(ctx, `SELECT id, name FROM avto444.sellers WHERE name = $1`, name).Scan(&s.ID, &s.Name)
	if err == nil {
		return &s, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	err = r.pool.QueryRow(ctx,
		`INSERT INTO avto444.sellers (name) VALUES ($1) RETURNING id, name`, name,
	).Scan(&s.ID, &s.Name)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *pgRepository) InsertParts(ctx context.Context, newParts []NewPart) error {
	if len(newParts) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	for _, p := range newParts {
		batch.Queue(`
			INSERT INTO avto444.seller_parts
				(seller_id, model, row_no, oem, description, year_range, price_raw,
				 price_made_in_china, price_original_new, price_original_used,
				 image_url, image_url_s3)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		`, p.SellerID, p.Model, p.RowNo, p.OEM, p.Description, p.YearRange, p.PriceRaw,
			p.PriceMadeInChina, p.PriceOriginalNew, p.PriceOriginalUsed, p.ImageURL, p.ImageURLS3)
	}

	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()

	for range newParts {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("parts: batch insert: %w", err)
		}
	}
	return nil
}

func (r *pgRepository) ListParts(ctx context.Context, filter PartFilter) ([]Part, int, error) {
	page := filter.Page
	if page < 1 {
		page = 1
	}
	limit := filter.Limit
	if limit < 1 {
		limit = 50
	}
	offset := (page - 1) * limit

	where := "WHERE 1=1"
	args := []any{}
	argN := 1

	if filter.Model != "" {
		where += fmt.Sprintf(" AND sp.model = $%d", argN)
		args = append(args, filter.Model)
		argN++
	}
	if len(filter.SellerIDs) > 0 {
		where += fmt.Sprintf(" AND sp.seller_id = ANY($%d)", argN)
		args = append(args, filter.SellerIDs)
		argN++
	}

	var total int
	countQuery := "SELECT count(*) FROM avto444.seller_parts sp " + where
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := fmt.Sprintf(`
		SELECT sp.id, sp.seller_id, s.name, sp.model, sp.row_no, sp.oem, sp.description,
		       sp.year_range, sp.price_raw, sp.price_made_in_china, sp.price_original_new,
		       sp.price_original_used, sp.image_url
		FROM avto444.seller_parts sp
		JOIN avto444.sellers s ON s.id = sp.seller_id
		%s
		ORDER BY sp.id
		LIMIT $%d OFFSET $%d
	`, where, argN, argN+1)
	args = append(args, limit, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var results []Part
	for rows.Next() {
		var p Part
		if err := rows.Scan(&p.ID, &p.SellerID, &p.SellerName, &p.Model, &p.RowNo, &p.OEM,
			&p.Description, &p.YearRange, &p.PriceRaw, &p.PriceMadeInChina,
			&p.PriceOriginalNew, &p.PriceOriginalUsed, &p.ImageURL); err != nil {
			return nil, 0, err
		}
		results = append(results, p)
	}
	return results, total, rows.Err()
}
