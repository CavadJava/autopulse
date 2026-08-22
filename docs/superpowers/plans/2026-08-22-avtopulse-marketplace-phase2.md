# AutoPulse Marketplace Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in shop (`avto444`, and any future shop using the same login) create new products (car listings) with a rich form, upload multiple images per product, and upload a shop logo — all backed by real Postgres columns/tables and the existing MinIO object storage on the production server, with the results visible on the public `/magazalar/avto444` storefront.

**Architecture:** Three new authenticated endpoints (`POST /api/shops/me/products`, `POST /api/shops/me/products/{id}/images`, `POST /api/shops/me/logo`) are added as new methods on the existing `authHandlers` struct in `avtopulse-backend/internal/auth/handler.go` (which already holds `shopRepo` and `sessions`, and already has the `requireSession` helper in scope). A new `internal/storage` package wraps the MinIO Go SDK (`minio-go/v7`) for uploads into the `avtopulse-public` bucket. The `shop`/`shop_products` tables gain new columns (car details) and a new `shop_product_images` join table. The frontend gets a product-creation form and a logo-upload control added to the existing `/magazam` page, and `ShopFront.tsx`/`ShopList.tsx` render the new logo/image fields wherever they're present.

**Tech Stack:** Go 1.26.5, `chi` (existing router), `pgx/v5` (existing), `github.com/minio/minio-go/v7` (new — official MinIO Go client), React 18 + TypeScript + CSS Modules (existing conventions).

## Global Constraints

- All new backend code lives in the existing `avtopulse-backend/` directory (monorepo, not a separate repo) — same as Phase 1.
- The 3 new endpoints require a valid `shop_session` cookie (same auth mechanism as Phase 1's `/me/products`, `/logout`) — no new auth mechanism.
- New DB columns use ASCII names (`qiymet`, `yurus`, `ban` — no `ə/ü/ş`), matching the existing `shop`/`shop_products` table naming convention from Phase 1.
- Images are uploaded as real files (`multipart/form-data`), stored in MinIO bucket `avtopulse-public` (public-read), NOT as URL/link fields and NOT on local disk.
- MinIO connection details: endpoint `127.0.0.1:9000` (from the Go backend running on the same host — reachable directly, no Caddy proxy needed for the S3 API itself), access key `minioadmin`, secret key `eaa66106aca4721b0f560104321c0beb` (already recorded in `workspace/me-github/my-servers/avtopulse/credentials.md` — do not hardcode this secret directly in source; read it from an env var, `AVTOPULSE_MINIO_SECRET_KEY`, following the same pattern as `AVTOPULSE_DSN`).
- MinIO path convention (only the `magaza/` root is implemented in this phase): `magaza/{shopId}/logo/{uuid}.{ext}` and `magaza/{shopId}/product/{productId}/{uuid}.{ext}`.
- New handlers MUST use the named-method pattern already established in Phase 1 (methods on `authHandlers`, not inline anonymous closures) — Phase 1 hit a real bug where `swag` cannot attach `@Router` annotations to inline closures; do not reintroduce that bug.
- This phase is create-only — no edit/delete endpoints for products or images. Do not build them.
- Every backend task must end with `go build ./...` and `go test ./...` passing (run from `avtopulse-backend/`). Every frontend task must end with `npx tsc --noEmit` and `npm run build` passing, plus the standing corruption scan (`grep -rn 'Ɛ\|Ɔ'` across touched files) before any commit.
- Follow the existing AutoPulse deploy workflow: for backend changes, rsync + rebuild + `systemctl restart avtopulse-backend` (documented in `workspace/me-github/my-servers/avtopulse/credentials.md`); for frontend changes, `git push origin main` then `bash deploy/deploy.sh` from `/Users/frontend/workspace/me-github/autopulse`.
- Do not touch `/elan-ver` or any existing mock-data marketplace code — this phase only touches `avtopulse-backend/`, `src/api/shop.ts`, and `src/pages/shop/*`.

---

## Task 1: Database migration — new columns and `shop_product_images` table

**Files:**
- Create: `avtopulse-backend/migrations/0003_shop_product_details_and_images.sql`
- Modify: `avtopulse-backend/internal/shop/model.go`
- Modify: `avtopulse-backend/internal/shop/repository.go`
- Modify: `avtopulse-backend/internal/shop/handler_test.go` (update `fakeRepo` for new interface methods used only by later tasks — this task itself doesn't add new Repository methods, but does change what `Shop`/`Product` structs carry, which existing tests decode)

**Interfaces:**
- Consumes: nothing new — this extends Phase 1's existing `db.RunMigrations` runner and `shop.Repository`.
- Produces: `Shop.LogoURL string`, `Product` extended with `Marka, Model, Il, Qiymet, Yurus, Yanacaq, Ban string/int` fields and `Images []ProductImage`; a new `ProductImage struct { ID int64; URL string; Sira int }` type.

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE avto444.shop ADD COLUMN logo_url TEXT;

ALTER TABLE avto444.shop_products
  ADD COLUMN marka TEXT,
  ADD COLUMN model TEXT,
  ADD COLUMN il INTEGER,
  ADD COLUMN qiymet INTEGER,
  ADD COLUMN yurus INTEGER,
  ADD COLUMN yanacaq TEXT,
  ADD COLUMN ban TEXT;

CREATE TABLE avto444.shop_product_images (
  id          BIGSERIAL PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES avto444.shop_products(id),
  url         TEXT NOT NULL,
  sira        INTEGER NOT NULL DEFAULT 0
);
```

Save this as `avtopulse-backend/migrations/0003_shop_product_details_and_images.sql`.

- [ ] **Step 2: Update `avtopulse-backend/internal/shop/model.go`**

```go
package shop

type Shop struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	CustomerID int64  `json:"customerId"`
	Title      string `json:"title"`
	Details    string `json:"details"`
	WorkTimes  string `json:"workTimes"`
	LogoURL    string `json:"logoUrl"`
}

type ShopSummary struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Title string `json:"title"`
}

type ProductImage struct {
	ID   int64  `json:"id"`
	URL  string `json:"url"`
	Sira int    `json:"sira"`
}

type Product struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Title   string `json:"title"`
	Details string `json:"details"`
	Marka   string `json:"marka"`
	Model   string `json:"model"`
	Il      int    `json:"il"`
	Qiymet  int    `json:"qiymet"`
	Yurus   int    `json:"yurus"`
	Yanacaq string `json:"yanacaq"`
	Ban     string `json:"ban"`

	Images []ProductImage `json:"images"`
}
```

- [ ] **Step 3: Update `avtopulse-backend/internal/shop/repository.go`'s queries**

Update `GetShopByName` and `GetShopByID` to select and scan `logo_url` (nullable, use `COALESCE(logo_url, '')`):

```go
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
```

Update `ListProducts` to select the new columns and attach images via a second query (N+1 is acceptable at this scale — Phase 1's own `ListProducts`/`GetShopByID` double-query pattern in the products-list handler already accepted this trade-off):

```go
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
```

- [ ] **Step 4: Update `avtopulse-backend/internal/shop/handler_test.go`'s `fakeRepo`**

The `fakeRepo`'s `ListProducts` implementation and any hardcoded `Product{}`/`Shop{}` literals in existing tests still compile as-is (new struct fields default to zero values) — no changes needed there. Confirm this by running the existing test suite (next step) rather than editing anything speculatively.

- [ ] **Step 5: Run tests to confirm nothing broke**

```bash
cd avtopulse-backend
go build ./...
go test ./... -v
```

Expected: all previously-passing tests (5 shop, 7 auth) still pass unchanged — new struct fields don't affect existing JSON assertions since `encoding/json` only checks the fields a test explicitly decodes/asserts on.

- [ ] **Step 6: Apply the migration against the local test DB and verify**

```bash
export AVTOPULSE_TEST_DSN="postgres://localhost:5432/avtopulse_test?sslmode=disable"
go test ./internal/db/... -v
```

Expected: `PASS` — this re-runs `RunMigrations`, which will apply `0003_...` (new, not yet in `schema_migrations`) alongside the already-applied `0001`/`0002`.

- [ ] **Step 7: Commit**

```bash
git add avtopulse-backend
git commit -m "feat: add shop logo + car-detail columns and shop_product_images table"
```

---

## Task 2: MinIO storage package

**Files:**
- Create: `avtopulse-backend/internal/storage/minio.go`
- Test: `avtopulse-backend/internal/storage/minio_test.go`
- Modify: `avtopulse-backend/go.mod`, `avtopulse-backend/go.sum`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `storage.Client` interface: `Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (url string, err error)`
  - `storage.NewClient(endpoint, accessKey, secretKey, bucket string, useSSL bool) (Client, error)` — connects to MinIO, ensures the bucket exists (creates it with a public-read policy if not), returns a client whose `Upload` method puts an object at the given path and returns its publicly-accessible URL.

- [ ] **Step 1: Install the MinIO Go SDK**

```bash
cd avtopulse-backend
go get github.com/minio/minio-go/v7
```

- [ ] **Step 2: Write `avtopulse-backend/internal/storage/minio.go`**

```go
package storage

import (
	"context"
	"fmt"
	"io"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Client interface {
	// Upload puts data at the given object path inside the configured bucket
	// and returns a publicly-reachable URL for it (the bucket has a
	// public-read policy, so no signed URL is needed for GET).
	Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, error)
}

type minioClient struct {
	mc        *minio.Client
	bucket    string
	publicURL string // e.g. "http://127.0.0.1:9000" or a public endpoint if fronted by a proxy
}

const publicReadPolicyTemplate = `{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Principal": {"AWS": ["*"]},
			"Action": ["s3:GetObject"],
			"Resource": ["arn:aws:s3:::%s/*"]
		}
	]
}`

// NewClient connects to a MinIO (or any S3-compatible) endpoint, ensures the
// given bucket exists with a public-read policy (car/shop photos are meant
// to be publicly viewable — no signed URLs), and returns a Client ready to
// accept uploads.
func NewClient(ctx context.Context, endpoint, accessKey, secretKey, bucket, publicURL string, useSSL bool) (Client, error) {
	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("storage: connecting to minio: %w", err)
	}

	exists, err := mc.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("storage: checking bucket %q: %w", bucket, err)
	}
	if !exists {
		if err := mc.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("storage: creating bucket %q: %w", bucket, err)
		}
	}

	policy := fmt.Sprintf(publicReadPolicyTemplate, bucket)
	if err := mc.SetBucketPolicy(ctx, bucket, policy); err != nil {
		return nil, fmt.Errorf("storage: setting public-read policy on %q: %w", bucket, err)
	}

	return &minioClient{mc: mc, bucket: bucket, publicURL: publicURL}, nil
}

func (c *minioClient) Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, error) {
	_, err := c.mc.PutObject(ctx, c.bucket, path, data, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", fmt.Errorf("storage: uploading %q: %w", path, err)
	}
	return fmt.Sprintf("%s/%s/%s", c.publicURL, c.bucket, path), nil
}
```

- [ ] **Step 3: Write `avtopulse-backend/internal/storage/minio_test.go`** (gated on a real local MinIO — check availability first, matching the `AVTOPULSE_TEST_DSN` pattern from Phase 1's Postgres tests)

```go
package storage

import (
	"bytes"
	"context"
	"net/http"
	"os"
	"testing"
)

func TestUpload_RealMinIO(t *testing.T) {
	endpoint := os.Getenv("AVTOPULSE_TEST_MINIO_ENDPOINT")
	if endpoint == "" {
		t.Skip("AVTOPULSE_TEST_MINIO_ENDPOINT not set, skipping integration test")
	}
	accessKey := os.Getenv("AVTOPULSE_TEST_MINIO_ACCESS_KEY")
	secretKey := os.Getenv("AVTOPULSE_TEST_MINIO_SECRET_KEY")

	ctx := context.Background()
	client, err := NewClient(ctx, endpoint, accessKey, secretKey, "avtopulse-test", "http://"+endpoint, false)
	if err != nil {
		t.Fatalf("NewClient failed: %v", err)
	}

	content := []byte("test image bytes")
	url, err := client.Upload(ctx, "test/upload_test.txt", bytes.NewReader(content), int64(len(content)), "text/plain")
	if err != nil {
		t.Fatalf("Upload failed: %v", err)
	}
	if url == "" {
		t.Fatal("expected a non-empty URL")
	}

	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("fetching uploaded object failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 fetching uploaded object (public-read policy), got %d", resp.StatusCode)
	}
}
```

- [ ] **Step 4: Run the test against the real production MinIO (read-only verification, writes to a throwaway `avtopulse-test` bucket)**

```bash
cd avtopulse-backend
export AVTOPULSE_TEST_MINIO_ENDPOINT="157.180.73.79:9000"
export AVTOPULSE_TEST_MINIO_ACCESS_KEY="minioadmin"
export AVTOPULSE_TEST_MINIO_SECRET_KEY="eaa66106aca4721b0f560104321c0beb"
go test ./internal/storage/... -v
```

Note: MinIO's S3 API on the production server is bound to `127.0.0.1:9000` (not exposed externally) — this direct test run from a local dev machine will fail to connect unless run over an SSH tunnel (`ssh -L 9000:127.0.0.1:9000 -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79`) or the test is instead run FROM the server itself. If neither is convenient in this environment, skip this step here and defer real verification to Task 5's server-side manual test — the unit-level code (Step 2) is what matters for this task's build/test gate; report which path was taken.

Expected (when reachable): `PASS`, and `docker exec minio mc ls local/avtopulse-test/test/` on the server shows the uploaded file.

- [ ] **Step 5: Run `go build ./...` and `go test ./...` (non-MinIO tests) to confirm no regressions**

```bash
cd avtopulse-backend
go build ./...
go test ./... -v
```

Expected: all existing tests pass; the new MinIO test either passes (if reachable) or skips cleanly (if not).

- [ ] **Step 6: Commit**

```bash
git add avtopulse-backend
git commit -m "feat: add MinIO storage client for shop logo/product image uploads"
```

---

## Task 3: `POST /api/shops/me/products` — create product endpoint

**Files:**
- Modify: `avtopulse-backend/internal/shop/repository.go` (add `CreateProduct`)
- Modify: `avtopulse-backend/internal/auth/handler.go` (add `CreateProduct` method + route)
- Modify: `avtopulse-backend/internal/auth/handler_test.go`
- Modify: `avtopulse-backend/internal/shop/handler_test.go`'s `fakeRepo` (implement the new interface method)

**Interfaces:**
- Consumes: `requireSession` (already in `auth` package), `shop.Repository` (extend with a new method).
- Produces: `shop.Repository.CreateProduct(ctx, shopID int64, p CreateProductInput) (*Product, error)`, `shop.CreateProductInput` struct, and the wired `POST /api/shops/me/products` endpoint.

- [ ] **Step 1: Add `CreateProductInput` to `avtopulse-backend/internal/shop/model.go`**

```go
type CreateProductInput struct {
	Name    string `json:"name"`
	Title   string `json:"title"`
	Details string `json:"details"`
	Marka   string `json:"marka"`
	Model   string `json:"model"`
	Il      int    `json:"il"`
	Qiymet  int    `json:"qiymet"`
	Yurus   int    `json:"yurus"`
	Yanacaq string `json:"yanacaq"`
	Ban     string `json:"ban"`
}
```

- [ ] **Step 2: Add `CreateProduct` to the `Repository` interface and `pgRepository` in `avtopulse-backend/internal/shop/repository.go`**

```go
	CreateProduct(ctx context.Context, shopID int64, input CreateProductInput) (*Product, error)
```

```go
func (r *pgRepository) CreateProduct(ctx context.Context, shopID int64, input CreateProductInput) (*Product, error) {
	var id int64
	err := r.pool.QueryRow(ctx,
		`INSERT INTO avto444.shop_products (name, title, details, marka, model, il, qiymet, yurus, yanacaq, ban, shop_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 RETURNING id`,
		input.Name, input.Title, input.Details, input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, shopID,
	).Scan(&id)
	if err != nil {
		return nil, err
	}

	return &Product{
		ID:      id,
		Name:    input.Name,
		Title:   input.Title,
		Details: input.Details,
		Marka:   input.Marka,
		Model:   input.Model,
		Il:      input.Il,
		Qiymet:  input.Qiymet,
		Yurus:   input.Yurus,
		Yanacaq: input.Yanacaq,
		Ban:     input.Ban,
		Images:  []ProductImage{},
	}, nil
}
```

- [ ] **Step 3: Update `avtopulse-backend/internal/shop/handler_test.go`'s `fakeRepo` to implement `CreateProduct`**

```go
func (f *fakeRepo) CreateProduct(ctx context.Context, shopID int64, input CreateProductInput) (*Product, error) {
	p := &Product{
		ID: int64(len(f.products[shopID]) + 100), Name: input.Name, Title: input.Title, Details: input.Details,
		Marka: input.Marka, Model: input.Model, Il: input.Il, Qiymet: input.Qiymet, Yurus: input.Yurus, Yanacaq: input.Yanacaq, Ban: input.Ban,
		Images: []ProductImage{},
	}
	f.products[shopID] = append(f.products[shopID], *p)
	return p, nil
}
```

(Adjust `f.products[shopID]` to match the actual field name in the existing `fakeRepo` struct — read the current test file first; the existing struct is `products map[int64][]Product`, confirmed from Task 3 of Phase 1's plan.)

- [ ] **Step 4: Add the `CreateProduct` method + route to `avtopulse-backend/internal/auth/handler.go`**

```go
type createProductRequest struct {
	Name    string `json:"name"`
	Title   string `json:"title"`
	Details string `json:"details"`
	Marka   string `json:"marka"`
	Model   string `json:"model"`
	Il      int    `json:"il"`
	Qiymet  int    `json:"qiymet"`
	Yurus   int    `json:"yurus"`
	Yanacaq string `json:"yanacaq"`
	Ban     string `json:"ban"`
}
```

Add the route registration inside `NewHandler` (alongside the existing 3):

```go
	r.Post("/me/products", h.CreateProduct)
```

Add the handler method:

```go
// CreateProduct godoc
// @Summary      Create a new product for the logged-in shop
// @Description  Requires a valid shop_session cookie. Creates a shop_products row owned by the authenticated shop.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      createProductRequest  true  "New product details"
// @Success      201   {object}  shop.Product
// @Failure      400   {string}  string  "invalid request body"
// @Failure      401   {string}  string  "unauthorized"
// @Failure      500   {string}  string  "internal error"
// @Router       /me/products [post]
func (h *authHandlers) CreateProduct(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var body createProductRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	product, err := h.shopRepo.CreateProduct(req.Context(), shopID, shop.CreateProductInput{
		Name: body.Name, Title: body.Title, Details: body.Details,
		Marka: body.Marka, Model: body.Model, Il: body.Il,
		Qiymet: body.Qiymet, Yurus: body.Yurus, Yanacaq: body.Yanacaq, Ban: body.Ban,
	})
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, product)
}
```

**IMPORTANT — this is a named method on the existing `*authHandlers` struct** (matching Phase 1's fix for the swag inline-closure bug), NOT an inline closure. Do not write `r.Post("/me/products", func(w http.ResponseWriter, req *http.Request) {...})`.

- [ ] **Step 5: Wire the new route into `cmd/server/main.go`**

Add one more explicit route registration next to the existing 3 `StripPrefix`-wrapped ones (or, per Phase 1's Minor finding, take this opportunity to hoist the wrapped handler once — either is acceptable, but if hoisting, verify all 4 routes still resolve correctly):

```go
	r.Post("/api/shops/me/products", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
```

- [ ] **Step 6: Write a new test in `avtopulse-backend/internal/auth/handler_test.go`**

```go
func TestCreateProduct_Success(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(newFakeShopRepo(), sessions)
	body, _ := json.Marshal(createProductRequest{
		Name: "toyota-camry-2", Title: "Toyota Camry, 2022", Marka: "Toyota", Model: "Camry", Il: 2022, Qiymet: 45000,
	})
	req := httptest.NewRequest(http.MethodPost, "/me/products", bytes.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d, body: %s", rec.Code, rec.Body.String())
	}
	var got shop.Product
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if got.Title != "Toyota Camry, 2022" || got.Marka != "Toyota" {
		t.Fatalf("unexpected product: %+v", got)
	}
}

func TestCreateProduct_NoCookie(t *testing.T) {
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore())
	body, _ := json.Marshal(createProductRequest{Name: "x", Title: "x"})
	req := httptest.NewRequest(http.MethodPost, "/me/products", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}
```

Note: the `fakeShopRepo` in `internal/auth/handler_test.go` must also implement `CreateProduct` (it's a separate test double from `internal/shop/handler_test.go`'s `fakeRepo` — both implement `shop.Repository`). Add:

```go
func (f *fakeShopRepo) CreateProduct(ctx context.Context, shopID int64, input shop.CreateProductInput) (*shop.Product, error) {
	return &shop.Product{ID: 999, Name: input.Name, Title: input.Title, Marka: input.Marka, Model: input.Model, Il: input.Il, Qiymet: input.Qiymet, Images: []shop.ProductImage{}}, nil
}
```

- [ ] **Step 7: Run tests**

```bash
cd avtopulse-backend
go build ./...
go test ./... -v
```

Expected: all tests pass, including the 2 new ones.

- [ ] **Step 8: Commit**

```bash
git add avtopulse-backend
git commit -m "feat: POST /api/shops/me/products — create product endpoint"
```

---

## Task 4: `POST /api/shops/me/products/{id}/images` and `POST /api/shops/me/logo` — image upload endpoints

**Files:**
- Modify: `avtopulse-backend/internal/shop/repository.go` (add `AddProductImage`, `GetProductShopID`, `SetShopLogo`)
- Modify: `avtopulse-backend/internal/auth/handler.go` (add `UploadProductImages`, `UploadLogo` methods + routes; add `storage.Client` field to `authHandlers`)
- Modify: `avtopulse-backend/internal/auth/handler_test.go`
- Modify: `avtopulse-backend/internal/shop/handler_test.go`'s `fakeRepo`
- Modify: `avtopulse-backend/cmd/server/main.go` (construct and pass the storage client)

**Interfaces:**
- Consumes: `storage.Client.Upload` (Task 2), `requireSession` (existing).
- Produces:
  - `shop.Repository.AddProductImage(ctx, productID int64, url string, sira int) (*ProductImage, error)`
  - `shop.Repository.GetProductShopID(ctx, productID int64) (int64, error)` — used to verify a product belongs to the authenticated shop before accepting an image upload for it
  - `shop.Repository.SetShopLogo(ctx, shopID int64, url string) error`
  - `auth.NewHandler` now takes a 3rd parameter, `storageClient storage.Client`

- [ ] **Step 1: Add the 3 new methods to the `Repository` interface and `pgRepository` in `avtopulse-backend/internal/shop/repository.go`**

```go
	AddProductImage(ctx context.Context, productID int64, url string, sira int) (*ProductImage, error)
	GetProductShopID(ctx context.Context, productID int64) (int64, error)
	SetShopLogo(ctx context.Context, shopID int64, url string) error
```

```go
func (r *pgRepository) AddProductImage(ctx context.Context, productID int64, url string, sira int) (*ProductImage, error) {
	var id int64
	err := r.pool.QueryRow(ctx,
		`INSERT INTO avto444.shop_product_images (product_id, url, sira) VALUES ($1, $2, $3) RETURNING id`,
		productID, url, sira,
	).Scan(&id)
	if err != nil {
		return nil, err
	}
	return &ProductImage{ID: id, URL: url, Sira: sira}, nil
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
```

- [ ] **Step 2: Update `avtopulse-backend/internal/shop/handler_test.go`'s `fakeRepo` to implement the 3 new methods**

```go
func (f *fakeRepo) AddProductImage(ctx context.Context, productID int64, url string, sira int) (*ProductImage, error) {
	return &ProductImage{ID: int64(sira + 1), URL: url, Sira: sira}, nil
}

func (f *fakeRepo) GetProductShopID(ctx context.Context, productID int64) (int64, error) {
	for shopID, products := range f.products {
		for _, p := range products {
			if p.ID == productID {
				return shopID, nil
			}
		}
	}
	return 0, ErrNotFound
}

func (f *fakeRepo) SetShopLogo(ctx context.Context, shopID int64, url string) error {
	return nil
}
```

- [ ] **Step 3: Update `avtopulse-backend/internal/auth/handler.go` — add storage dependency and 2 new handlers**

```go
type authHandlers struct {
	shopRepo shop.Repository
	sessions SessionStore
	storage  storage.Client
}

func NewHandler(shopRepo shop.Repository, sessions SessionStore, storageClient storage.Client) http.Handler {
	h := &authHandlers{shopRepo: shopRepo, sessions: sessions, storage: storageClient}
	r := chi.NewRouter()

	r.Post("/login", h.Login)
	r.Get("/me/products", h.MeProducts)
	r.Post("/me/products", h.CreateProduct)
	r.Post("/me/products/{id}/images", h.UploadProductImages)
	r.Post("/me/logo", h.UploadLogo)
	r.Post("/logout", h.Logout)

	return r
}
```

Add the import `"github.com/CavadJava/avtopulse-backend/internal/storage"` and `"strconv"`, `"path/filepath"`, `"fmt"` as needed.

```go
// UploadProductImages godoc
// @Summary      Upload one or more images for a product
// @Description  Requires a valid shop_session cookie. The product must belong to the authenticated shop.
// @Tags         auth
// @Accept       multipart/form-data
// @Produce      json
// @Param        id      path      int   true  "Product id"
// @Param        images  formData  file  true  "One or more image files"
// @Success      200     {array}   shop.ProductImage
// @Failure      400     {string}  string  "invalid product id or no files"
// @Failure      401     {string}  string  "unauthorized"
// @Failure      404     {string}  string  "product not found or not owned by this shop"
// @Failure      500     {string}  string  "internal error"
// @Router       /me/products/{id}/images [post]
func (h *authHandlers) UploadProductImages(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}

	ownerShopID, err := h.shopRepo.GetProductShopID(req.Context(), productID)
	if errors.Is(err, shop.ErrNotFound) || ownerShopID != shopID {
		http.Error(w, "product not found", http.StatusNotFound)
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

	var results []shop.ProductImage
	for i, fh := range files {
		f, err := fh.Open()
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		ext := filepath.Ext(fh.Filename)
		objectPath := fmt.Sprintf("magaza/%d/product/%d/%s%s", shopID, productID, uuidV4(), ext)
		url, err := h.storage.Upload(req.Context(), objectPath, f, fh.Size, fh.Header.Get("Content-Type"))
		f.Close()
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		img, err := h.shopRepo.AddProductImage(req.Context(), productID, url, i)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		results = append(results, *img)
	}

	writeJSON(w, http.StatusOK, results)
}

// UploadLogo godoc
// @Summary      Upload the logged-in shop's logo
// @Description  Requires a valid shop_session cookie.
// @Tags         auth
// @Accept       multipart/form-data
// @Produce      json
// @Param        logo  formData  file  true  "Logo image file"
// @Success      200   {object}  map[string]string
// @Failure      400   {string}  string  "invalid multipart form or no file"
// @Failure      401   {string}  string  "unauthorized"
// @Failure      500   {string}  string  "internal error"
// @Router       /me/logo [post]
func (h *authHandlers) UploadLogo(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if err := req.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "invalid multipart form", http.StatusBadRequest)
		return
	}
	f, fh, err := req.FormFile("logo")
	if err != nil {
		http.Error(w, "no file provided", http.StatusBadRequest)
		return
	}
	defer f.Close()

	ext := filepath.Ext(fh.Filename)
	objectPath := fmt.Sprintf("magaza/%d/logo/%s%s", shopID, uuidV4(), ext)
	url, err := h.storage.Upload(req.Context(), objectPath, f, fh.Size, fh.Header.Get("Content-Type"))
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if err := h.shopRepo.SetShopLogo(req.Context(), shopID, url); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"logoUrl": url})
}
```

Add a small `uuidV4()` helper — use `crypto/rand` directly (no new dependency needed, matching Phase 1's `internal/auth/session.go` token-generation style):

```go
func uuidV4() string {
	b := make([]byte, 16)
	rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
```

(Add `"crypto/rand"` to the imports — note this shadows/duplicates the random-generation already used in `internal/auth/session.go`; that's fine, they're in different files of the same package, or `session.go`'s own `rand.Read` usage can be reused if you prefer a single shared helper — either is acceptable, just avoid a naming collision if both end up in the same file.)

- [ ] **Step 4: Update `avtopulse-backend/internal/auth/handler_test.go`'s test setup for the new `NewHandler` signature**

Every existing call to `NewHandler(shopRepo, sessions)` in this file must become `NewHandler(shopRepo, sessions, fakeStorage)` — add a trivial fake storage double:

```go
type fakeStorageClient struct{}

func (f *fakeStorageClient) Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, error) {
	return "http://fake-storage/" + path, nil
}
```

Update every `NewHandler(...)` call site in this file (there are several, one per existing test) to pass `&fakeStorageClient{}` as the third argument.

- [ ] **Step 5: Write new tests for the 2 new endpoints in `avtopulse-backend/internal/auth/handler_test.go`**

```go
func TestUploadProductImages_Success(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	repo := newFakeShopRepo()
	h := NewHandler(repo, sessions, &fakeStorageClient{})

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("images", "test.jpg")
	fw.Write([]byte("fake image bytes"))
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/me/products/1/images", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
	var got []shop.ProductImage
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(got) != 1 || got[0].URL == "" {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestUploadProductImages_WrongShop(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 999) // a shop ID that doesn't own product 1

	h := NewHandler(newFakeShopRepo(), sessions, &fakeStorageClient{})

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("images", "test.jpg")
	fw.Write([]byte("fake image bytes"))
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/me/products/1/images", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestUploadLogo_Success(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(newFakeShopRepo(), sessions, &fakeStorageClient{})

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("logo", "logo.png")
	fw.Write([]byte("fake logo bytes"))
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/me/logo", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
}
```

Note: `TestUploadProductImages_WrongShop` requires `fakeShopRepo.GetProductShopID` (in `internal/auth/handler_test.go`'s own `fakeShopRepo`, separate from `internal/shop/handler_test.go`'s) to return a shop ID for product 1 that is NOT `999` — check `newFakeShopRepo()`'s existing setup (it seeds shop ID `1`) and add a `GetProductShopID` implementation there returning `1` for any product ID, so shop `999` correctly gets rejected.

- [ ] **Step 6: Wire the new dependency into `cmd/server/main.go`**

Add env vars and construct the storage client before constructing `auth.NewHandler`:

```go
	minioEndpoint := os.Getenv("AVTOPULSE_MINIO_ENDPOINT")
	minioAccessKey := os.Getenv("AVTOPULSE_MINIO_ACCESS_KEY")
	minioSecretKey := os.Getenv("AVTOPULSE_MINIO_SECRET_KEY")
	minioBucket := os.Getenv("AVTOPULSE_MINIO_BUCKET")
	minioPublicURL := os.Getenv("AVTOPULSE_MINIO_PUBLIC_URL")
	if minioEndpoint == "" || minioAccessKey == "" || minioSecretKey == "" || minioBucket == "" || minioPublicURL == "" {
		log.Fatal("AVTOPULSE_MINIO_ENDPOINT, AVTOPULSE_MINIO_ACCESS_KEY, AVTOPULSE_MINIO_SECRET_KEY, AVTOPULSE_MINIO_BUCKET, AVTOPULSE_MINIO_PUBLIC_URL env vars are required")
	}

	storageClient, err := storage.NewClient(ctx, minioEndpoint, minioAccessKey, minioSecretKey, minioBucket, minioPublicURL, false)
	if err != nil {
		log.Fatalf("failed to connect to minio: %v", err)
	}
```

And update the `auth.NewHandler` call:

```go
	authHandler := auth.NewHandler(shopRepo, sessions, storageClient)
```

Add the route registration for the new endpoint alongside the existing 3-then-4 `StripPrefix` ones:

```go
	r.Post("/api/shops/me/products/{id}/images", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
	r.Post("/api/shops/me/logo", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
```

Add the import `"github.com/CavadJava/avtopulse-backend/internal/storage"`.

- [ ] **Step 7: Run the full test suite**

```bash
cd avtopulse-backend
go build ./...
go test ./... -v
```

Expected: all tests pass (existing + new).

- [ ] **Step 8: Regenerate Swagger docs**

```bash
cd avtopulse-backend
$(go env GOPATH)/bin/swag init -g cmd/server/main.go -o docs --parseInternal
```

Verify `docs/swagger.json`'s `"paths"` field now lists 9 endpoints total (the original 6 plus `/me/products` POST, `/me/products/{id}/images`, `/me/logo`) — read the file directly, don't rely on a truncated snippet (Phase 1's empty-paths bug was originally missed exactly this way).

- [ ] **Step 9: Commit**

```bash
git add avtopulse-backend
git commit -m "feat: POST /api/shops/me/products/{id}/images and /me/logo — image upload endpoints"
```

---

## Task 5: Deploy backend to production — MinIO bucket + env vars + verification

**Files:** none in either repo — this is a deploy-only task, same pattern as Phase 1's Task 10.

**Interfaces:**
- Consumes: the built `avtopulse-backend` binary from Tasks 1-4.
- Produces: a live backend with all 9 endpoints reachable, MinIO `avtopulse-public` bucket created with public-read policy.

- [ ] **Step 1: rsync the updated backend source to the server**

```bash
rsync -avz --exclude='.git' --exclude='avtopulse-backend/server' \
  -e "ssh -i ~/.ssh/youtube-remote-webrtc_ed25519" \
  /Users/frontend/workspace/me-github/autopulse/avtopulse-backend/ \
  root@157.180.73.79:/opt/avtopulse-backend/
```

- [ ] **Step 2: Rebuild on the server**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 "export PATH=\$PATH:/usr/local/go/bin && cd /opt/avtopulse-backend && go build -o avtopulse-backend ./cmd/server && echo BUILD_OK"
```

- [ ] **Step 3: Add the new MinIO env vars to the systemd unit**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 "cat /etc/systemd/system/avtopulse-backend.service"
```

Edit `/etc/systemd/system/avtopulse-backend.service` on the server to add, in the `[Service]` section (alongside the existing `Environment=AVTOPULSE_DSN=...` and `Environment=AVTOPULSE_PORT=8090` lines):

```
Environment=AVTOPULSE_MINIO_ENDPOINT=127.0.0.1:9000
Environment=AVTOPULSE_MINIO_ACCESS_KEY=minioadmin
Environment=AVTOPULSE_MINIO_SECRET_KEY=eaa66106aca4721b0f560104321c0beb
Environment=AVTOPULSE_MINIO_BUCKET=avtopulse-public
Environment=AVTOPULSE_MINIO_PUBLIC_URL=https://minio-console.157.180.73.79.sslip.io/browser/avtopulse-public
```

Note on `AVTOPULSE_MINIO_PUBLIC_URL`: this must be a URL that resolves to the MinIO S3 API's public GET path for the bucket, not the web console UI. Check what's actually publicly reachable before finalizing this value — `curl` the console's proxy target directly (`ssh` in and check the Caddyfile's `minio-console` block, which currently proxies to `localhost:9001`, MinIO's *console* port, not `9000`'s S3 API). If no public S3-API endpoint currently exists, this step also requires adding a new Caddy `handle` (or a new subdomain block, e.g. `minio-s3.157.180.73.79.sslip.io { reverse_proxy 127.0.of.0.1:9000 }` — fix the typo, it should read `127.0.0.1:9000`) proxying to port 9000, and using that new public hostname as `AVTOPULSE_MINIO_PUBLIC_URL`. Do this Caddy addition as part of this step if needed, following the same validate-then-reload pattern as Phase 1's Task 10.

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 "systemctl daemon-reload && systemctl restart avtopulse-backend && systemctl status avtopulse-backend --no-pager"
```

- [ ] **Step 4: Verify all 9 endpoints manually**

```bash
curl -s https://autopulse.157.180.73.79.sslip.io/api/shops
echo

curl -s -c /tmp/avtopulse-verify-cookies.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/login \
  -H "Content-Type: application/json" -d '{"name":"avto444","password":"avto444pass"}'
echo

curl -s -b /tmp/avtopulse-verify-cookies.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/me/products \
  -H "Content-Type: application/json" \
  -d '{"name":"test-car","title":"Test Car, 2023","marka":"Test","model":"Car","il":2023,"qiymet":10000}'
echo

# Note the returned "id" from the previous response, substitute PRODUCT_ID below
curl -s -b /tmp/avtopulse-verify-cookies.txt -X POST \
  https://autopulse.157.180.73.79.sslip.io/api/shops/me/products/PRODUCT_ID/images \
  -F "images=@/path/to/a/local/test/image.jpg"
echo

curl -s -b /tmp/avtopulse-verify-cookies.txt -X POST \
  https://autopulse.157.180.73.79.sslip.io/api/shops/me/logo \
  -F "logo=@/path/to/a/local/test/logo.png"
echo

rm -f /tmp/avtopulse-verify-cookies.txt
```

Expected: product creation returns 201 with the new product's `id`; image upload returns 200 with a list containing a real, publicly-fetchable URL; logo upload returns 200 with `{"logoUrl": "..."}`. Fetch one returned image URL with a plain `curl -s -o /dev/null -w "%{http_code}\n" <url>` to confirm it's genuinely publicly accessible (200), not just that the API claimed success.

- [ ] **Step 5: Update `workspace/me-github/my-servers/avtopulse/credentials.md`**

Add a note recording: the systemd unit's new MinIO env vars, the final resolved value of `AVTOPULSE_MINIO_PUBLIC_URL` (whatever it ended up being after Step 3's investigation), and confirmation that the `avtopulse-public` bucket now exists with a public-read policy (`docker exec minio mc anonymous get local/avtopulse-public` should print `Access permission for ... is set to public`).

---

## Task 6: Frontend — `src/api/shop.ts` additions

**Files:**
- Modify: `src/api/shop.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `interface ProductImage { id: number; url: string; sira: number }`
  - `ShopProduct` extended with `marka, model, il, qiymet, yurus, yanacaq, ban: string|number` and `images: ProductImage[]`
  - `Shop` extended with `logoUrl: string`
  - `interface CreateProductInput { name, title, details, marka, model, il, qiymet, yurus, yanacaq, ban }`
  - `async function createShopProduct(input: CreateProductInput): Promise<ShopProduct>`
  - `async function uploadProductImages(productId: number, files: File[]): Promise<ProductImage[]>`
  - `async function uploadShopLogo(file: File): Promise<{ logoUrl: string }>`

- [ ] **Step 1: Update the `Shop`, `ShopProduct` interfaces and add `ProductImage`**

```typescript
export interface ProductImage {
  id: number;
  url: string;
  sira: number;
}

export interface Shop {
  id: number;
  name: string;
  customerId: number;
  title: string;
  details: string;
  workTimes: string;
  logoUrl: string;
}

export interface ShopProduct {
  id: number;
  name: string;
  title: string;
  details: string;
  marka: string;
  model: string;
  il: number;
  qiymet: number;
  yurus: number;
  yanacaq: string;
  ban: string;
  images: ProductImage[];
}
```

- [ ] **Step 2: Add `CreateProductInput` and `createShopProduct`**

```typescript
export interface CreateProductInput {
  name: string;
  title: string;
  details: string;
  marka: string;
  model: string;
  il: number;
  qiymet: number;
  yurus: number;
  yanacaq: string;
  ban: string;
}

export async function createShopProduct(input: CreateProductInput): Promise<ShopProduct> {
  const res = await fetch(`${API_BASE}/api/shops/me/products`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`createShopProduct failed: ${res.status}`);
  }
  return res.json();
}
```

- [ ] **Step 3: Add `uploadProductImages` and `uploadShopLogo`**

```typescript
export async function uploadProductImages(productId: number, files: File[]): Promise<ProductImage[]> {
  const form = new FormData();
  files.forEach((file) => form.append('images', file));

  const res = await fetch(`${API_BASE}/api/shops/me/products/${productId}/images`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`uploadProductImages failed: ${res.status}`);
  }
  return res.json();
}

export async function uploadShopLogo(file: File): Promise<{ logoUrl: string }> {
  const form = new FormData();
  form.append('logo', file);

  const res = await fetch(`${API_BASE}/api/shops/me/logo`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`uploadShopLogo failed: ${res.status}`);
  }
  return res.json();
}
```

Note: do NOT set a `Content-Type` header on these two `fetch` calls — the browser sets the correct `multipart/form-data; boundary=...` header automatically when the body is a `FormData` object; setting it manually breaks the boundary.

- [ ] **Step 4: Type-check**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/api/shop.ts || echo CLEAN
git add src/api/shop.ts
git commit -m "feat: add createShopProduct/uploadProductImages/uploadShopLogo to shop.ts"
```

---

## Task 7: Frontend — product-creation form and logo upload on `/magazam`

**Files:**
- Modify: `src/pages/shop/MyShop.tsx`
- Modify: `src/pages/shop/MyShop.module.css`

**Interfaces:**
- Consumes: `createShopProduct`, `uploadProductImages`, `uploadShopLogo` (Task 6).
- Produces: an in-page form on `/magazam` that creates a product and uploads its images, plus a logo-upload control.

- [ ] **Step 1: Rewrite `src/pages/shop/MyShop.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getMyShopProducts,
  shopLogout,
  createShopProduct,
  uploadProductImages,
  uploadShopLogo,
  ShopUnauthorizedError,
} from '../../api/shop';
import type { ShopProduct } from '../../api/shop';
import styles from './MyShop.module.css';

const EMPTY_FORM = {
  name: '',
  title: '',
  details: '',
  marka: '',
  model: '',
  il: '',
  qiymet: '',
  yurus: '',
  yanacaq: '',
  ban: '',
};

export default function MyShop() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const loadProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyShopProducts();
      setProducts(data);
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setError('Məhsullar yüklənərkən xəta baş verdi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    try {
      await shopLogout();
    } catch {
      // Best-effort — even if the network call fails, still take the user
      // back to the login page; they're no longer treating themselves as logged in.
    }
    navigate('/magaza-giris');
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.title.trim()) {
      setFormError('Ad və başlıq tələb olunur.');
      return;
    }
    setSaving(true);
    try {
      const created = await createShopProduct({
        name: form.name,
        title: form.title,
        details: form.details,
        marka: form.marka,
        model: form.model,
        il: form.il ? parseInt(form.il, 10) : 0,
        qiymet: form.qiymet ? parseInt(form.qiymet, 10) : 0,
        yurus: form.yurus ? parseInt(form.yurus, 10) : 0,
        yanacaq: form.yanacaq,
        ban: form.ban,
      });
      if (imageFiles.length > 0) {
        await uploadProductImages(created.id, imageFiles);
      }
      setForm(EMPTY_FORM);
      setImageFiles([]);
      setShowForm(false);
      await loadProducts();
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setFormError('Məhsul yaradılarkən xəta baş verdi.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async () => {
    if (!logoFile) return;
    setLogoError(null);
    setLogoUploading(true);
    try {
      const result = await uploadShopLogo(logoFile);
      setLogoUrl(result.logoUrl);
      setLogoFile(null);
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setLogoError('Loqo yüklənərkən xəta baş verdi.');
    } finally {
      setLogoUploading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>Yüklənir...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Mənim mağazam</h1>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          Çıxış
        </button>
      </div>

      <div className={styles.logoSection}>
        <div className={styles.logoLabel}>Mağaza logosu</div>
        {logoUrl && <img src={logoUrl} alt="Mağaza logosu" className={styles.logoPreview} />}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
        />
        <button
          className={styles.uploadBtn}
          onClick={handleLogoUpload}
          disabled={!logoFile || logoUploading}
        >
          {logoUploading ? 'Yüklənir...' : 'Logo yüklə'}
        </button>
        {logoError && <p className={styles.formError}>{logoError}</p>}
      </div>

      <button className={styles.toggleFormBtn} onClick={() => setShowForm((v) => !v)}>
        {showForm ? '− Formu bağla' : '+ Yeni məhsul əlavə et'}
      </button>

      {showForm && (
        <form onSubmit={handleCreateProduct} className={styles.form}>
          <input
            className={styles.input}
            placeholder="Ad (slug), məs. toyota-camry-2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="Başlıq, məs. Toyota Camry, 2022"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="Marka"
            value={form.marka}
            onChange={(e) => setForm({ ...form, marka: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="Model"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
          <input
            className={styles.input}
            type="number"
            placeholder="İl"
            value={form.il}
            onChange={(e) => setForm({ ...form, il: e.target.value })}
          />
          <input
            className={styles.input}
            type="number"
            placeholder="Qiymət (AZN)"
            value={form.qiymet}
            onChange={(e) => setForm({ ...form, qiymet: e.target.value })}
          />
          <input
            className={styles.input}
            type="number"
            placeholder="Yürüş (km)"
            value={form.yurus}
            onChange={(e) => setForm({ ...form, yurus: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="Yanacaq"
            value={form.yanacaq}
            onChange={(e) => setForm({ ...form, yanacaq: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="Ban növü"
            value={form.ban}
            onChange={(e) => setForm({ ...form, ban: e.target.value })}
          />
          <textarea
            className={styles.textarea}
            placeholder="Təsvir"
            value={form.details}
            onChange={(e) => setForm({ ...form, details: e.target.value })}
          />
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))}
          />
          {formError && <p className={styles.formError}>{formError}</p>}
          <button className={styles.submitBtn} type="submit" disabled={saving}>
            {saving ? 'Yaradılır...' : 'Məhsulu yarat'}
          </button>
        </form>
      )}

      {error && <p className={styles.status}>{error}</p>}

      {!error && products.length === 0 && (
        <p className={styles.status}>Hələ heç bir məhsulunuz yoxdur.</p>
      )}

      {!error && products.length > 0 && (
        <div className={styles.grid}>
          {products.map((product) => (
            <div key={product.id} className={styles.productCard}>
              {product.images?.[0] && (
                <img
                  src={product.images[0].url}
                  alt={product.title}
                  className={styles.productImage}
                />
              )}
              <div className={styles.productTitle}>{product.title}</div>
              {product.details && <div className={styles.productDetails}>{product.details}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Extend `src/pages/shop/MyShop.module.css`** — read the current file first, then append these new rules (matching the file's existing token-based conventions, no hardcoded colors):

```css
.logoSection {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  margin-bottom: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
}

.logoLabel {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
}

.logoPreview {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.uploadBtn {
  background: var(--accent);
  color: #fff;
  border: none;
  font-size: 13px;
  font-weight: 700;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
}

.uploadBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggleFormBtn {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
  padding: 10px 18px;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-6);
}

.toggleFormBtn:hover {
  box-shadow: none;
  border-color: var(--accent);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  margin-bottom: var(--space-6);
}

.form .input,
.form .textarea {
  padding: 10px 12px;
  font-size: 14px;
  background: var(--bg-elevated);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
}

.form .textarea {
  min-height: 80px;
  resize: vertical;
}

.formError {
  color: var(--error);
  font-size: 13px;
  font-weight: 600;
}

.submitBtn {
  background: var(--accent);
  color: #fff;
  border: none;
  font-weight: 700;
  font-size: 14px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
}

.submitBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.productImage {
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-3);
}
```

- [ ] **Step 3: Type-check and build**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc --noEmit
npm run build
```

Expected: both succeed with no errors.

- [ ] **Step 4: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/shop/MyShop.tsx src/pages/shop/MyShop.module.css || echo CLEAN
git add src/pages/shop/MyShop.tsx src/pages/shop/MyShop.module.css
git commit -m "feat: product-creation form and logo upload on /magazam"
```

---

## Task 8: Frontend — render logo/images on the public storefront

**Files:**
- Modify: `src/pages/shop/ShopFront.tsx`
- Modify: `src/pages/shop/ShopFront.module.css`

**Interfaces:**
- Consumes: `Shop.logoUrl`, `ShopProduct.images` (Task 6's extended interfaces).

- [ ] **Step 1: Update `src/pages/shop/ShopFront.tsx`'s hero and product-card rendering**

Replace the hero block:

```tsx
      <div className={styles.hero}>
        {shop.logoUrl ? (
          <img src={shop.logoUrl} alt={shop.title} className={styles.heroLogo} />
        ) : (
          <div className={styles.heroIcon}>🏪</div>
        )}
        <div>
          <h1 className={styles.title}>{shop.title}</h1>
          <p className={styles.name}>@{shop.name}</p>
        </div>
      </div>
```

Replace the product card rendering:

```tsx
          {products.map((product) => (
            <div key={product.id} className={styles.productCard}>
              {product.images?.[0] && (
                <img
                  src={product.images[0].url}
                  alt={product.title}
                  className={styles.productImage}
                />
              )}
              <div className={styles.productTitle}>{product.title}</div>
              {product.details && <div className={styles.productDetails}>{product.details}</div>}
            </div>
          ))}
```

- [ ] **Step 2: Add matching CSS to `src/pages/shop/ShopFront.module.css`** (read the current file first, append):

```css
.heroLogo {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.productImage {
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-3);
}
```

- [ ] **Step 3: Type-check and build**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc --noEmit
npm run build
```

Expected: both succeed with no errors.

- [ ] **Step 4: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/shop/ShopFront.tsx src/pages/shop/ShopFront.module.css || echo CLEAN
git add src/pages/shop/ShopFront.tsx src/pages/shop/ShopFront.module.css
git commit -m "feat: render shop logo and product images on the public storefront"
```

---

## Task 9: Production deploy — frontend + full end-to-end live verification

**Files:** none — deploy-only task.

- [ ] **Step 1: Push and deploy the frontend**

```bash
cd /Users/frontend/workspace/me-github/autopulse
git push origin main
bash deploy/deploy.sh
```

- [ ] **Step 2: Full live end-to-end verification**

```bash
curl -s -o /dev/null -w "magazam: %{http_code}\n" https://autopulse.157.180.73.79.sslip.io/magazam
curl -s -o /dev/null -w "magazalar/avto444: %{http_code}\n" https://autopulse.157.180.73.79.sslip.io/magazalar/avto444
curl -s https://autopulse.157.180.73.79.sslip.io/api/shops/by-name/avto444
```

Confirm the last command's response now includes a non-empty `logoUrl` if Task 5's manual verification uploaded a test logo, and `curl` one product's image URL directly to confirm public accessibility (200).

- [ ] **Step 3: Update `workspace/me-github/my-servers/avtopulse/credentials.md`**

Add the 3 new endpoints to the "Live endpoints" list, and note the final Swagger UI now documents 9 endpoints total.

---

## Self-Review Notes

- **Spec coverage:** DB schema extension (logo_url, car-detail columns, shop_product_images) → Task 1. MinIO client → Task 2. 3 new endpoints (create product, upload product images, upload logo) → Tasks 3-4. Production MinIO bucket setup + env wiring → Task 5. Frontend API client → Task 6. `/magazam` product form + logo upload → Task 7. Public storefront rendering → Task 8. Final deploy → Task 9. Swagger reuse for new endpoints → Task 4 Step 8, per the design spec's explicit note.
- **Placeholder scan:** no TBD/TODO markers; every step has literal, runnable code or commands. Task 5's Step 3 flags a genuine unresolved detail (whether a public S3-API-reachable hostname already exists) as an explicit investigation step with a concrete fallback (add a new Caddy block) — this is not a placeholder, it's an honest unknown the implementer must resolve by checking the live Caddyfile, which cannot be pre-determined from this desk.
- **Type consistency:** Go `shop.Product`/`shop.ProductImage`/`shop.CreateProductInput` field names and JSON tags (Task 1, 3) match the TypeScript `ShopProduct`/`ProductImage`/`CreateProductInput` interfaces (Task 6) exactly — `marka, model, il, qiymet, yurus, yanacaq, ban` used consistently as both Go struct field names' JSON tags and TS interface field names across all tasks.
- **Named-method constraint:** every new handler in Tasks 3-4 is written as a method on the existing `*authHandlers` struct, never an inline closure — explicitly called out in Task 3 Step 4 and consistent with Phase 1's fix.
