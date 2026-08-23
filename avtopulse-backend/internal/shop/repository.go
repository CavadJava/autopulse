package shop

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

var ErrNotFound = errors.New("shop: not found")
var ErrDuplicate = errors.New("shop: name or email already in use")
var ErrInsufficientBalance = errors.New("shop: insufficient balance")

type Repository interface {
	ListShops(ctx context.Context) ([]ShopSummary, error)
	GetShopByName(ctx context.Context, name string) (*Shop, error)
	GetShopByID(ctx context.Context, id int64) (*Shop, error)
	GetShopByEmail(ctx context.Context, email string) (*Shop, error)
	CreateShop(ctx context.Context, input CreateShopInput) (*Shop, error)
	ListProducts(ctx context.Context, shopID int64, onlyStatus string) ([]Product, error)
	GetPasswordHash(ctx context.Context, shopID int64) (string, error)
	CreateProduct(ctx context.Context, shopID int64, input CreateProductInput) (*Product, error)
	AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int, kind string) (*ProductImage, error)
	GetProductShopID(ctx context.Context, productID int64) (int64, error)
	SetShopLogo(ctx context.Context, shopID int64, url string) error
	UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error)
	DeleteProduct(ctx context.Context, productID int64) error
	RestoreProduct(ctx context.Context, productID int64) error
	GetImageProductID(ctx context.Context, imageID int64) (int64, error)
	DeleteProductImage(ctx context.Context, imageID int64) error
	ListAllProducts(ctx context.Context) ([]Product, error)
	ListActiveProducts(ctx context.Context) ([]ProductWithShopName, error)
	IncrementViewCount(ctx context.Context, productID int64) error
	PromoteProduct(ctx context.Context, productID int64, tier string, price int) (*Product, error)
	UpdateShopProfile(ctx context.Context, shopID int64, address, contactName string) error
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
		`SELECT id, name, customer_id, title, COALESCE(details, ''), COALESCE(work_times, ''), COALESCE(logo_url, ''), email,
		        COALESCE(address, ''), COALESCE(contact_name, ''), created_at
		 FROM avto444.shop WHERE name = $1`,
		name,
	).Scan(&s.ID, &s.Name, &s.CustomerID, &s.Title, &s.Details, &s.WorkTimes, &s.LogoURL, &s.Email,
		&s.Address, &s.ContactName, &s.CreatedAt)
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
		`SELECT id, name, customer_id, title, COALESCE(details, ''), COALESCE(work_times, ''), COALESCE(logo_url, ''), email, balans,
		        COALESCE(address, ''), COALESCE(contact_name, ''), created_at
		 FROM avto444.shop WHERE id = $1`,
		id,
	).Scan(&s.ID, &s.Name, &s.CustomerID, &s.Title, &s.Details, &s.WorkTimes, &s.LogoURL, &s.Email, &s.Balans,
		&s.Address, &s.ContactName, &s.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *pgRepository) GetShopByEmail(ctx context.Context, email string) (*Shop, error) {
	var s Shop
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, customer_id, title, COALESCE(details, ''), COALESCE(work_times, ''), COALESCE(logo_url, ''), email,
		        COALESCE(address, ''), COALESCE(contact_name, ''), created_at
		 FROM avto444.shop WHERE email = $1`,
		email,
	).Scan(&s.ID, &s.Name, &s.CustomerID, &s.Title, &s.Details, &s.WorkTimes, &s.LogoURL, &s.Email,
		&s.Address, &s.ContactName, &s.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *pgRepository) CreateShop(ctx context.Context, input CreateShopInput) (*Shop, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	var id int64
	err = r.pool.QueryRow(ctx,
		`INSERT INTO avto444.shop (name, customer_id, title, password_hash, email)
		 VALUES ($1, 0, $2, $3, $4)
		 RETURNING id`,
		input.Name, input.Title, string(hash), input.Email,
	).Scan(&id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrDuplicate
		}
		return nil, err
	}

	return &Shop{ID: id, Name: input.Name, Title: input.Title, Email: input.Email}, nil
}

func (r *pgRepository) ListProducts(ctx context.Context, shopID int64, onlyStatus string) ([]Product, error) {
	query := `SELECT id, name, title, COALESCE(details, ''),
	                 COALESCE(marka, ''), COALESCE(model, ''), COALESCE(il, 0),
	                 COALESCE(qiymet, 0), COALESCE(yurus, 0), COALESCE(yanacaq, ''), COALESCE(ban, ''), status,
	                 details_json, view_count, vip_tier, qiymet_usd
	          FROM avto444.shop_products WHERE shop_id = $1`
	args := []any{shopID}
	if onlyStatus != "" {
		query += ` AND status = $2`
		args = append(args, onlyStatus)
	}
	query += ` ORDER BY id`

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Product{}
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.ID, &p.Name, &p.Title, &p.Details,
			&p.Marka, &p.Model, &p.Il, &p.Qiymet, &p.Yurus, &p.Yanacaq, &p.Ban, &p.Status,
			&p.DetailsJSON, &p.ViewCount, &p.VipTier, &p.QiymetUSD); err != nil {
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
		`SELECT id, minio_url, COALESCE(s3_url, ''), sira, kind FROM avto444.shop_product_images WHERE product_id = $1 ORDER BY sira, id`,
		productID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ProductImage{}
	for rows.Next() {
		var img ProductImage
		if err := rows.Scan(&img.ID, &img.MinioURL, &img.S3URL, &img.Sira, &img.Kind); err != nil {
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

func (r *pgRepository) CreateProduct(ctx context.Context, shopID int64, input CreateProductInput) (*Product, error) {
	shopRow, err := r.GetShopByID(ctx, shopID)
	if err != nil {
		return nil, err
	}

	details := map[string]any{}
	if len(input.DetailsJSON) > 0 {
		if err := json.Unmarshal(input.DetailsJSON, &details); err != nil {
			return nil, err
		}
	}
	// Server-side doldurulur — istifadəçinin göndərdiyi saxta dəyərlər əvəz olunur.
	details["satıcıAd"] = shopRow.Name
	details["satıcıZəng"] = ""
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		return nil, err
	}

	var id int64
	err = r.pool.QueryRow(ctx,
		`INSERT INTO avto444.shop_products (name, title, details, marka, model, il, qiymet, yurus, yanacaq, ban, shop_id, details_json, qiymet_usd)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		 RETURNING id`,
		input.Name, input.Title, input.Details, input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, shopID, detailsJSON, input.QiymetUSD,
	).Scan(&id)
	if err != nil {
		return nil, err
	}

	return &Product{
		ID:          id,
		Name:        input.Name,
		Title:       input.Title,
		Details:     input.Details,
		Marka:       input.Marka,
		Model:       input.Model,
		Il:          input.Il,
		Qiymet:      input.Qiymet,
		Yurus:       input.Yurus,
		Yanacaq:     input.Yanacaq,
		Ban:         input.Ban,
		Status:      "saytda",
		DetailsJSON: detailsJSON,
		VipTier:     "standart",
		QiymetUSD:   input.QiymetUSD,
		Images:      []ProductImage{},
	}, nil
}

func (r *pgRepository) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int, kind string) (*ProductImage, error) {
	var id int64
	err := r.pool.QueryRow(ctx,
		`INSERT INTO avto444.shop_product_images (product_id, minio_url, s3_url, sira, kind) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		productID, minioURL, s3URL, sira, kind,
	).Scan(&id)
	if err != nil {
		return nil, err
	}
	return &ProductImage{ID: id, MinioURL: minioURL, S3URL: s3URL, Sira: sira, Kind: kind}, nil
}

func (r *pgRepository) GetProductShopID(ctx context.Context, productID int64) (int64, error) {
	var shopID int64
	err := r.pool.QueryRow(ctx, `SELECT shop_id FROM avto444.shop_products WHERE id = $1`, productID).Scan(&shopID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	return shopID, err
}

func (r *pgRepository) SetShopLogo(ctx context.Context, shopID int64, url string) error {
	_, err := r.pool.Exec(ctx, `UPDATE avto444.shop SET logo_url = $1 WHERE id = $2`, url, shopID)
	return err
}

func (r *pgRepository) UpdateShopProfile(ctx context.Context, shopID int64, address, contactName string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE avto444.shop SET address = $1, contact_name = $2 WHERE id = $3`,
		address, contactName, shopID,
	)
	return err
}

func (r *pgRepository) UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error) {
	var status string
	var vipTier string
	err := r.pool.QueryRow(ctx,
		`UPDATE avto444.shop_products
		 SET name = $1, title = $2, details = $3, marka = $4, model = $5, il = $6, qiymet = $7, yurus = $8, yanacaq = $9, ban = $10,
		     details_json = details_json || $11::jsonb, qiymet_usd = $12
		 WHERE id = $13
		 RETURNING status, vip_tier`,
		input.Name, input.Title, input.Details, input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban,
		nonSellerFields(input.DetailsJSON), input.QiymetUSD, productID,
	).Scan(&status, &vipTier)
	if err != nil {
		return nil, err
	}

	images, err := r.listProductImages(ctx, productID)
	if err != nil {
		return nil, err
	}

	return &Product{
		ID: productID, Name: input.Name, Title: input.Title, Details: input.Details,
		Marka: input.Marka, Model: input.Model, Il: input.Il, Qiymet: input.Qiymet,
		Yurus: input.Yurus, Yanacaq: input.Yanacaq, Ban: input.Ban, Status: status,
		VipTier: vipTier, QiymetUSD: input.QiymetUSD, Images: images,
	}, nil
}

// nonSellerFields strips satıcıAd/satıcıZəng from a caller-supplied details
// blob before merging it into the stored JSONB via `||` — those two fields
// are server-owned and set only at CreateProduct time, never overwritable
// by an edit.
func nonSellerFields(raw json.RawMessage) json.RawMessage {
	details := map[string]any{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &details)
	}
	delete(details, "satıcıAd")
	delete(details, "satıcıZəng")
	out, _ := json.Marshal(details)
	return out
}

func (r *pgRepository) IncrementViewCount(ctx context.Context, productID int64) error {
	_, err := r.pool.Exec(ctx, `UPDATE avto444.shop_products SET view_count = view_count + 1 WHERE id = $1`, productID)
	return err
}

func (r *pgRepository) PromoteProduct(ctx context.Context, productID int64, tier string, price int) (*Product, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var shopID int64
	if err := tx.QueryRow(ctx, `SELECT shop_id FROM avto444.shop_products WHERE id = $1`, productID).Scan(&shopID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	var balans int
	if err := tx.QueryRow(ctx, `SELECT balans FROM avto444.shop WHERE id = $1 FOR UPDATE`, shopID).Scan(&balans); err != nil {
		return nil, err
	}
	if balans < price {
		return nil, ErrInsufficientBalance
	}

	if _, err := tx.Exec(ctx, `UPDATE avto444.shop SET balans = balans - $1 WHERE id = $2`, price, shopID); err != nil {
		return nil, err
	}

	// ireli_cek never changes vip_tier — it only deducts balance (mirrors the
	// mock system's promoTierToVipTier: ireli_cek maps to 'standart').
	newTier := tier
	if tier == "ireli_cek" {
		var currentTier string
		if err := tx.QueryRow(ctx, `SELECT vip_tier FROM avto444.shop_products WHERE id = $1`, productID).Scan(&currentTier); err != nil {
			return nil, err
		}
		newTier = currentTier
	} else {
		if _, err := tx.Exec(ctx, `UPDATE avto444.shop_products SET vip_tier = $1 WHERE id = $2`, tier, productID); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	images, err := r.listProductImages(ctx, productID)
	if err != nil {
		return nil, err
	}

	var p Product
	err = r.pool.QueryRow(ctx,
		`SELECT id, name, title, COALESCE(details, ''), COALESCE(marka, ''), COALESCE(model, ''), COALESCE(il, 0),
		        COALESCE(qiymet, 0), COALESCE(yurus, 0), COALESCE(yanacaq, ''), COALESCE(ban, ''), status,
		        details_json, view_count
		 FROM avto444.shop_products WHERE id = $1`,
		productID,
	).Scan(&p.ID, &p.Name, &p.Title, &p.Details, &p.Marka, &p.Model, &p.Il,
		&p.Qiymet, &p.Yurus, &p.Yanacaq, &p.Ban, &p.Status, &p.DetailsJSON, &p.ViewCount)
	if err != nil {
		return nil, err
	}
	p.VipTier = newTier
	p.Images = images
	return &p, nil
}

func (r *pgRepository) DeleteProduct(ctx context.Context, productID int64) error {
	_, err := r.pool.Exec(ctx, `UPDATE avto444.shop_products SET status = 'legv_edilib' WHERE id = $1`, productID)
	return err
}

func (r *pgRepository) RestoreProduct(ctx context.Context, productID int64) error {
	_, err := r.pool.Exec(ctx, `UPDATE avto444.shop_products SET status = 'saytda' WHERE id = $1`, productID)
	return err
}

func (r *pgRepository) GetImageProductID(ctx context.Context, imageID int64) (int64, error) {
	var productID int64
	err := r.pool.QueryRow(ctx, `SELECT product_id FROM avto444.shop_product_images WHERE id = $1`, imageID).Scan(&productID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	return productID, err
}

func (r *pgRepository) DeleteProductImage(ctx context.Context, imageID int64) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM avto444.shop_product_images WHERE id = $1`, imageID)
	return err
}

func (r *pgRepository) ListAllProducts(ctx context.Context) ([]Product, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name, title, COALESCE(details, ''),
		        COALESCE(marka, ''), COALESCE(model, ''), COALESCE(il, 0),
		        COALESCE(qiymet, 0), COALESCE(yurus, 0), COALESCE(yanacaq, ''), COALESCE(ban, ''), status,
		        details_json, view_count, vip_tier, qiymet_usd
		 FROM avto444.shop_products ORDER BY id`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Product{}
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.ID, &p.Name, &p.Title, &p.Details,
			&p.Marka, &p.Model, &p.Il, &p.Qiymet, &p.Yurus, &p.Yanacaq, &p.Ban, &p.Status,
			&p.DetailsJSON, &p.ViewCount, &p.VipTier, &p.QiymetUSD); err != nil {
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

func (r *pgRepository) ListActiveProducts(ctx context.Context) ([]ProductWithShopName, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT sp.id, sp.name, sp.title, COALESCE(sp.details, ''),
		        COALESCE(sp.marka, ''), COALESCE(sp.model, ''), COALESCE(sp.il, 0),
		        COALESCE(sp.qiymet, 0), COALESCE(sp.yurus, 0), COALESCE(sp.yanacaq, ''), COALESCE(sp.ban, ''), sp.status,
		        sp.details_json, sp.view_count, sp.vip_tier, sp.qiymet_usd,
		        s.name
		 FROM avto444.shop_products sp
		 JOIN avto444.shop s ON s.id = sp.shop_id
		 WHERE sp.status = 'saytda'
		 ORDER BY sp.id`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ProductWithShopName{}
	for rows.Next() {
		var p ProductWithShopName
		if err := rows.Scan(&p.ID, &p.Name, &p.Title, &p.Details,
			&p.Marka, &p.Model, &p.Il, &p.Qiymet, &p.Yurus, &p.Yanacaq, &p.Ban, &p.Status,
			&p.DetailsJSON, &p.ViewCount, &p.VipTier, &p.QiymetUSD,
			&p.ShopName); err != nil {
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
