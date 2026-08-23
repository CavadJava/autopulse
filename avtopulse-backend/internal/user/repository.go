package user

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("user: not found")

type Repository interface {
	FindOrCreateByPhone(ctx context.Context, phone string) (*User, error)
	ListMyProducts(ctx context.Context, userID int64) ([]Product, error)
	CreateProduct(ctx context.Context, userID int64, input CreateProductInput) (*Product, error)
	UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error)
	DeleteProduct(ctx context.Context, productID int64) error
	GetProductUserID(ctx context.Context, productID int64) (int64, error)
	AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int) (*ProductImage, error)
	ListPendingProducts(ctx context.Context) ([]Product, error)
	ApproveProduct(ctx context.Context, productID int64) error
	RejectProduct(ctx context.Context, productID int64) error
}

type pgRepository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &pgRepository{pool: pool}
}

func (r *pgRepository) FindOrCreateByPhone(ctx context.Context, phone string) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, phone FROM avto444.user WHERE phone = $1`,
		phone,
	).Scan(&u.ID, &u.Name, &u.Phone)
	if err == nil {
		return &u, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	err = r.pool.QueryRow(ctx,
		`INSERT INTO avto444.user (name, phone) VALUES ('', $1) RETURNING id, name, phone`,
		phone,
	).Scan(&u.ID, &u.Name, &u.Phone)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *pgRepository) ListMyProducts(ctx context.Context, userID int64) ([]Product, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, COALESCE(marka, ''), COALESCE(model, ''), COALESCE(il, 0),
		        COALESCE(qiymet, 0), COALESCE(yurus, 0), COALESCE(yanacaq, ''), COALESCE(ban, ''),
		        title, COALESCE(details, ''), status
		 FROM avto444.user_products WHERE user_id = $1 ORDER BY id`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Product{}
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.ID, &p.UserID, &p.Marka, &p.Model, &p.Il, &p.Qiymet,
			&p.Yurus, &p.Yanacaq, &p.Ban, &p.Title, &p.Details, &p.Status); err != nil {
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
		`SELECT id, minio_url, COALESCE(s3_url, ''), sira FROM avto444.user_products_images WHERE user_product_id = $1 ORDER BY sira, id`,
		productID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ProductImage{}
	for rows.Next() {
		var img ProductImage
		if err := rows.Scan(&img.ID, &img.MinioURL, &img.S3URL, &img.Sira); err != nil {
			return nil, err
		}
		out = append(out, img)
	}
	return out, rows.Err()
}

func (r *pgRepository) CreateProduct(ctx context.Context, userID int64, input CreateProductInput) (*Product, error) {
	var id int64
	err := r.pool.QueryRow(ctx,
		`INSERT INTO avto444.user_products (user_id, marka, model, il, qiymet, yurus, yanacaq, ban, title, details, status)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'gozlemede')
		 RETURNING id`,
		userID, input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, input.Title, input.Details,
	).Scan(&id)
	if err != nil {
		return nil, err
	}

	return &Product{
		ID: id, UserID: userID, Marka: input.Marka, Model: input.Model, Il: input.Il,
		Qiymet: input.Qiymet, Yurus: input.Yurus, Yanacaq: input.Yanacaq, Ban: input.Ban,
		Title: input.Title, Details: input.Details, Status: "gozlemede", Images: []ProductImage{},
	}, nil
}

func (r *pgRepository) UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error) {
	var currentStatus string
	err := r.pool.QueryRow(ctx, `SELECT status FROM avto444.user_products WHERE id = $1`, productID).Scan(&currentStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	// A cancelled listing being edited goes back to gözləmədə (re-moderation
	// required) — any other status (gözləmədə itself, or saytda) is left as-is.
	newStatus := currentStatus
	if currentStatus == "legv_edilib" {
		newStatus = "gozlemede"
	}

	var userID int64
	err = r.pool.QueryRow(ctx,
		`UPDATE avto444.user_products
		 SET marka = $1, model = $2, il = $3, qiymet = $4, yurus = $5, yanacaq = $6, ban = $7, title = $8, details = $9, status = $10, updated_at = now()
		 WHERE id = $11
		 RETURNING user_id`,
		input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, input.Title, input.Details, newStatus, productID,
	).Scan(&userID)
	if err != nil {
		return nil, err
	}

	images, err := r.listProductImages(ctx, productID)
	if err != nil {
		return nil, err
	}

	return &Product{
		ID: productID, UserID: userID, Marka: input.Marka, Model: input.Model, Il: input.Il,
		Qiymet: input.Qiymet, Yurus: input.Yurus, Yanacaq: input.Yanacaq, Ban: input.Ban,
		Title: input.Title, Details: input.Details, Status: newStatus, Images: images,
	}, nil
}

func (r *pgRepository) DeleteProduct(ctx context.Context, productID int64) error {
	_, err := r.pool.Exec(ctx, `UPDATE avto444.user_products SET status = 'legv_edilib', updated_at = now() WHERE id = $1`, productID)
	return err
}

func (r *pgRepository) GetProductUserID(ctx context.Context, productID int64) (int64, error) {
	var userID int64
	err := r.pool.QueryRow(ctx, `SELECT user_id FROM avto444.user_products WHERE id = $1`, productID).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	return userID, err
}

func (r *pgRepository) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int) (*ProductImage, error) {
	var id int64
	err := r.pool.QueryRow(ctx,
		`INSERT INTO avto444.user_products_images (user_product_id, minio_url, s3_url, sira) VALUES ($1, $2, $3, $4) RETURNING id`,
		productID, minioURL, s3URL, sira,
	).Scan(&id)
	if err != nil {
		return nil, err
	}
	return &ProductImage{ID: id, MinioURL: minioURL, S3URL: s3URL, Sira: sira}, nil
}

func (r *pgRepository) ListPendingProducts(ctx context.Context) ([]Product, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, COALESCE(marka, ''), COALESCE(model, ''), COALESCE(il, 0),
		        COALESCE(qiymet, 0), COALESCE(yurus, 0), COALESCE(yanacaq, ''), COALESCE(ban, ''),
		        title, COALESCE(details, ''), status
		 FROM avto444.user_products WHERE status = 'gozlemede' ORDER BY id`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Product{}
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.ID, &p.UserID, &p.Marka, &p.Model, &p.Il, &p.Qiymet,
			&p.Yurus, &p.Yanacaq, &p.Ban, &p.Title, &p.Details, &p.Status); err != nil {
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

func (r *pgRepository) ApproveProduct(ctx context.Context, productID int64) error {
	_, err := r.pool.Exec(ctx, `UPDATE avto444.user_products SET status = 'saytda', updated_at = now() WHERE id = $1`, productID)
	return err
}

func (r *pgRepository) RejectProduct(ctx context.Context, productID int64) error {
	_, err := r.pool.Exec(ctx, `UPDATE avto444.user_products SET status = 'legv_edilib', updated_at = now() WHERE id = $1`, productID)
	return err
}
