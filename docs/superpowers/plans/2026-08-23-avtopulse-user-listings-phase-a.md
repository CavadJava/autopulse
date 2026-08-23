# AutoPulse User Listings + Superadmin Moderation (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an individual (fərdi) user register/log in by phone (OTP), create/edit/cancel car listings that go through superadmin moderation (gözləmədə → saytda / legv_edilib), and let a separate superadmin log in and approve/reject those listings — plus view and cancel shop listings.

**Architecture:** Two brand-new, fully independent Go packages parallel to the existing `internal/shop`/`internal/auth`: `internal/user` (user accounts, OTP-based session auth, user-owned car listings — same repository/handler/session-store shape as `internal/shop`/`internal/auth`) and `internal/admin` (a single, simple env-credential-based superadmin login that moderates `user_products` and can also view/cancel `shop_products` via the existing `shop.Repository`). No table or cookie is shared between `user`/`shop`/`admin`. This phase does NOT include the real-time expiry ticker, the public unified listings feed, or profile/stats/cards/balance — those are separate follow-on phases per the approved spec's phasing.

**Tech Stack:** Go 1.26.5, `chi`, `pgx/v5` (existing — no new dependencies), React 18 + TypeScript (existing conventions).

## Global Constraints

- Full design reference: `docs/superpowers/specs/2026-08-23-avtopulse-user-listings-moderation-design.md`. This plan implements ONLY the "İstifadəçi (user_session)" and "Superadmin" API sections (points 1-20 in that spec) — NOT the "Mağaza tərəfi" profile/stats/cards/balance additions (points 21-25), NOT the public unified feed (points 26-28), and NOT the real-time expiry ticker. Those are separate, later plans.
- New handlers MUST be named methods on their handler structs, never inline closures — a real Phase 1 bug: `swag` (Swagger doc generator) cannot attach `@Router` annotations to anonymous closures, silently producing an empty API spec.
- Every mutating, ownership-scoped endpoint MUST follow the exact pattern already proven in `internal/auth/handler.go`'s `UpdateProduct`/`DeleteProduct`/`RestoreProduct`/`DeleteProductImage`: resolve the authenticated ID via a session-lookup helper → parse the resource ID from the URL → call a `GetXxxOwnerID`-style repository method → compare against the authenticated ID → 404 (not 403) on mismatch or not-found → only then proceed. The superadmin's `internal/admin` handlers are the one exception — superadmin has no ownership scoping, it acts on any row by ID directly.
- Every nullable/optional SQL column read must use `COALESCE(col, '')` (or `0` for ints) — a real, previously-hit bug class where `pgx` cannot scan SQL `NULL` into non-pointer Go strings/ints.
- Every backend task must end with `go build ./...` and `go test ./...` passing (run from `avtopulse-backend/`). Every frontend task must end with `npx tsc -b --noEmit` (NOT plain `npx tsc --noEmit` — this repo's composite tsconfig makes the non-build form silently check nothing) and `npm run build` passing, plus the standing corruption scan (`grep -rn 'Ɛ\|Ɔ'` across touched files) before any commit.
- Follow the existing deploy workflow: backend via rsync + `go build` on server + systemd env var update + `systemctl restart avtopulse-backend`; frontend via `git push origin main` + `bash deploy/deploy.sh` from `/Users/frontend/workspace/me-github/autopulse`. Frontend `npx tsc -b`/`npm run build` commands must be run from the repo root, not `avtopulse-backend/` — a real, previously-hit mistake in this project.
- Do not touch the 10+ real demo shop products (`bmw-320i`, `mercedes-e200`, `toyota-camry`, `hyundai-sonata`, `kia-sportage`, `nissan-altima`, `volkswagen-golf`, `toyota-rav4`, `honda-civic`, `mazda-cx5`, and any others found live) or the real `avto444` shop account during any live verification — always create disposable test data instead.
- The OTP code is a fixed test value, `"1234"`, exactly as specced — no real SMS integration in this phase.
- Session table is named `avto444.user_sessions` (plural, matching the existing `avto444.shop_sessions` convention — NOT `user_session` singular as an early draft of the spec suggested; the existing codebase's actual table is `shop_sessions`, so `user_sessions` is the consistent name), with columns `token TEXT PRIMARY KEY, user_id BIGINT, created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ` — mirroring `avto444.shop_sessions` exactly (see `internal/auth/session.go`).

---

## Task 1: Database migration — user, user_sessions, user_products, user_products_images

**Files:**
- Create: `avtopulse-backend/migrations/0006_user_schema.sql`

**Interfaces:**
- Consumes: nothing new.
- Produces: 4 new tables in the `avto444` schema, ready for `internal/user`'s repository layer (Task 2) to read/write.

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE avto444.user (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT NOT NULL DEFAULT '',
    phone      TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.user_sessions (
    token      TEXT PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES avto444.user(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE avto444.user_products (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES avto444.user(id),
    marka      TEXT NOT NULL DEFAULT '',
    model      TEXT NOT NULL DEFAULT '',
    il         INT NOT NULL DEFAULT 0,
    qiymet     INT NOT NULL DEFAULT 0,
    yurus      INT NOT NULL DEFAULT 0,
    yanacaq    TEXT NOT NULL DEFAULT '',
    ban        TEXT NOT NULL DEFAULT '',
    title      TEXT NOT NULL DEFAULT '',
    details    TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'gozlemede' CHECK (status IN ('gozlemede', 'saytda', 'legv_edilib')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.user_products_images (
    id              BIGSERIAL PRIMARY KEY,
    user_product_id BIGINT NOT NULL REFERENCES avto444.user_products(id),
    minio_url       TEXT NOT NULL,
    s3_url          TEXT,
    sira            INT NOT NULL DEFAULT 0
);
```

Note: `status` here does NOT yet include `'muddeti_basa_catmis'` — that value, along with `expires_at`/`view_count`/`contact_count` columns, is added in the later expiry-ticker phase, not this one. Keep this migration scoped to exactly what Phase A needs.

Save as `avtopulse-backend/migrations/0006_user_schema.sql`.

- [ ] **Step 2: Verify the migration applies cleanly (no local Postgres test DSN available in this environment — this will be verified for real at deploy time via the server's automatic migration runner). For now, just confirm the SQL is syntactically valid by eye against the `0001_init_schema.sql`/`0005_shop_products_status.sql` conventions (matching column types, matching CHECK constraint style, matching FK style).**

- [ ] **Step 3: Commit**

```bash
git add avtopulse-backend/migrations/0006_user_schema.sql
git commit -m "feat: add user, user_sessions, user_products, user_products_images tables"
```

---

## Task 2: `internal/user` package — model, repository, session store

**Files:**
- Create: `avtopulse-backend/internal/user/model.go`
- Create: `avtopulse-backend/internal/user/repository.go`
- Create: `avtopulse-backend/internal/user/session.go`
- Create: `avtopulse-backend/internal/user/repository_test.go` (fake-repo based unit tests, no real DB)

**Interfaces:**
- Consumes: `avto444.user`/`user_sessions`/`user_products`/`user_products_images` tables (Task 1).
- Produces: `user.Repository` interface, `user.SessionStore` interface, `user.User{ID, Name, Phone}`, `user.Product{ID, UserID, Marka, Model, Il, Qiymet, Yurus, Yanacaq, Ban, Title, Details, Status, Images []ProductImage}`, `user.ProductImage{ID, MinioURL, S3URL, Sira}`, `user.CreateProductInput`.

- [ ] **Step 1: Write `internal/user/model.go`**

```go
package user

type User struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Phone string `json:"phone"`
}

type ProductImage struct {
	ID       int64  `json:"id"`
	MinioURL string `json:"minioUrl"`
	S3URL    string `json:"s3Url"`
	Sira     int    `json:"sira"`
}

type Product struct {
	ID      int64  `json:"id"`
	UserID  int64  `json:"userId"`
	Marka   string `json:"marka"`
	Model   string `json:"model"`
	Il      int    `json:"il"`
	Qiymet  int    `json:"qiymet"`
	Yurus   int    `json:"yurus"`
	Yanacaq string `json:"yanacaq"`
	Ban     string `json:"ban"`
	Title   string `json:"title"`
	Details string `json:"details"`
	Status  string `json:"status"`

	Images []ProductImage `json:"images"`
}

type CreateProductInput struct {
	Marka   string `json:"marka"`
	Model   string `json:"model"`
	Il      int    `json:"il"`
	Qiymet  int    `json:"qiymet"`
	Yurus   int    `json:"yurus"`
	Yanacaq string `json:"yanacaq"`
	Ban     string `json:"ban"`
	Title   string `json:"title"`
	Details string `json:"details"`
}
```

- [ ] **Step 2: Write `internal/user/repository.go`**

```go
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
```

- [ ] **Step 3: Write `internal/user/session.go`** — copy the exact shape of `internal/auth/session.go`, renamed to this package and table:

```go
package user

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrSessionNotFound = errors.New("user: session not found or expired")

const sessionTTL = 7 * 24 * time.Hour

type SessionStore interface {
	Create(ctx context.Context, userID int64) (string, error)
	Lookup(ctx context.Context, token string) (int64, error)
	Delete(ctx context.Context, token string) error
}

type pgSessionStore struct {
	pool *pgxpool.Pool
}

func NewSessionStore(pool *pgxpool.Pool) SessionStore {
	return &pgSessionStore{pool: pool}
}

func (s *pgSessionStore) Create(ctx context.Context, userID int64) (string, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", err
	}
	token := hex.EncodeToString(tokenBytes)

	_, err := s.pool.Exec(ctx,
		`INSERT INTO avto444.user_sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
		token, userID, time.Now().Add(sessionTTL),
	)
	if err != nil {
		return "", err
	}
	return token, nil
}

func (s *pgSessionStore) Lookup(ctx context.Context, token string) (int64, error) {
	var userID int64
	var expiresAt time.Time
	err := s.pool.QueryRow(ctx,
		`SELECT user_id, expires_at FROM avto444.user_sessions WHERE token = $1`,
		token,
	).Scan(&userID, &expiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrSessionNotFound
	}
	if err != nil {
		return 0, err
	}
	if time.Now().After(expiresAt) {
		return 0, ErrSessionNotFound
	}
	return userID, nil
}

func (s *pgSessionStore) Delete(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM avto444.user_sessions WHERE token = $1`, token)
	return err
}
```

- [ ] **Step 4: Write `internal/user/repository_test.go`** — a `fakeRepo` covering the interface (mirroring `internal/shop/handler_test.go`'s `fakeRepo` pattern) plus tests for the status-transition logic in `UpdateProduct` (this is pure Go logic worth unit-testing directly, not just through HTTP):

```go
package user

import (
	"context"
	"testing"
)

type fakeRepo struct {
	products map[int64]Product
	nextID   int64
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{products: map[int64]Product{}, nextID: 1}
}

func (f *fakeRepo) FindOrCreateByPhone(ctx context.Context, phone string) (*User, error) {
	return &User{ID: 1, Phone: phone}, nil
}

func (f *fakeRepo) ListMyProducts(ctx context.Context, userID int64) ([]Product, error) {
	out := []Product{}
	for _, p := range f.products {
		if p.UserID == userID {
			out = append(out, p)
		}
	}
	return out, nil
}

func (f *fakeRepo) CreateProduct(ctx context.Context, userID int64, input CreateProductInput) (*Product, error) {
	id := f.nextID
	f.nextID++
	p := Product{
		ID: id, UserID: userID, Marka: input.Marka, Model: input.Model, Il: input.Il,
		Qiymet: input.Qiymet, Yurus: input.Yurus, Yanacaq: input.Yanacaq, Ban: input.Ban,
		Title: input.Title, Details: input.Details, Status: "gozlemede", Images: []ProductImage{},
	}
	f.products[id] = p
	return &p, nil
}

func (f *fakeRepo) UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error) {
	p, ok := f.products[productID]
	if !ok {
		return nil, ErrNotFound
	}
	newStatus := p.Status
	if p.Status == "legv_edilib" {
		newStatus = "gozlemede"
	}
	p.Marka, p.Model, p.Il, p.Qiymet, p.Yurus, p.Yanacaq, p.Ban, p.Title, p.Details, p.Status =
		input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, input.Title, input.Details, newStatus
	f.products[productID] = p
	return &p, nil
}

func (f *fakeRepo) DeleteProduct(ctx context.Context, productID int64) error {
	p, ok := f.products[productID]
	if !ok {
		return ErrNotFound
	}
	p.Status = "legv_edilib"
	f.products[productID] = p
	return nil
}

func (f *fakeRepo) GetProductUserID(ctx context.Context, productID int64) (int64, error) {
	p, ok := f.products[productID]
	if !ok {
		return 0, ErrNotFound
	}
	return p.UserID, nil
}

func (f *fakeRepo) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int) (*ProductImage, error) {
	return &ProductImage{ID: int64(sira + 1), MinioURL: minioURL, S3URL: s3URL, Sira: sira}, nil
}

func TestCreateProduct_StartsAsGozlemede(t *testing.T) {
	repo := newFakeRepo()
	p, err := repo.CreateProduct(context.Background(), 1, CreateProductInput{Marka: "Toyota", Title: "Test"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Status != "gozlemede" {
		t.Fatalf("expected status gozlemede, got %q", p.Status)
	}
}

func TestUpdateProduct_LegvEdilib_GoesBackToGozlemede(t *testing.T) {
	repo := newFakeRepo()
	repo.products[1] = Product{ID: 1, UserID: 1, Status: "legv_edilib"}

	updated, err := repo.UpdateProduct(context.Background(), 1, CreateProductInput{Title: "Updated"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Status != "gozlemede" {
		t.Fatalf("expected status to reset to gozlemede after editing a legv_edilib product, got %q", updated.Status)
	}
}

func TestUpdateProduct_Saytda_StaysUnchanged(t *testing.T) {
	repo := newFakeRepo()
	repo.products[1] = Product{ID: 1, UserID: 1, Status: "saytda"}

	updated, err := repo.UpdateProduct(context.Background(), 1, CreateProductInput{Title: "Updated"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Status != "saytda" {
		t.Fatalf("expected status to remain saytda when editing an already-approved product, got %q", updated.Status)
	}
}

func TestDeleteProduct_SetsLegvEdilib(t *testing.T) {
	repo := newFakeRepo()
	repo.products[1] = Product{ID: 1, UserID: 1, Status: "saytda"}

	if err := repo.DeleteProduct(context.Background(), 1); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.products[1].Status != "legv_edilib" {
		t.Fatalf("expected status legv_edilib after delete, got %q", repo.products[1].Status)
	}
}
```

- [ ] **Step 5: Run tests**

```bash
cd avtopulse-backend
go build ./internal/user/...
go test ./internal/user/... -v
```

Expected: all pass. Note this package does not yet depend on anything else, so it should build in full isolation.

- [ ] **Step 6: Commit**

```bash
git add avtopulse-backend/internal/user
git commit -m "feat: internal/user package — model, repository, session store"
```

---

## Task 3: `internal/user` HTTP handlers — OTP login, product CRUD, image upload

**Files:**
- Create: `avtopulse-backend/internal/user/handler.go`
- Create: `avtopulse-backend/internal/user/handler_test.go`

**Interfaces:**
- Consumes: `user.Repository`, `user.SessionStore` (Task 2), `storage.Client` (existing, from `internal/storage`).
- Produces: `user.NewHandler(repo Repository, sessions SessionStore, storageClient storage.Client) http.Handler` mounting all 8 routes listed below.

- [ ] **Step 1: Write `internal/user/handler.go`**

```go
package user

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strconv"

	"github.com/CavadJava/avtopulse-backend/internal/storage"
	"github.com/go-chi/chi/v5"
)

const cookieName = "user_session"
const otpTestCode = "1234"

type userHandlers struct {
	repo     Repository
	sessions SessionStore
	storage  storage.Client
}

func NewHandler(repo Repository, sessions SessionStore, storageClient storage.Client) http.Handler {
	h := &userHandlers{repo: repo, sessions: sessions, storage: storageClient}
	r := chi.NewRouter()

	r.Post("/otp/request", h.RequestOTP)
	r.Post("/otp/verify", h.VerifyOTP)
	r.Post("/logout", h.Logout)
	r.Get("/me/products", h.MeProducts)
	r.Post("/me/products", h.CreateProduct)
	r.Put("/me/products/{id}", h.UpdateProduct)
	r.Delete("/me/products/{id}", h.DeleteProduct)
	r.Post("/me/products/{id}/images", h.UploadProductImages)

	return r
}

type otpRequestBody struct {
	Phone string `json:"phone"`
}

// RequestOTP godoc
// @Summary      Request an OTP code for phone-based login
// @Description  Always succeeds — no real SMS is sent in this environment; the test code is a fixed value.
// @Tags         user
// @Accept       json
// @Produce      json
// @Param        body  body      otpRequestBody  true  "Phone number"
// @Success      200   {object}  map[string]bool
// @Failure      400   {string}  string  "invalid request body"
// @Router       /otp/request [post]
func (h *userHandlers) RequestOTP(w http.ResponseWriter, req *http.Request) {
	var body otpRequestBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Phone == "" {
		http.Error(w, "phone is required", http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
}

type otpVerifyBody struct {
	Phone string `json:"phone"`
	Code  string `json:"code"`
}

type otpVerifyResponse struct {
	User User `json:"user"`
}

// VerifyOTP godoc
// @Summary      Verify an OTP code and log in (or auto-register) by phone
// @Description  Test code is a fixed value ("1234") — no real SMS/OTP provider. Creates a new user account automatically on first login. Sets a user_session HttpOnly cookie on success.
// @Tags         user
// @Accept       json
// @Produce      json
// @Param        body  body      otpVerifyBody  true  "Phone number and OTP code"
// @Success      200   {object}  otpVerifyResponse
// @Failure      400   {string}  string  "invalid request body"
// @Failure      401   {string}  string  "invalid code"
// @Failure      500   {string}  string  "internal error"
// @Router       /otp/verify [post]
func (h *userHandlers) VerifyOTP(w http.ResponseWriter, req *http.Request) {
	var body otpVerifyBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Code != otpTestCode {
		http.Error(w, "invalid code", http.StatusUnauthorized)
		return
	}

	u, err := h.repo.FindOrCreateByPhone(req.Context(), body.Phone)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	token, err := h.sessions.Create(req.Context(), u.ID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   7 * 24 * 60 * 60,
	})

	writeJSON(w, http.StatusOK, otpVerifyResponse{User: *u})
}

// Logout godoc
// @Summary      Log out the current user session
// @Tags         user
// @Success      200  {string}  string  "ok"
// @Failure      500  {string}  string  "internal error"
// @Router       /logout [post]
func (h *userHandlers) Logout(w http.ResponseWriter, req *http.Request) {
	cookie, err := req.Cookie(cookieName)
	if err == nil {
		if delErr := h.sessions.Delete(req.Context(), cookie.Value); delErr != nil {
			log.Printf("user: failed to delete session: %v", delErr)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusOK)
}

// MeProducts godoc
// @Summary      List the logged-in user's own listings, any status
// @Description  Requires a valid user_session cookie.
// @Tags         user
// @Produce      json
// @Success      200  {array}   Product
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /me/products [get]
func (h *userHandlers) MeProducts(w http.ResponseWriter, req *http.Request) {
	userID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	products, err := h.repo.ListMyProducts(req.Context(), userID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, products)
}

type createProductRequest struct {
	Marka   string `json:"marka"`
	Model   string `json:"model"`
	Il      int    `json:"il"`
	Qiymet  int    `json:"qiymet"`
	Yurus   int    `json:"yurus"`
	Yanacaq string `json:"yanacaq"`
	Ban     string `json:"ban"`
	Title   string `json:"title"`
	Details string `json:"details"`
}

// CreateProduct godoc
// @Summary      Create a new listing for the logged-in user
// @Description  Requires a valid user_session cookie. New listings start in 'gozlemede' (pending moderation).
// @Tags         user
// @Accept       json
// @Produce      json
// @Param        body  body      createProductRequest  true  "New listing details"
// @Success      201   {object}  Product
// @Failure      400   {string}  string  "invalid request body"
// @Failure      401   {string}  string  "unauthorized"
// @Failure      500   {string}  string  "internal error"
// @Router       /me/products [post]
func (h *userHandlers) CreateProduct(w http.ResponseWriter, req *http.Request) {
	userID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var body createProductRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	product, err := h.repo.CreateProduct(req.Context(), userID, CreateProductInput{
		Marka: body.Marka, Model: body.Model, Il: body.Il, Qiymet: body.Qiymet,
		Yurus: body.Yurus, Yanacaq: body.Yanacaq, Ban: body.Ban, Title: body.Title, Details: body.Details,
	})
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, product)
}

// UpdateProduct godoc
// @Summary      Update a listing owned by the logged-in user
// @Description  Requires a valid user_session cookie. The listing must belong to the authenticated user. Editing a legv_edilib listing sends it back to gozlemede for re-moderation.
// @Tags         user
// @Accept       json
// @Produce      json
// @Param        id    path      int                    true  "Product id"
// @Param        body  body      createProductRequest   true  "Updated listing details"
// @Success      200   {object}  Product
// @Failure      400   {string}  string  "invalid product id or request body"
// @Failure      401   {string}  string  "unauthorized"
// @Failure      404   {string}  string  "listing not found or not owned by this user"
// @Failure      500   {string}  string  "internal error"
// @Router       /me/products/{id} [put]
func (h *userHandlers) UpdateProduct(w http.ResponseWriter, req *http.Request) {
	userID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}

	ownerUserID, err := h.repo.GetProductUserID(req.Context(), productID)
	if errors.Is(err, ErrNotFound) || ownerUserID != userID {
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	var body createProductRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	product, err := h.repo.UpdateProduct(req.Context(), productID, CreateProductInput{
		Marka: body.Marka, Model: body.Model, Il: body.Il, Qiymet: body.Qiymet,
		Yurus: body.Yurus, Yanacaq: body.Yanacaq, Ban: body.Ban, Title: body.Title, Details: body.Details,
	})
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, product)
}

// DeleteProduct godoc
// @Summary      Cancel (soft-delete) a listing owned by the logged-in user
// @Description  Requires a valid user_session cookie. Sets status to legv_edilib — does not remove the row.
// @Tags         user
// @Produce      json
// @Param        id  path  int  true  "Product id"
// @Success      200  {object}  map[string]bool
// @Failure      400  {string}  string  "invalid product id"
// @Failure      401  {string}  string  "unauthorized"
// @Failure      404  {string}  string  "listing not found or not owned by this user"
// @Failure      500  {string}  string  "internal error"
// @Router       /me/products/{id} [delete]
func (h *userHandlers) DeleteProduct(w http.ResponseWriter, req *http.Request) {
	userID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}

	ownerUserID, err := h.repo.GetProductUserID(req.Context(), productID)
	if errors.Is(err, ErrNotFound) || ownerUserID != userID {
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if err := h.repo.DeleteProduct(req.Context(), productID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// UploadProductImages godoc
// @Summary      Upload one or more images for a listing
// @Description  Requires a valid user_session cookie. The listing must belong to the authenticated user.
// @Tags         user
// @Accept       multipart/form-data
// @Produce      json
// @Param        id      path      int   true  "Product id"
// @Param        images  formData  file  true  "One or more image files"
// @Success      200     {array}   ProductImage
// @Failure      400     {string}  string  "invalid product id or no files"
// @Failure      401     {string}  string  "unauthorized"
// @Failure      404     {string}  string  "listing not found or not owned by this user"
// @Failure      500     {string}  string  "internal error"
// @Router       /me/products/{id}/images [post]
func (h *userHandlers) UploadProductImages(w http.ResponseWriter, req *http.Request) {
	userID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}

	ownerUserID, err := h.repo.GetProductUserID(req.Context(), productID)
	if errors.Is(err, ErrNotFound) || ownerUserID != userID {
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if err := req.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "invalid multipart form", http.StatusBadRequest)
		return
	}
	files := req.MultipartForm.File["images"]
	if len(files) == 0 {
		http.Error(w, "no files provided", http.StatusBadRequest)
		return
	}

	var results []ProductImage
	for i, fh := range files {
		f, err := fh.Open()
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		ext := filepath.Ext(fh.Filename)
		objectPath := fmt.Sprintf("user/%d/product/%d/%s%s", userID, productID, uuidV4(), ext)
		minioURL, s3URL, err := h.storage.UploadDual(req.Context(), objectPath, f, fh.Size, fh.Header.Get("Content-Type"))
		f.Close()
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		img, err := h.repo.AddProductImage(req.Context(), productID, minioURL, s3URL, i)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		results = append(results, *img)
	}

	writeJSON(w, http.StatusOK, results)
}

func uuidV4() string {
	b := make([]byte, 16)
	rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func requireSession(req *http.Request, sessions SessionStore) (int64, error) {
	cookie, err := req.Cookie(cookieName)
	if err != nil {
		return 0, ErrSessionNotFound
	}
	return sessions.Lookup(req.Context(), cookie.Value)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
```

- [ ] **Step 2: Write `internal/user/handler_test.go`** — mirroring `internal/auth/handler_test.go`'s fakes/test shape exactly:

```go
package user

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeUserRepo struct {
	products map[int64]Product
	nextID   int64
}

func newFakeUserRepo() *fakeUserRepo {
	return &fakeUserRepo{products: map[int64]Product{}, nextID: 100}
}

func (f *fakeUserRepo) FindOrCreateByPhone(ctx context.Context, phone string) (*User, error) {
	return &User{ID: 1, Phone: phone}, nil
}

func (f *fakeUserRepo) ListMyProducts(ctx context.Context, userID int64) ([]Product, error) {
	out := []Product{}
	for _, p := range f.products {
		if p.UserID == userID {
			out = append(out, p)
		}
	}
	return out, nil
}

func (f *fakeUserRepo) CreateProduct(ctx context.Context, userID int64, input CreateProductInput) (*Product, error) {
	id := f.nextID
	f.nextID++
	p := Product{ID: id, UserID: userID, Marka: input.Marka, Title: input.Title, Status: "gozlemede", Images: []ProductImage{}}
	f.products[id] = p
	return &p, nil
}

func (f *fakeUserRepo) UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error) {
	p, ok := f.products[productID]
	if !ok {
		return nil, ErrNotFound
	}
	p.Title = input.Title
	f.products[productID] = p
	return &p, nil
}

func (f *fakeUserRepo) DeleteProduct(ctx context.Context, productID int64) error {
	p, ok := f.products[productID]
	if !ok {
		return ErrNotFound
	}
	p.Status = "legv_edilib"
	f.products[productID] = p
	return nil
}

func (f *fakeUserRepo) GetProductUserID(ctx context.Context, productID int64) (int64, error) {
	p, ok := f.products[productID]
	if !ok {
		return 0, ErrNotFound
	}
	return p.UserID, nil
}

func (f *fakeUserRepo) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int) (*ProductImage, error) {
	return &ProductImage{ID: int64(sira + 1), MinioURL: minioURL, S3URL: s3URL, Sira: sira}, nil
}

type fakeStorageClient struct{}

func (f *fakeStorageClient) Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, error) {
	return "http://fake-storage/" + path, nil
}

func (f *fakeStorageClient) UploadDual(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, string, error) {
	return "http://fake-storage/" + path, "http://fake-s3/" + path, nil
}

type fakeSessionStore struct {
	tokenToUser map[string]int64
	deleteFails bool
}

func newFakeSessionStore() *fakeSessionStore {
	return &fakeSessionStore{tokenToUser: map[string]int64{}}
}

func (f *fakeSessionStore) Create(ctx context.Context, userID int64) (string, error) {
	token := "test-token"
	f.tokenToUser[token] = userID
	return token, nil
}

func (f *fakeSessionStore) Lookup(ctx context.Context, token string) (int64, error) {
	id, ok := f.tokenToUser[token]
	if !ok {
		return 0, ErrSessionNotFound
	}
	return id, nil
}

func (f *fakeSessionStore) Delete(ctx context.Context, token string) error {
	if f.deleteFails {
		return errors.New("delete failed")
	}
	delete(f.tokenToUser, token)
	return nil
}

func TestVerifyOTP_CorrectCode_SetsCookie(t *testing.T) {
	h := NewHandler(newFakeUserRepo(), newFakeSessionStore(), &fakeStorageClient{})
	body, _ := json.Marshal(otpVerifyBody{Phone: "0501234567", Code: "1234"})
	req := httptest.NewRequest(http.MethodPost, "/otp/verify", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
	found := false
	for _, c := range rec.Result().Cookies() {
		if c.Name == cookieName {
			found = true
		}
	}
	if !found {
		t.Fatal("expected user_session cookie to be set")
	}
}

func TestVerifyOTP_WrongCode_Unauthorized(t *testing.T) {
	h := NewHandler(newFakeUserRepo(), newFakeSessionStore(), &fakeStorageClient{})
	body, _ := json.Marshal(otpVerifyBody{Phone: "0501234567", Code: "0000"})
	req := httptest.NewRequest(http.MethodPost, "/otp/verify", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestMeProducts_NoCookie(t *testing.T) {
	h := NewHandler(newFakeUserRepo(), newFakeSessionStore(), &fakeStorageClient{})
	req := httptest.NewRequest(http.MethodGet, "/me/products", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestCreateProduct_Success(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(newFakeUserRepo(), sessions, &fakeStorageClient{})
	body, _ := json.Marshal(createProductRequest{Marka: "Toyota", Title: "Camry"})
	req := httptest.NewRequest(http.MethodPost, "/me/products", bytes.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d, body: %s", rec.Code, rec.Body.String())
	}
	var got Product
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if got.Status != "gozlemede" {
		t.Fatalf("expected new listing to start as gozlemede, got %q", got.Status)
	}
}

func TestUpdateProduct_WrongUser(t *testing.T) {
	repo := newFakeUserRepo()
	repo.products[100] = Product{ID: 100, UserID: 1, Status: "saytda"}

	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 999) // a user that doesn't own product 100

	h := NewHandler(repo, sessions, &fakeStorageClient{})
	body, _ := json.Marshal(createProductRequest{Title: "x"})
	req := httptest.NewRequest(http.MethodPut, "/me/products/100", bytes.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteProduct_Success(t *testing.T) {
	repo := newFakeUserRepo()
	repo.products[100] = Product{ID: 100, UserID: 1, Status: "saytda"}

	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(repo, sessions, &fakeStorageClient{})
	req := httptest.NewRequest(http.MethodDelete, "/me/products/100", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
	if repo.products[100].Status != "legv_edilib" {
		t.Fatalf("expected status legv_edilib after delete, got %q", repo.products[100].Status)
	}
}

func TestUploadProductImages_Success(t *testing.T) {
	repo := newFakeUserRepo()
	repo.products[100] = Product{ID: 100, UserID: 1, Status: "saytda"}

	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(repo, sessions, &fakeStorageClient{})

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("images", "test.jpg")
	fw.Write([]byte("fake image bytes"))
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/me/products/100/images", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
	var got []ProductImage
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(got) != 1 || got[0].MinioURL == "" || got[0].S3URL == "" {
		t.Fatalf("unexpected result: %+v", got)
	}
}
```

- [ ] **Step 3: Run tests**

```bash
cd avtopulse-backend
go build ./internal/user/...
go test ./internal/user/... -v
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add avtopulse-backend/internal/user
git commit -m "feat: internal/user HTTP handlers — OTP login, product CRUD, image upload"
```

---

## Task 4: `internal/admin` package — superadmin login, moderation, shop oversight

**Files:**
- Create: `avtopulse-backend/internal/admin/handler.go`
- Create: `avtopulse-backend/internal/admin/handler_test.go`
- Modify: `avtopulse-backend/internal/shop/repository.go` (add `ListAllProducts`)

**Interfaces:**
- Consumes: `user.Repository` (needs `ListPendingProducts`, `ApproveProduct`, `RejectProduct` — new methods added in this task), `shop.Repository` (existing `DeleteProduct`, plus new `ListAllProducts`).
- Produces: `admin.NewHandler(userRepo user.Repository, shopRepo shop.Repository, adminUsername, adminPassword string) http.Handler` mounting 7 routes.

- [ ] **Step 1: Add 3 new methods to `user.Repository` (in `internal/user/repository.go`, extending Task 2's file) — these are admin-moderation methods that live on the user package's repository since they operate on `user_products`**

Add to the `Repository` interface:

```go
	ListPendingProducts(ctx context.Context) ([]Product, error)
	ApproveProduct(ctx context.Context, productID int64) error
	RejectProduct(ctx context.Context, productID int64) error
```

Add implementations:

```go
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
```

Update the `fakeRepo` in `internal/user/repository_test.go` to implement these 3 methods too (append after the existing fake methods):

```go
func (f *fakeRepo) ListPendingProducts(ctx context.Context) ([]Product, error) {
	out := []Product{}
	for _, p := range f.products {
		if p.Status == "gozlemede" {
			out = append(out, p)
		}
	}
	return out, nil
}

func (f *fakeRepo) ApproveProduct(ctx context.Context, productID int64) error {
	p, ok := f.products[productID]
	if !ok {
		return ErrNotFound
	}
	p.Status = "saytda"
	f.products[productID] = p
	return nil
}

func (f *fakeRepo) RejectProduct(ctx context.Context, productID int64) error {
	p, ok := f.products[productID]
	if !ok {
		return ErrNotFound
	}
	p.Status = "legv_edilib"
	f.products[productID] = p
	return nil
}
```

Also update `internal/user/handler_test.go`'s `fakeUserRepo` with the same 3 methods (same bodies, adapted to that file's field names — both fakes track a `products map[int64]Product`, so the bodies are identical).

- [ ] **Step 2: Add `ListAllProducts` to `shop.Repository` (in `internal/shop/repository.go`)**

Add to the `Repository` interface:

```go
	ListAllProducts(ctx context.Context) ([]Product, error)
```

Add implementation (note: no `shop_id` filter, and no `onlyStatus` filter — this is superadmin oversight across every shop, every status):

```go
func (r *pgRepository) ListAllProducts(ctx context.Context) ([]Product, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name, title, COALESCE(details, ''),
		        COALESCE(marka, ''), COALESCE(model, ''), COALESCE(il, 0),
		        COALESCE(qiymet, 0), COALESCE(yurus, 0), COALESCE(yanacaq, ''), COALESCE(ban, ''), status
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
			&p.Marka, &p.Model, &p.Il, &p.Qiymet, &p.Yurus, &p.Yanacaq, &p.Ban, &p.Status); err != nil {
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
```

Update `internal/shop/handler_test.go`'s `fakeRepo` to implement this new method — read the file's current fake first (it has a `products map[int64][]Product` field, per earlier phases), then add:

```go
func (f *fakeRepo) ListAllProducts(ctx context.Context) ([]Product, error) {
	out := []Product{}
	for _, products := range f.products {
		out = append(out, products...)
	}
	return out, nil
}
```

- [ ] **Step 3: Write `internal/admin/handler.go`**

```go
package admin

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"github.com/CavadJava/avtopulse-backend/internal/user"
	"github.com/go-chi/chi/v5"
)

const cookieName = "admin_session"
const sessionTTL = 24 * time.Hour

// adminSessions is a tiny in-memory (not DB-backed) session store — the
// superadmin panel is a single internal tool with one fixed account, not a
// multi-user system, so a DB table would be unnecessary weight. Sessions are
// lost on server restart, which is an acceptable trade-off for this small
// internal tool (the admin just logs in again).
type adminSessions struct {
	mu     sync.Mutex
	tokens map[string]time.Time // token -> expiry
}

func newAdminSessions() *adminSessions {
	return &adminSessions{tokens: map[string]time.Time{}}
}

func (s *adminSessions) create() string {
	b := make([]byte, 32)
	rand.Read(b)
	token := hex.EncodeToString(b)
	s.mu.Lock()
	s.tokens[token] = time.Now().Add(sessionTTL)
	s.mu.Unlock()
	return token
}

func (s *adminSessions) valid(token string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	expiry, ok := s.tokens[token]
	if !ok || time.Now().After(expiry) {
		return false
	}
	return true
}

func (s *adminSessions) delete(token string) {
	s.mu.Lock()
	delete(s.tokens, token)
	s.mu.Unlock()
}

type adminHandlers struct {
	userRepo user.Repository
	shopRepo shop.Repository
	username string
	password string
	sessions *adminSessions
}

func NewHandler(userRepo user.Repository, shopRepo shop.Repository, adminUsername, adminPassword string) http.Handler {
	h := &adminHandlers{
		userRepo: userRepo, shopRepo: shopRepo,
		username: adminUsername, password: adminPassword,
		sessions: newAdminSessions(),
	}
	r := chi.NewRouter()

	r.Post("/login", h.Login)
	r.Post("/logout", h.Logout)
	r.Get("/products/pending", h.requireAdmin(h.PendingProducts))
	r.Post("/products/{id}/approve", h.requireAdmin(h.ApproveProduct))
	r.Post("/products/{id}/reject", h.requireAdmin(h.RejectProduct))
	r.Get("/shop-products", h.requireAdmin(h.ListShopProducts))
	r.Post("/shop-products/{id}/cancel", h.requireAdmin(h.CancelShopProduct))

	return r
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Login godoc
// @Summary      Superadmin login
// @Description  Authenticates against a fixed username/password from server configuration (not a DB-backed account). Sets an HttpOnly admin_session cookie on success.
// @Tags         admin
// @Accept       json
// @Produce      json
// @Param        body  body  loginRequest  true  "Admin username and password"
// @Success      200   {string}  string  "ok"
// @Failure      400   {string}  string  "invalid request body"
// @Failure      401   {string}  string  "invalid credentials"
// @Router       /login [post]
func (h *adminHandlers) Login(w http.ResponseWriter, req *http.Request) {
	var body loginRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Username != h.username || body.Password != h.password {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	token := h.sessions.create()
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   24 * 60 * 60,
	})
	w.WriteHeader(http.StatusOK)
}

// Logout godoc
// @Summary      Log out the current superadmin session
// @Tags         admin
// @Success      200  {string}  string  "ok"
// @Router       /logout [post]
func (h *adminHandlers) Logout(w http.ResponseWriter, req *http.Request) {
	cookie, err := req.Cookie(cookieName)
	if err == nil {
		h.sessions.delete(cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusOK)
}

func (h *adminHandlers) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		cookie, err := req.Cookie(cookieName)
		if err != nil || !h.sessions.valid(cookie.Value) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, req)
	}
}

// PendingProducts godoc
// @Summary      List all user listings pending moderation
// @Description  Requires a valid admin_session cookie.
// @Tags         admin
// @Produce      json
// @Success      200  {array}   user.Product
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /products/pending [get]
func (h *adminHandlers) PendingProducts(w http.ResponseWriter, req *http.Request) {
	products, err := h.userRepo.ListPendingProducts(req.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, products)
}

// ApproveProduct godoc
// @Summary      Approve a pending user listing
// @Description  Requires a valid admin_session cookie. Sets the listing's status to saytda.
// @Tags         admin
// @Produce      json
// @Param        id  path  int  true  "Product id"
// @Success      200  {object}  map[string]bool
// @Failure      400  {string}  string  "invalid product id"
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /products/{id}/approve [post]
func (h *adminHandlers) ApproveProduct(w http.ResponseWriter, req *http.Request) {
	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}
	if err := h.userRepo.ApproveProduct(req.Context(), productID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"approved": true})
}

// RejectProduct godoc
// @Summary      Reject a pending user listing
// @Description  Requires a valid admin_session cookie. Sets the listing's status to legv_edilib.
// @Tags         admin
// @Produce      json
// @Param        id  path  int  true  "Product id"
// @Success      200  {object}  map[string]bool
// @Failure      400  {string}  string  "invalid product id"
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /products/{id}/reject [post]
func (h *adminHandlers) RejectProduct(w http.ResponseWriter, req *http.Request) {
	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}
	if err := h.userRepo.RejectProduct(req.Context(), productID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"rejected": true})
}

// ListShopProducts godoc
// @Summary      List every shop product across all shops, any status
// @Description  Requires a valid admin_session cookie. Superadmin oversight — not scoped to any single shop.
// @Tags         admin
// @Produce      json
// @Success      200  {array}   shop.Product
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /shop-products [get]
func (h *adminHandlers) ListShopProducts(w http.ResponseWriter, req *http.Request) {
	products, err := h.shopRepo.ListAllProducts(req.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, products)
}

// CancelShopProduct godoc
// @Summary      Cancel any shop's product (superadmin override)
// @Description  Requires a valid admin_session cookie. Uses the same soft-delete as the shop owner's own "Sil" button — no ownership check, since superadmin acts across all shops.
// @Tags         admin
// @Produce      json
// @Param        id  path  int  true  "Product id"
// @Success      200  {object}  map[string]bool
// @Failure      400  {string}  string  "invalid product id"
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /shop-products/{id}/cancel [post]
func (h *adminHandlers) CancelShopProduct(w http.ResponseWriter, req *http.Request) {
	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}
	if err := h.shopRepo.DeleteProduct(req.Context(), productID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"cancelled": true})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

var _ = errors.Is // keep errors imported if unused paths change later; remove if genuinely unused after implementation
```

Note on the last line: check after writing the file whether `errors` is actually used anywhere in this file (it currently is not, since this handler doesn't do ownership-check error matching like `user`/`shop` do). If `go vet`/`go build` flags it as unused, remove the `errors` import and that placeholder line entirely — it was left as a note for whoever implements this, not a real requirement.

- [ ] **Step 4: Write `internal/admin/handler_test.go`**

```go
package admin

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"github.com/CavadJava/avtopulse-backend/internal/user"
)

type fakeUserRepo struct {
	products map[int64]user.Product
}

func (f *fakeUserRepo) FindOrCreateByPhone(ctx context.Context, phone string) (*user.User, error) {
	return nil, nil
}
func (f *fakeUserRepo) ListMyProducts(ctx context.Context, userID int64) ([]user.Product, error) {
	return nil, nil
}
func (f *fakeUserRepo) CreateProduct(ctx context.Context, userID int64, input user.CreateProductInput) (*user.Product, error) {
	return nil, nil
}
func (f *fakeUserRepo) UpdateProduct(ctx context.Context, productID int64, input user.CreateProductInput) (*user.Product, error) {
	return nil, nil
}
func (f *fakeUserRepo) DeleteProduct(ctx context.Context, productID int64) error { return nil }
func (f *fakeUserRepo) GetProductUserID(ctx context.Context, productID int64) (int64, error) {
	return 0, nil
}
func (f *fakeUserRepo) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int) (*user.ProductImage, error) {
	return nil, nil
}
func (f *fakeUserRepo) ListPendingProducts(ctx context.Context) ([]user.Product, error) {
	out := []user.Product{}
	for _, p := range f.products {
		if p.Status == "gozlemede" {
			out = append(out, p)
		}
	}
	return out, nil
}
func (f *fakeUserRepo) ApproveProduct(ctx context.Context, productID int64) error {
	p := f.products[productID]
	p.Status = "saytda"
	f.products[productID] = p
	return nil
}
func (f *fakeUserRepo) RejectProduct(ctx context.Context, productID int64) error {
	p := f.products[productID]
	p.Status = "legv_edilib"
	f.products[productID] = p
	return nil
}

type fakeShopRepo struct {
	products map[int64]shop.Product
}

func (f *fakeShopRepo) ListShops(ctx context.Context) ([]shop.ShopSummary, error)     { return nil, nil }
func (f *fakeShopRepo) GetShopByName(ctx context.Context, name string) (*shop.Shop, error) {
	return nil, nil
}
func (f *fakeShopRepo) GetShopByID(ctx context.Context, id int64) (*shop.Shop, error) { return nil, nil }
func (f *fakeShopRepo) ListProducts(ctx context.Context, shopID int64, onlyStatus string) ([]shop.Product, error) {
	return nil, nil
}
func (f *fakeShopRepo) GetPasswordHash(ctx context.Context, shopID int64) (string, error) {
	return "", nil
}
func (f *fakeShopRepo) CreateProduct(ctx context.Context, shopID int64, input shop.CreateProductInput) (*shop.Product, error) {
	return nil, nil
}
func (f *fakeShopRepo) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int) (*shop.ProductImage, error) {
	return nil, nil
}
func (f *fakeShopRepo) GetProductShopID(ctx context.Context, productID int64) (int64, error) {
	return 0, nil
}
func (f *fakeShopRepo) SetShopLogo(ctx context.Context, shopID int64, url string) error { return nil }
func (f *fakeShopRepo) UpdateProduct(ctx context.Context, productID int64, input shop.CreateProductInput) (*shop.Product, error) {
	return nil, nil
}
func (f *fakeShopRepo) DeleteProduct(ctx context.Context, productID int64) error {
	p := f.products[productID]
	p.Status = "legv_edilib"
	f.products[productID] = p
	return nil
}
func (f *fakeShopRepo) RestoreProduct(ctx context.Context, productID int64) error { return nil }
func (f *fakeShopRepo) GetImageProductID(ctx context.Context, imageID int64) (int64, error) {
	return 0, nil
}
func (f *fakeShopRepo) DeleteProductImage(ctx context.Context, imageID int64) error { return nil }
func (f *fakeShopRepo) ListAllProducts(ctx context.Context) ([]shop.Product, error) {
	out := []shop.Product{}
	for _, p := range f.products {
		out = append(out, p)
	}
	return out, nil
}

func TestLogin_CorrectCredentials(t *testing.T) {
	h := NewHandler(&fakeUserRepo{products: map[int64]user.Product{}}, &fakeShopRepo{products: map[int64]shop.Product{}}, "admin", "secret")
	body, _ := json.Marshal(loginRequest{Username: "admin", Password: "secret"})
	req := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
	found := false
	for _, c := range rec.Result().Cookies() {
		if c.Name == cookieName {
			found = true
		}
	}
	if !found {
		t.Fatal("expected admin_session cookie to be set")
	}
}

func TestLogin_WrongCredentials(t *testing.T) {
	h := NewHandler(&fakeUserRepo{products: map[int64]user.Product{}}, &fakeShopRepo{products: map[int64]shop.Product{}}, "admin", "secret")
	body, _ := json.Marshal(loginRequest{Username: "admin", Password: "wrong"})
	req := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestPendingProducts_NoCookie(t *testing.T) {
	h := NewHandler(&fakeUserRepo{products: map[int64]user.Product{}}, &fakeShopRepo{products: map[int64]shop.Product{}}, "admin", "secret")
	req := httptest.NewRequest(http.MethodGet, "/products/pending", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestApproveProduct_ChangesStatusToSaytda(t *testing.T) {
	userRepo := &fakeUserRepo{products: map[int64]user.Product{1: {ID: 1, Status: "gozlemede"}}}
	shopRepo := &fakeShopRepo{products: map[int64]shop.Product{}}
	h := NewHandler(userRepo, shopRepo, "admin", "secret")

	// Log in first to get a valid cookie.
	loginBody, _ := json.Marshal(loginRequest{Username: "admin", Password: "secret"})
	loginReq := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(loginBody))
	loginRec := httptest.NewRecorder()
	h.ServeHTTP(loginRec, loginReq)
	var token string
	for _, c := range loginRec.Result().Cookies() {
		if c.Name == cookieName {
			token = c.Value
		}
	}

	req := httptest.NewRequest(http.MethodPost, "/products/1/approve", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
	if userRepo.products[1].Status != "saytda" {
		t.Fatalf("expected status saytda after approve, got %q", userRepo.products[1].Status)
	}
}

func TestCancelShopProduct_NoOwnershipCheck(t *testing.T) {
	userRepo := &fakeUserRepo{products: map[int64]user.Product{}}
	shopRepo := &fakeShopRepo{products: map[int64]shop.Product{1: {ID: 1, Status: "saytda"}}}
	h := NewHandler(userRepo, shopRepo, "admin", "secret")

	loginBody, _ := json.Marshal(loginRequest{Username: "admin", Password: "secret"})
	loginReq := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(loginBody))
	loginRec := httptest.NewRecorder()
	h.ServeHTTP(loginRec, loginReq)
	var token string
	for _, c := range loginRec.Result().Cookies() {
		if c.Name == cookieName {
			token = c.Value
		}
	}

	req := httptest.NewRequest(http.MethodPost, "/shop-products/1/cancel", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
	if shopRepo.products[1].Status != "legv_edilib" {
		t.Fatalf("expected status legv_edilib after superadmin cancel, got %q", shopRepo.products[1].Status)
	}
}
```

- [ ] **Step 5: Build and test**

```bash
cd avtopulse-backend
go build ./internal/user/... ./internal/shop/... ./internal/admin/...
go test ./internal/user/... ./internal/shop/... ./internal/admin/... -v
```

Expected: all pass. `go build ./...` (whole module) is NOT expected to succeed yet — `cmd/server/main.go` doesn't wire these two new handlers in yet, that's Task 5.

- [ ] **Step 6: Commit**

```bash
git add avtopulse-backend/internal/user avtopulse-backend/internal/shop avtopulse-backend/internal/admin
git commit -m "feat: internal/admin package — superadmin login, user-listing moderation, shop oversight"
```

---

## Task 5: Wire routes into `cmd/server/main.go`, regenerate Swagger

**Files:**
- Modify: `avtopulse-backend/cmd/server/main.go`

**Interfaces:**
- Consumes: `user.NewHandler`, `user.NewRepository`, `user.NewSessionStore`, `admin.NewHandler` (Tasks 2-4).
- Produces: fully wired `/api/users/...` and `/api/admin/...` routes.

- [ ] **Step 1: Add imports and env vars, construct the new repos/handlers, mount the routes**

Add to the import block:

```go
	"github.com/CavadJava/avtopulse-backend/internal/admin"
	"github.com/CavadJava/avtopulse-backend/internal/user"
```

Right after `shopRepo := shop.NewRepository(pool)` and `sessions := auth.NewSessionStore(pool)`, add:

```go
	userRepo := user.NewRepository(pool)
	userSessions := user.NewSessionStore(pool)

	adminUsername := os.Getenv("ADMIN_USERNAME")
	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminUsername == "" || adminPassword == "" {
		log.Fatal("ADMIN_USERNAME and ADMIN_PASSWORD env vars are required")
	}
```

Right after the existing `storageClient` dual-write setup block (after the `if awsAccessKey != "" ...` block closes, before `r := chi.NewRouter()`), the `storageClient` variable is already in scope — no new storage setup needed, `internal/user` reuses the same instance.

Right after the existing `r.Mount("/api/shops", shop.NewHandler(shopRepo))` line, add:

```go
	userHandler := user.NewHandler(userRepo, userSessions, storageClient)
	r.Post("/api/users/otp/request", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})
	r.Post("/api/users/otp/verify", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})
	r.Post("/api/users/logout", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})
	r.Get("/api/users/me/products", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})
	r.Post("/api/users/me/products", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})
	r.Put("/api/users/me/products/{id}", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})
	r.Delete("/api/users/me/products/{id}", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})
	r.Post("/api/users/me/products/{id}/images", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})

	adminHandler := admin.NewHandler(userRepo, shopRepo, adminUsername, adminPassword)
	r.Post("/api/admin/login", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/admin", adminHandler).ServeHTTP(w, req)
	})
	r.Post("/api/admin/logout", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/admin", adminHandler).ServeHTTP(w, req)
	})
	r.Get("/api/admin/products/pending", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/admin", adminHandler).ServeHTTP(w, req)
	})
	r.Post("/api/admin/products/{id}/approve", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/admin", adminHandler).ServeHTTP(w, req)
	})
	r.Post("/api/admin/products/{id}/reject", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/admin", adminHandler).ServeHTTP(w, req)
	})
	r.Get("/api/admin/shop-products", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/admin", adminHandler).ServeHTTP(w, req)
	})
	r.Post("/api/admin/shop-products/{id}/cancel", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/admin", adminHandler).ServeHTTP(w, req)
	})
```

- [ ] **Step 2: Build and test the whole module**

```bash
cd avtopulse-backend
go build ./...
go test ./... -v
```

Expected: everything builds and passes now.

- [ ] **Step 3: Regenerate Swagger**

```bash
cd avtopulse-backend
$(go env GOPATH)/bin/swag init -g cmd/server/main.go -o docs --parseInternal
```

Read `docs/swagger.json`'s full `"paths"` object directly (not a truncated snippet) to confirm the new `/otp/request`, `/otp/verify`, `/me/products` etc. under the `user`/`admin` tags appear. Note: since `internal/user`/`internal/admin` are mounted at different base paths (`/api/users`, `/api/admin`) than the existing `@BasePath /api/shops` declared in `main.go`'s top comment, their route paths in swagger.json will show only the sub-paths (e.g. `/otp/verify`) without the `/api/users` prefix — this is a pre-existing limitation of this single-`@BasePath` Swagger setup, not a new bug to fix in this task. Just confirm the new operations are present at all, tagged correctly (`user`, `admin`).

- [ ] **Step 4: Commit**

```bash
git add avtopulse-backend
git commit -m "feat: wire internal/user and internal/admin routes into cmd/server/main.go"
```

---

## Task 6: Frontend — real API for fərdi login, listing CRUD

**Files:**
- Modify: `src/api/auth.ts`
- Modify: `src/pages/Login.tsx`
- Modify: `src/pages/LoginVerify.tsx`
- Modify: `src/pages/NewListing.tsx`
- Modify: `src/pages/KabinetElanlarim.tsx` (or wherever the "Mənim elanlarım" page currently lives — confirm exact path first)

**Interfaces:**
- Consumes: `POST /api/users/otp/request`, `POST /api/users/otp/verify`, `POST /api/users/logout`, `GET/POST/PUT/DELETE /api/users/me/products`, `POST /api/users/me/products/{id}/images` (Task 5).
- Produces: real, non-mock `requestOtp`, `verifyOtp`, `logout`, `getMyListings`, `createListing`, `updateListing`, `deleteListing`, `uploadListingImages` in `src/api/auth.ts`.

- [ ] **Step 1: Read `src/api/auth.ts`, `src/pages/Login.tsx`, `src/pages/LoginVerify.tsx`, `src/pages/NewListing.tsx`, and the "Mənim elanlarım" page in full before editing** — confirm their exact current shape (this repo has had several concurrent sessions touch related files; do not assume the file contents match any earlier summary verbatim).

- [ ] **Step 2: Rewrite the mock functions in `src/api/auth.ts` to call the real backend**, matching `src/api/shop.ts`'s established conventions (`API_BASE` from `import.meta.env.VITE_AVTOPULSE_API_BASE`, `credentials: 'include'`, `cache: 'no-store'` on GETs, typed error classes):

```typescript
const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

export interface UserSummary {
  id: number;
  name: string;
  phone: string;
}

export interface UserProductImage {
  id: number;
  minioUrl: string;
  s3Url: string;
  sira: number;
}

export interface UserListing {
  id: number;
  userId: number;
  marka: string;
  model: string;
  il: number;
  qiymet: number;
  yurus: number;
  yanacaq: string;
  ban: string;
  title: string;
  details: string;
  status: string;
  images: UserProductImage[];
}

export interface CreateListingInput {
  marka: string;
  model: string;
  il: number;
  qiymet: number;
  yurus: number;
  yanacaq: string;
  ban: string;
  title: string;
  details: string;
}

export class UserUnauthorizedError extends Error {}
export class UserOtpError extends Error {}

export async function requestOtp(phone: string): Promise<{ sent: boolean }> {
  const res = await fetch(`${API_BASE}/api/users/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    throw new Error(`requestOtp failed: ${res.status}`);
  }
  return res.json();
}

export async function verifyOtp(phone: string, code: string): Promise<UserSummary> {
  const res = await fetch(`${API_BASE}/api/users/otp/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  if (res.status === 401) {
    throw new UserOtpError('Kod yanlışdır');
  }
  if (!res.ok) {
    throw new Error(`verifyOtp failed: ${res.status}`);
  }
  const data = await res.json();
  return data.user;
}

export async function userLogout(): Promise<void> {
  await fetch(`${API_BASE}/api/users/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function getMyListings(): Promise<UserListing[]> {
  const res = await fetch(`${API_BASE}/api/users/me/products`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new UserUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getMyListings failed: ${res.status}`);
  }
  return res.json();
}

export async function createListing(input: CreateListingInput): Promise<UserListing> {
  const res = await fetch(`${API_BASE}/api/users/me/products`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 401) {
    throw new UserUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`createListing failed: ${res.status}`);
  }
  return res.json();
}

export async function updateListing(id: number, input: CreateListingInput): Promise<UserListing> {
  const res = await fetch(`${API_BASE}/api/users/me/products/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 401) {
    throw new UserUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`updateListing failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteListing(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users/me/products/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new UserUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`deleteListing failed: ${res.status}`);
  }
}

export async function uploadListingImages(listingId: number, files: File[]): Promise<UserProductImage[]> {
  const form = new FormData();
  files.forEach((file) => form.append('images', file));

  const res = await fetch(`${API_BASE}/api/users/me/products/${listingId}/images`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (res.status === 401) {
    throw new UserUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`uploadListingImages failed: ${res.status}`);
  }
  return res.json();
}
```

Note: this plan does not enumerate the exact old mock function names/signatures being replaced (`getMyListings(hesabTipi)`, `mockUserListingsByAccount`, etc.) since Task 6's Step 1 requires reading the live file first — the implementer must carry over any still-needed exports (e.g. if `promoteListing`/`PROMO_PRICES`/`PROMO_LABELS`/business-login functions are still referenced elsewhere in the app and are out of this plan's scope, they must be preserved, not deleted, even though this plan's design doc says biznes-account concepts are out of scope for the NEW listings system — do not delete working code for a different, still-in-use feature).

- [ ] **Step 3: Wire `Login.tsx`'s fərdi (individual) tab to call real `requestOtp`, and `LoginVerify.tsx` to call real `verifyOtp`** — read both files' current submit-handler code first; replace the mock calls with the real ones from Step 2, preserving all existing UI/validation behavior (loading states, error display) exactly, only swapping the underlying async call.

- [ ] **Step 4: Wire `NewListing.tsx`'s `handleSubmit`** (read the file first — a summary of an earlier session described its create-mode as literally doing nothing but `clearDraft(); setSubmitted(true);`, but this must be re-verified against the live file, not assumed) — replace the no-op/mock body with a call to `createListing` (Step 2), then (if images were attached) `uploadListingImages`, following the same "create succeeds, image upload failure is a softer, separate error" pattern already established in `MyShop.tsx`'s `handleCreateProduct`. Edit-mode calls `updateListing`.

- [ ] **Step 5: Wire "Mənim elanlarım" page to real `getMyListings()`** — read the file first (confirm its actual current name/path; earlier context suggested `KabinetElanlarim.tsx` but verify), replace the mock `mockUserListingsByAccount`-based read with a real `getMyListings()` call, and group/display listings by all 3 statuses (`gozlemede`/`saytda`/`legv_edilib`) so a user can find their listing in whichever state it's in — matching the tab pattern already used in `MyShop.tsx` (Bütün elanlar / Saytda / Ləğv edilib), adding a "Gözləmədə" tab here.

- [ ] **Step 6: Type-check and build**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc -b --noEmit
npm run build
```

Expected: both succeed with no errors.

- [ ] **Step 7: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/api/auth.ts src/pages/Login.tsx src/pages/LoginVerify.tsx src/pages/NewListing.tsx || echo CLEAN
git add src/api/auth.ts src/pages/Login.tsx src/pages/LoginVerify.tsx src/pages/NewListing.tsx
git commit -m "feat: wire fərdi login (OTP) and listing CRUD to real backend"
```

(Adjust the file list in the commit to whatever the "Mənim elanlarım" page's real path turned out to be in Step 5.)

---

## Task 7: Frontend — superadmin panel

**Files:**
- Create: `src/api/admin.ts`
- Create: `src/pages/AdminLogin.tsx`
- Create: `src/pages/AdminDashboard.tsx`
- Modify: `src/App.tsx` (add `/admin` and `/admin/dashboard` routes — read the file first to match its existing route-registration style exactly)

**Interfaces:**
- Consumes: `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/products/pending`, `POST /api/admin/products/{id}/approve`, `POST /api/admin/products/{id}/reject`, `GET /api/admin/shop-products`, `POST /api/admin/shop-products/{id}/cancel` (Task 5).

- [ ] **Step 1: Read `src/App.tsx` in full to confirm the exact routing convention used (react-router version, route nesting style) before adding new routes.**

- [ ] **Step 2: Write `src/api/admin.ts`**

```typescript
const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

export interface PendingUserListing {
  id: number;
  userId: number;
  marka: string;
  model: string;
  title: string;
  qiymet: number;
  status: string;
}

export interface ShopProductForAdmin {
  id: number;
  name: string;
  title: string;
  status: string;
}

export class AdminLoginError extends Error {}
export class AdminUnauthorizedError extends Error {}

export async function adminLogin(username: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401) {
    throw new AdminLoginError('İstifadəçi adı və ya parol yanlışdır');
  }
  if (!res.ok) {
    throw new Error(`adminLogin failed: ${res.status}`);
  }
}

export async function adminLogout(): Promise<void> {
  await fetch(`${API_BASE}/api/admin/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function getPendingListings(): Promise<PendingUserListing[]> {
  const res = await fetch(`${API_BASE}/api/admin/products/pending`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new AdminUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getPendingListings failed: ${res.status}`);
  }
  return res.json();
}

export async function approveListing(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/products/${id}/approve`, {
    method: 'POST',
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new AdminUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`approveListing failed: ${res.status}`);
  }
}

export async function rejectListing(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/products/${id}/reject`, {
    method: 'POST',
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new AdminUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`rejectListing failed: ${res.status}`);
  }
}

export async function getAllShopProducts(): Promise<ShopProductForAdmin[]> {
  const res = await fetch(`${API_BASE}/api/admin/shop-products`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new AdminUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getAllShopProducts failed: ${res.status}`);
  }
  return res.json();
}

export async function cancelShopProduct(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/shop-products/${id}/cancel`, {
    method: 'POST',
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new AdminUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`cancelShopProduct failed: ${res.status}`);
  }
}
```

- [ ] **Step 3: Write `src/pages/AdminLogin.tsx`** — a minimal login form (username + password fields), mirroring `ShopLogin.tsx`'s structure/styling conventions (read that file first for the exact pattern), calling `adminLogin` then navigating to `/admin/dashboard` on success.

- [ ] **Step 4: Write `src/pages/AdminDashboard.tsx`** — two sections/tabs:
  1. "Gözləmədə elanlar" — lists `getPendingListings()` results, each with "Təsdiqlə" (`approveListing`) and "Rədd et" (`rejectListing`) buttons, reloading the list after each action.
  2. "Mağaza elanları" — lists `getAllShopProducts()` results (all statuses shown, e.g. as a small status badge per row), each with a "Ləğv et" button (`cancelShopProduct`), reloading after each action.

  Follow the same loading/error/notice state pattern already established in `MyShop.tsx` (`loading`, `error`, `notice` states; redirect to `/admin` on any `AdminUnauthorizedError`).

- [ ] **Step 5: Add routes to `src/App.tsx`** — `/admin` → `AdminLogin`, `/admin/dashboard` → `AdminDashboard`, matching the file's existing route registration style exactly (read Step 1's findings).

- [ ] **Step 6: Type-check and build**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc -b --noEmit
npm run build
```

- [ ] **Step 7: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/api/admin.ts src/pages/AdminLogin.tsx src/pages/AdminDashboard.tsx src/App.tsx || echo CLEAN
git add src/api/admin.ts src/pages/AdminLogin.tsx src/pages/AdminDashboard.tsx src/App.tsx
git commit -m "feat: superadmin panel — login, user-listing moderation, shop oversight"
```

---

## Task 8: Deploy + end-to-end verification

**Files:** none — deploy-only task.

- [ ] **Step 1: Full local verification before deploy**

```bash
cd /Users/frontend/workspace/me-github/autopulse/avtopulse-backend
go build ./...
go test ./... -v

cd /Users/frontend/workspace/me-github/autopulse
npx tsc -b --noEmit
npm run build
```

Expected: all green.

- [ ] **Step 2: Add `ADMIN_USERNAME`/`ADMIN_PASSWORD` to the server's systemd unit BEFORE deploying** (the server will fail to start without them, per Task 5's `log.Fatal`):

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 "systemctl show avtopulse-backend -p FragmentPath --value"
```

Then edit the unit file (path from the command above, likely `/etc/systemd/system/avtopulse-backend.service`) to add, alongside the existing `Environment=` lines:

```
Environment=ADMIN_USERNAME=<choose a real value, do not use a placeholder — ask the user for their preferred admin username/password if not already decided>
Environment=ADMIN_PASSWORD=<same>
```

Then:

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 "systemctl daemon-reload"
```

- [ ] **Step 3: Merge to main and push**

```bash
git checkout main
git merge feature/user-listings-phase-a --no-ff -m "Merge feature/user-listings-phase-a: user OTP login, listing CRUD, superadmin moderation"
git push origin main
```

(Assumes Tasks 1-7 were executed on a branch named `feature/user-listings-phase-a`, created before Task 1 — if a different branch name was used, substitute it here.)

- [ ] **Step 4: Deploy the backend**

```bash
rsync -avz --exclude='.git' --exclude='avtopulse-backend/server' \
  -e "ssh -i ~/.ssh/youtube-remote-webrtc_ed25519" \
  /Users/frontend/workspace/me-github/autopulse/avtopulse-backend/ \
  root@157.180.73.79:/opt/avtopulse-backend/

ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "export PATH=\$PATH:/usr/local/go/bin && cd /opt/avtopulse-backend && go build -o avtopulse-backend ./cmd/server && echo BUILD_OK"

ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "chown youtube-remote:youtube-remote /opt/avtopulse-backend/avtopulse-backend && systemctl restart avtopulse-backend && sleep 1 && systemctl status avtopulse-backend --no-pager && journalctl -u avtopulse-backend -n 20 --no-pager"
```

Expected: `active (running)`, no migration errors (migration 0006 applies automatically), no `log.Fatal` about missing `ADMIN_USERNAME`/`ADMIN_PASSWORD` (confirms Step 2 landed correctly).

- [ ] **Step 5: Deploy the frontend**

```bash
cd /Users/frontend/workspace/me-github/autopulse
bash deploy/deploy.sh
```

- [ ] **Step 6: Live end-to-end verification with disposable test data**

```bash
# Fərdi OTP login flow
curl -s -X POST https://autopulse.157.180.73.79.sslip.io/api/users/otp/request \
  -H "Content-Type: application/json" -d '{"phone":"0501112233"}'
echo

curl -s -c /tmp/user-verify-cookies.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/users/otp/verify \
  -H "Content-Type: application/json" -d '{"phone":"0501112233","code":"1234"}'
echo

# Create a test listing — should start as gozlemede
CREATED=$(curl -s -b /tmp/user-verify-cookies.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/users/me/products \
  -H "Content-Type: application/json" \
  -d '{"marka":"Test","model":"Test","title":"Phase A test listing","il":2020,"qiymet":1,"yurus":0,"yanacaq":"Test","ban":"Test"}')
echo "$CREATED"
LISTING_ID=$(echo "$CREATED" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "Listing id: $LISTING_ID (expect status: gozlemede in the output above)"

# Superadmin login and approve
curl -s -c /tmp/admin-verify-cookies.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/admin/login \
  -H "Content-Type: application/json" -d "{\"username\":\"<the ADMIN_USERNAME set in Step 2>\",\"password\":\"<the ADMIN_PASSWORD set in Step 2>\"}"
echo

curl -s -b /tmp/admin-verify-cookies.txt https://autopulse.157.180.73.79.sslip.io/api/admin/products/pending
echo

curl -s -o /dev/null -w "approve: %{http_code}\n" -b /tmp/admin-verify-cookies.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/admin/products/$LISTING_ID/approve

# Confirm the listing is now saytda from the user's own view
curl -s -b /tmp/user-verify-cookies.txt https://autopulse.157.180.73.79.sslip.io/api/users/me/products | python3 -c "
import json, sys
data = json.load(sys.stdin)
mine = [p for p in data if p['id'] == $LISTING_ID]
print('status after approve:', mine[0]['status'] if mine else 'NOT FOUND')
"

# User cancels their own listing
curl -s -o /dev/null -w "cancel: %{http_code}\n" -b /tmp/user-verify-cookies.txt -X DELETE https://autopulse.157.180.73.79.sslip.io/api/users/me/products/$LISTING_ID

# Edit the (now legv_edilib) listing — should reset to gozlemede
curl -s -b /tmp/user-verify-cookies.txt -X PUT https://autopulse.157.180.73.79.sslip.io/api/users/me/products/$LISTING_ID \
  -H "Content-Type: application/json" \
  -d '{"marka":"Test","model":"Test","title":"Phase A test listing (edited)","il":2020,"qiymet":1,"yurus":0,"yanacaq":"Test","ban":"Test"}'
echo "(expect status: gozlemede in the output above, confirming the re-moderation reset)"

# Superadmin oversight of shop products (view only — do NOT cancel a real demo product)
curl -s -b /tmp/admin-verify-cookies.txt https://autopulse.157.180.73.79.sslip.io/api/admin/shop-products | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('total shop products visible to admin:', len(data))
"

rm -f /tmp/user-verify-cookies.txt /tmp/admin-verify-cookies.txt
```

Expected: OTP flow works, listing starts `gozlemede`, approve flips it to `saytda`, user-cancel flips it to `legv_edilib`, editing a `legv_edilib` listing resets it to `gozlemede`, superadmin can see all shop products (a count ≥ 10 is expected, matching the real demo catalog — do not act on any of them beyond viewing in this verification pass).

**Do NOT call `POST /api/admin/shop-products/{id}/cancel` against any of the real demo shop products** (`bmw-320i`, `mercedes-e200`, `toyota-camry`, `hyundai-sonata`, `kia-sportage`, `nissan-altima`, `volkswagen-golf`, `toyota-rav4`, `honda-civic`, `mazda-cx5`, or any others found live) during this verification — the endpoint's cancel behavior is already covered by Task 4's unit test; live verification here is view-only for the shop-products endpoint.

- [ ] **Step 7: Update `workspace/me-github/my-servers/avtopulse/credentials.md`** with: the new `ADMIN_USERNAME`/`ADMIN_PASSWORD` values (and where they're set — the systemd unit), the new `/api/users/...` and `/api/admin/...` live endpoints, the new `/admin` frontend route, and a note that this is Phase A of a larger spec — profile/stats/cards/balance/expiry-ticker/public-unified-feed are separate, not-yet-built follow-on phases.

---

## Self-Review Notes

- **Spec coverage:** every API point 1-20 of the approved design spec (OTP request/verify/logout, user product CRUD+images, superadmin login/logout/pending/approve/reject/shop-view/shop-cancel) is implemented across Tasks 1-5. Points 21-28 (mağaza-parallel profile/stats/cards/balance, public unified feed, real-time expiry ticker) are explicitly out of scope for this plan — called out in Global Constraints and the plan's own Architecture summary, to prevent an implementer from assuming they're included.
- **Table-naming correction surfaced, not silently applied:** the spec draft said `user_session` (singular); this plan uses `user_sessions` (plural) to match the actual existing `shop_sessions` table's naming, and calls this out explicitly in Global Constraints so a reviewer doesn't flag it as a deviation without knowing why.
- **Ownership-check pattern reuse:** every user-facing mutating endpoint (`UpdateProduct`, `DeleteProduct`, `UploadProductImages` in Task 3) follows the exact `requireSession → parse ID → GetProductUserID → compare → 404` chain already proven in `internal/auth/handler.go`. Superadmin endpoints (Task 4) deliberately skip this — called out explicitly as the one sanctioned exception.
- **Placeholder scan:** no TBD/TODO markers; the one explicit "ask the user" note in Task 8 Step 2 (choosing real `ADMIN_USERNAME`/`ADMIN_PASSWORD` values) is a genuine judgment call for deploy time, not a content gap in the plan itself — every other value in every step is literal and runnable.
- **Type consistency:** `user.Product`/`user.CreateProductInput` field names match exactly between `internal/user/model.go` (Task 2), `internal/user/handler.go`'s request/response types (Task 3), and `src/api/auth.ts`'s `UserListing`/`CreateListingInput` interfaces (Task 6) — `marka`, `model`, `il`, `qiymet`, `yurus`, `yanacaq`, `ban`, `title`, `details`, `status` used consistently throughout.
- **Read-before-edit discipline for pre-existing frontend files:** Task 6 and Task 7 explicitly instruct reading `Login.tsx`, `LoginVerify.tsx`, `NewListing.tsx`, the "Mənim elanlarım" page, `App.tsx`, and `ShopLogin.tsx` in full before editing, rather than assuming their contents from any earlier session's summary — this repo has had multiple concurrent sessions touch related files, and stale assumptions have caused real bugs before.
- **Demo data protection:** Task 8's live verification explicitly creates a disposable test user/listing for the full gözləmədə→saytda→legv_edilib→gözləmədə round-trip, and explicitly forbids calling the shop-cancel endpoint against any real demo shop product during verification (view-only for that part).
