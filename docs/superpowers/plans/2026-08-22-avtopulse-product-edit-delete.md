# AutoPulse Marketplace Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in shop edit and delete its own products (and individual product images) via `/magazam`, show both the MinIO and real-AWS-S3 URL for every uploaded image, and stop the frontend from ever showing a stale/cached product list.

**Architecture:** Three new authenticated endpoints (`PUT /me/products/{id}`, `DELETE /me/products/{id}`, `DELETE /me/products/{id}/images/{imageId}`) are added as new named methods on the existing `authHandlers` struct — reusing the exact ownership-check pattern already proven in `UploadProductImages` (`GetProductShopID` + shop-ID comparison before any write). `storage.Client`'s `Upload` method gains a dual-URL variant so callers can see both storage backends' URLs. The `ProductImage.URL` JSON field is renamed to `minioUrl` with a new sibling `s3Url` — this is a breaking rename, so every consumer (Go and TypeScript) is updated in the same pass. The frontend adds an inline edit form (reusing the existing create-product form's field set) and delete buttons to `MyShop.tsx`, and adds `cache: 'no-store'` to every GET fetch in `src/api/shop.ts`.

**Tech Stack:** Go 1.26.5, `chi`, `pgx/v5`, `minio-go/v7` (existing — no new dependencies), React 18 + TypeScript (existing conventions).

## Global Constraints

- New handlers MUST be named methods on the existing `authHandlers` struct (`internal/auth/handler.go`), never inline closures — Phase 1 hit a real Swagger-generation bug from inline closures; do not reintroduce it.
- All 3 new endpoints require the ownership check pattern from `UploadProductImages` (`internal/auth/handler.go:232-253`): resolve the authenticated shop's ID via `requireSession`, then compare against the product's actual owning shop ID via `GetProductShopID` — 404 (not 403, matching the existing convention that avoids leaking whether a product ID exists) if they don't match.
- The `ProductImage.URL` (Go) / `ProductImage.url` (TS) field is renamed to `MinioURL`/`minioUrl`. A new `S3URL`/`s3Url` field is added alongside it (nullable/optional — empty string in Go, `undefined` in TS if the dual-storage secondary write didn't happen, e.g. AWS env vars unset). Every place that reads or writes this field (Go and TS) must be updated in the same pass — there is no transition period where both names work.
- Every backend task must end with `go build ./...` and `go test ./...` passing (run from `avtopulse-backend/`). Every frontend task must end with `npx tsc --noEmit` and `npm run build` passing, plus the standing corruption scan (`grep -rn 'Ɛ\|Ɔ'` across touched files) before any commit.
- Follow the existing deploy workflow: backend changes via rsync + rebuild + `systemctl restart avtopulse-backend` (see `workspace/me-github/my-servers/avtopulse/credentials.md`); frontend changes via `git push origin main` then `bash deploy/deploy.sh` from `/Users/frontend/workspace/me-github/autopulse`.
- Do not touch `/elan-ver` or any existing mock-data marketplace code — this phase only touches `avtopulse-backend/`, `src/api/shop.ts`, and `src/pages/shop/*`.
- Deleting a product must delete its `shop_product_images` rows first (FK constraint), then the `shop_products` row itself — in that order, in a single transaction so a failure partway through doesn't leave orphaned image rows or a half-deleted product.

---

## Task 1: Database migration — rename `url` to `minio_url`, add `s3_url`

**Files:**
- Create: `avtopulse-backend/migrations/0004_shop_product_images_dual_url.sql`
- Modify: `avtopulse-backend/internal/shop/model.go`
- Modify: `avtopulse-backend/internal/shop/repository.go`

**Interfaces:**
- Consumes: nothing new — extends the existing `db.RunMigrations` runner (Phase 1) and `shop.Repository`.
- Produces: `ProductImage{ID int64; MinioURL string; S3URL string; Sira int}` (JSON tags `minioUrl`/`s3Url`); `Repository.AddProductImage` signature changes to accept both URLs.

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE avto444.shop_product_images RENAME COLUMN url TO minio_url;
ALTER TABLE avto444.shop_product_images ADD COLUMN s3_url TEXT;
```

Save as `avtopulse-backend/migrations/0004_shop_product_images_dual_url.sql`.

- [ ] **Step 2: Update `avtopulse-backend/internal/shop/model.go`'s `ProductImage` struct**

```go
type ProductImage struct {
	ID       int64  `json:"id"`
	MinioURL string `json:"minioUrl"`
	S3URL    string `json:"s3Url"`
	Sira     int    `json:"sira"`
}
```

- [ ] **Step 3: Update `avtopulse-backend/internal/shop/repository.go`'s `Repository` interface and `AddProductImage`**

Change the interface method signature:

```go
	AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int) (*ProductImage, error)
```

Change the implementation:

```go
func (r *pgRepository) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int) (*ProductImage, error) {
	var id int64
	err := r.pool.QueryRow(ctx,
		`INSERT INTO avto444.shop_product_images (product_id, minio_url, s3_url, sira) VALUES ($1, $2, $3, $4) RETURNING id`,
		productID, minioURL, s3URL, sira,
	).Scan(&id)
	if err != nil {
		return nil, err
	}
	return &ProductImage{ID: id, MinioURL: minioURL, S3URL: s3URL, Sira: sira}, nil
}
```

- [ ] **Step 4: Update `listProductImages` (same file) to select/scan the new columns**

```go
func (r *pgRepository) listProductImages(ctx context.Context, productID int64) ([]ProductImage, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, minio_url, COALESCE(s3_url, ''), sira FROM avto444.shop_product_images WHERE product_id = $1 ORDER BY sira, id`,
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
```

- [ ] **Step 5: Update `avtopulse-backend/internal/shop/handler_test.go`'s `fakeRepo.AddProductImage`**

Read the current signature in that file first, then update it to match Step 3's new 5-argument signature:

```go
func (f *fakeRepo) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int) (*ProductImage, error) {
	return &ProductImage{ID: int64(sira + 1), MinioURL: minioURL, S3URL: s3URL, Sira: sira}, nil
}
```

- [ ] **Step 6: Run tests to confirm nothing else broke**

```bash
cd avtopulse-backend
go build ./... 2>&1 | head -50
```

Expected: a compile error will appear in `internal/auth/handler.go` (its call to `AddProductImage` still uses the old 4-arg signature) — this is expected and fixed in Task 3. For this task, confirm the ONLY compile errors are in `internal/auth/handler.go` (not in `internal/shop/`), proving Task 1's own package builds correctly in isolation:

```bash
go build ./internal/shop/... ./internal/db/... ./internal/storage/...
```

Expected: succeeds with no errors (these packages don't call `AddProductImage`).

- [ ] **Step 7: Apply the migration against the local test DB**

```bash
export AVTOPULSE_TEST_DSN="postgres://localhost:5432/avtopulse_test?sslmode=disable"
go test ./internal/db/... -v
```

Expected: `PASS` (applies migration 0004 alongside the already-applied 0001-0003).

- [ ] **Step 8: Commit**

```bash
git add avtopulse-backend
git commit -m "feat: rename shop_product_images.url to minio_url, add s3_url column"
```

Note: `internal/auth/handler.go` will not compile after this commit until Task 3 lands — this is an intentionally incremental, expected mid-plan state; do not attempt to make Task 1 build the whole module.

---

## Task 2: Dual-URL upload support in `storage.Client`

**Files:**
- Modify: `avtopulse-backend/internal/storage/dual.go`
- Modify: `avtopulse-backend/internal/storage/minio.go`
- Modify: `avtopulse-backend/internal/storage/s3.go`
- Modify: `avtopulse-backend/internal/storage/dual_test.go`

**Interfaces:**
- Consumes: nothing new from Task 1.
- Produces: `Client.UploadDual(ctx, path string, data io.Reader, size int64, contentType string) (minioURL, s3URL string, err error)` — a new method on the `Client` interface. `Upload` (the existing single-URL method) is kept for backward compatibility with any other caller, but `UploadDual` is what Task 3's handlers will call.

- [ ] **Step 1: Add `UploadDual` to the `Client` interface in `avtopulse-backend/internal/storage/minio.go`**

```go
type Client interface {
	// Upload puts data at the given object path inside the configured bucket
	// and returns a publicly-reachable URL for it (the bucket has a
	// public-read policy, so no signed URL is needed for GET).
	Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, error)

	// UploadDual is like Upload but additionally returns the secondary
	// (real AWS S3, if configured) storage's URL alongside the primary
	// (MinIO) one. For a single-storage client (plain minioClient or
	// s3Client used standalone), the second return value is always "".
	UploadDual(ctx context.Context, path string, data io.Reader, size int64, contentType string) (minioURL, s3URL string, err error)
}
```

- [ ] **Step 2: Implement `UploadDual` on `minioClient` (same file) — delegates to `Upload`, empty secondary**

```go
func (c *minioClient) UploadDual(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, string, error) {
	url, err := c.Upload(ctx, path, data, size, contentType)
	return url, "", err
}
```

- [ ] **Step 3: Implement `UploadDual` on `s3Client` in `avtopulse-backend/internal/storage/s3.go` — mirrors `minioClient`'s pattern but with an empty PRIMARY (this client's own URL goes in the secondary slot if ever used standalone as "primary"; in practice it's never constructed standalone in this codebase, this is purely to satisfy the interface)**

```go
func (c *s3Client) UploadDual(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, string, error) {
	url, err := c.Upload(ctx, path, data, size, contentType)
	return url, "", err
}
```

- [ ] **Step 4: Implement `UploadDual` on `dualClient` in `avtopulse-backend/internal/storage/dual.go` — this is the one that actually returns both URLs**

Replace the existing `Upload` method's body is unchanged; add `UploadDual` as a new method:

```go
func (d *dualClient) UploadDual(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, string, error) {
	buf, err := io.ReadAll(data)
	if err != nil {
		return "", "", fmt.Errorf("storage: buffering upload %q: %w", path, err)
	}

	minioURL, err := d.primary.Upload(ctx, path, bytes.NewReader(buf), size, contentType)
	if err != nil {
		return "", "", fmt.Errorf("storage: primary (minio) upload failed: %w", err)
	}

	s3URL, err := d.secondary.Upload(ctx, "shop/"+path, bytes.NewReader(buf), size, contentType)
	if err != nil {
		return "", "", fmt.Errorf("storage: secondary (aws s3) upload failed: %w", err)
	}

	return minioURL, s3URL, nil
}
```

Also update the existing `Upload` method on `dualClient` to just call `UploadDual` and discard the second value, avoiding duplicated logic:

```go
func (d *dualClient) Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, error) {
	minioURL, _, err := d.UploadDual(ctx, path, data, size, contentType)
	return minioURL, err
}
```

- [ ] **Step 5: Update `avtopulse-backend/internal/storage/dual_test.go`'s `fakeClient` to implement `UploadDual`**

Read the current `fakeClient` struct first, then add:

```go
func (f *fakeClient) UploadDual(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, string, error) {
	url, err := f.Upload(ctx, path, data, size, contentType)
	return url, "", err
}
```

- [ ] **Step 6: Add a new test verifying `dualClient.UploadDual` returns both URLs distinctly**

```go
func TestDualClient_UploadDual_ReturnsBothURLs(t *testing.T) {
	primary := &fakeClient{}
	secondary := &fakeClient{}
	client := NewDualClient(primary, secondary)

	dc, ok := client.(interface {
		UploadDual(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, string, error)
	})
	if !ok {
		t.Fatal("expected dualClient to implement UploadDual")
	}

	minioURL, s3URL, err := dc.UploadDual(context.Background(), "test/foo.jpg", strings.NewReader("data"), 4, "image/jpeg")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if minioURL != "http://fake/test/foo.jpg" {
		t.Fatalf("expected minio URL from primary, got %q", minioURL)
	}
	if s3URL != "http://fake/shop/test/foo.jpg" {
		t.Fatalf("expected s3 URL from secondary with shop/ prefix, got %q", s3URL)
	}
}
```

- [ ] **Step 7: Run tests**

```bash
cd avtopulse-backend
go build ./internal/storage/...
go test ./internal/storage/... -v
```

Expected: all pass, including the 4 pre-existing dual-client tests plus the new one.

- [ ] **Step 8: Commit**

```bash
git add avtopulse-backend
git commit -m "feat: add UploadDual to storage.Client for visible minio+s3 URLs"
```

---

## Task 3: Wire dual-URL uploads into handlers + add edit/delete endpoints

**Files:**
- Modify: `avtopulse-backend/internal/shop/repository.go` (add `DeleteProduct`, `GetImageProductID`, `DeleteProductImage`, `UpdateProduct`)
- Modify: `avtopulse-backend/internal/auth/handler.go` (update `UploadProductImages`/`UploadLogo` to use `UploadDual`; add `UpdateProduct`, `DeleteProduct`, `DeleteProductImage` methods + routes)
- Modify: `avtopulse-backend/internal/auth/handler_test.go`
- Modify: `avtopulse-backend/internal/shop/handler_test.go`'s `fakeRepo`
- Modify: `avtopulse-backend/cmd/server/main.go` (wire the 3 new routes)

**Interfaces:**
- Consumes: `storage.Client.UploadDual` (Task 2), `shop.ProductImage{MinioURL, S3URL}` (Task 1).
- Produces: `shop.Repository.UpdateProduct(ctx, productID int64, input CreateProductInput) (*Product, error)`, `shop.Repository.DeleteProduct(ctx, productID int64) error`, `shop.Repository.GetImageProductID(ctx, imageID int64) (int64, error)`, `shop.Repository.DeleteProductImage(ctx, imageID int64) error`; 3 new routes: `PUT /api/shops/me/products/{id}`, `DELETE /api/shops/me/products/{id}`, `DELETE /api/shops/me/products/{id}/images/{imageId}`.

- [ ] **Step 1: Add the 4 new methods to the `Repository` interface and `pgRepository` in `avtopulse-backend/internal/shop/repository.go`**

```go
	UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error)
	DeleteProduct(ctx context.Context, productID int64) error
	GetImageProductID(ctx context.Context, imageID int64) (int64, error)
	DeleteProductImage(ctx context.Context, imageID int64) error
```

```go
func (r *pgRepository) UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error) {
	_, err := r.pool.Exec(ctx,
		`UPDATE avto444.shop_products
		 SET name = $1, title = $2, details = $3, marka = $4, model = $5, il = $6, qiymet = $7, yurus = $8, yanacaq = $9, ban = $10
		 WHERE id = $11`,
		input.Name, input.Title, input.Details, input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, productID,
	)
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
		Yurus: input.Yurus, Yanacaq: input.Yanacaq, Ban: input.Ban, Images: images,
	}, nil
}

func (r *pgRepository) DeleteProduct(ctx context.Context, productID int64) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) // no-op if Commit succeeds

	if _, err := tx.Exec(ctx, `DELETE FROM avto444.shop_product_images WHERE product_id = $1`, productID); err != nil {
		return fmt.Errorf("deleting product images: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM avto444.shop_products WHERE id = $1`, productID); err != nil {
		return fmt.Errorf("deleting product: %w", err)
	}

	return tx.Commit(ctx)
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
```

Add `"fmt"` to this file's imports if not already present (check the current import block first).

- [ ] **Step 2: Update `avtopulse-backend/internal/shop/handler_test.go`'s `fakeRepo` to implement the 4 new methods**

```go
func (f *fakeRepo) UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error) {
	for shopID, products := range f.products {
		for i, p := range products {
			if p.ID == productID {
				updated := Product{
					ID: productID, Name: input.Name, Title: input.Title, Details: input.Details,
					Marka: input.Marka, Model: input.Model, Il: input.Il, Qiymet: input.Qiymet,
					Yurus: input.Yurus, Yanacaq: input.Yanacaq, Ban: input.Ban, Images: p.Images,
				}
				f.products[shopID][i] = updated
				return &updated, nil
			}
		}
	}
	return nil, ErrNotFound
}

func (f *fakeRepo) DeleteProduct(ctx context.Context, productID int64) error {
	for shopID, products := range f.products {
		for i, p := range products {
			if p.ID == productID {
				f.products[shopID] = append(products[:i], products[i+1:]...)
				return nil
			}
		}
	}
	return ErrNotFound
}

func (f *fakeRepo) GetImageProductID(ctx context.Context, imageID int64) (int64, error) {
	return 1, nil // simplified fake — tests exercising this in detail construct their own fakeRepo
}

func (f *fakeRepo) DeleteProductImage(ctx context.Context, imageID int64) error {
	return nil
}
```

(Read the actual current `fakeRepo` struct fields first — the brief here assumes a `products map[int64][]Product` field, matching Phase 2's Task 3 plan; adapt field names if the real struct differs.)

- [ ] **Step 3: Update `internal/auth/handler.go`'s `UploadProductImages` and `UploadLogo` to use `UploadDual` and populate both URL fields**

In `UploadProductImages`, change the upload call:

```go
		minioURL, s3URL, err := h.storage.UploadDual(req.Context(), objectPath, f, fh.Size, fh.Header.Get("Content-Type"))
		f.Close()
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		img, err := h.shopRepo.AddProductImage(req.Context(), productID, minioURL, s3URL, i)
```

In `UploadLogo`, similarly:

```go
	minioURL, _, err := h.storage.UploadDual(req.Context(), objectPath, f, fh.Size, fh.Header.Get("Content-Type"))
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if err := h.shopRepo.SetShopLogo(req.Context(), shopID, minioURL); err != nil {
```

(Logo only needs the MinIO URL per the existing `SetShopLogo(ctx, shopID int64, url string) error` signature — no schema change needed there; the S3 copy still happens via `UploadDual`, its URL is just not persisted for logos, matching the spec's stated scope of only product images getting dual-URL visibility. If you'd like logos to also expose both URLs, that's a larger schema change — NOT part of this task; stick to the plan as written.)

- [ ] **Step 4: Add the 3 new endpoint methods to `internal/auth/handler.go`**

```go
type updateProductRequest struct {
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

// UpdateProduct godoc
// @Summary      Update an existing product owned by the logged-in shop
// @Description  Requires a valid shop_session cookie. The product must belong to the authenticated shop.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        id    path      int                    true  "Product id"
// @Param        body  body      updateProductRequest   true  "Updated product details"
// @Success      200   {object}  shop.Product
// @Failure      400   {string}  string  "invalid product id or request body"
// @Failure      401   {string}  string  "unauthorized"
// @Failure      404   {string}  string  "product not found or not owned by this shop"
// @Failure      500   {string}  string  "internal error"
// @Router       /me/products/{id} [put]
func (h *authHandlers) UpdateProduct(w http.ResponseWriter, req *http.Request) {
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

	var body updateProductRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	product, err := h.shopRepo.UpdateProduct(req.Context(), productID, shop.CreateProductInput{
		Name: body.Name, Title: body.Title, Details: body.Details,
		Marka: body.Marka, Model: body.Model, Il: body.Il,
		Qiymet: body.Qiymet, Yurus: body.Yurus, Yanacaq: body.Yanacaq, Ban: body.Ban,
	})
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, product)
}

// DeleteProduct godoc
// @Summary      Delete a product owned by the logged-in shop
// @Description  Requires a valid shop_session cookie. Deletes the product and all its images.
// @Tags         auth
// @Produce      json
// @Param        id  path  int  true  "Product id"
// @Success      200  {object}  map[string]bool
// @Failure      400  {string}  string  "invalid product id"
// @Failure      401  {string}  string  "unauthorized"
// @Failure      404  {string}  string  "product not found or not owned by this shop"
// @Failure      500  {string}  string  "internal error"
// @Router       /me/products/{id} [delete]
func (h *authHandlers) DeleteProduct(w http.ResponseWriter, req *http.Request) {
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

	if err := h.shopRepo.DeleteProduct(req.Context(), productID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// DeleteProductImage godoc
// @Summary      Delete a single image from a product owned by the logged-in shop
// @Description  Requires a valid shop_session cookie. The image's product must belong to the authenticated shop.
// @Tags         auth
// @Produce      json
// @Param        id       path  int  true  "Product id"
// @Param        imageId  path  int  true  "Image id"
// @Success      200      {object}  map[string]bool
// @Failure      400      {string}  string  "invalid product or image id"
// @Failure      401      {string}  string  "unauthorized"
// @Failure      404      {string}  string  "product or image not found, or not owned by this shop"
// @Failure      500      {string}  string  "internal error"
// @Router       /me/products/{id}/images/{imageId} [delete]
func (h *authHandlers) DeleteProductImage(w http.ResponseWriter, req *http.Request) {
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
	imageID, err := strconv.ParseInt(chi.URLParam(req, "imageId"), 10, 64)
	if err != nil {
		http.Error(w, "invalid image id", http.StatusBadRequest)
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

	imageProductID, err := h.shopRepo.GetImageProductID(req.Context(), imageID)
	if errors.Is(err, shop.ErrNotFound) || imageProductID != productID {
		http.Error(w, "image not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if err := h.shopRepo.DeleteProductImage(req.Context(), imageID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}
```

- [ ] **Step 5: Register the 3 new routes inside `NewHandler` (same file)**

```go
	r.Put("/me/products/{id}", h.UpdateProduct)
	r.Delete("/me/products/{id}", h.DeleteProduct)
	r.Delete("/me/products/{id}/images/{imageId}", h.DeleteProductImage)
```

- [ ] **Step 6: Update `internal/auth/handler_test.go`'s `fakeShopRepo` to implement the 4 new `shop.Repository` methods**

```go
func (f *fakeShopRepo) UpdateProduct(ctx context.Context, productID int64, input shop.CreateProductInput) (*shop.Product, error) {
	return &shop.Product{ID: productID, Name: input.Name, Title: input.Title, Marka: input.Marka, Model: input.Model, Il: input.Il, Qiymet: input.Qiymet, Images: []shop.ProductImage{}}, nil
}

func (f *fakeShopRepo) DeleteProduct(ctx context.Context, productID int64) error {
	return nil
}

func (f *fakeShopRepo) GetImageProductID(ctx context.Context, imageID int64) (int64, error) {
	return 1, nil
}

func (f *fakeShopRepo) DeleteProductImage(ctx context.Context, imageID int64) error {
	return nil
}
```

(Read the file's current `fakeShopRepo` struct first to confirm field/method conventions match.)

- [ ] **Step 7: Add tests for the 3 new endpoints in `internal/auth/handler_test.go`**

```go
func TestUpdateProduct_Success(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(newFakeShopRepo(), sessions, &fakeStorageClient{})
	body, _ := json.Marshal(updateProductRequest{Name: "updated-car", Title: "Updated Car, 2024", Marka: "Toyota", Model: "Corolla", Il: 2024, Qiymet: 30000})
	req := httptest.NewRequest(http.MethodPut, "/me/products/1", bytes.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
	var got shop.Product
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if got.Title != "Updated Car, 2024" {
		t.Fatalf("unexpected product: %+v", got)
	}
}

func TestUpdateProduct_WrongShop(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 999)

	h := NewHandler(newFakeShopRepo(), sessions, &fakeStorageClient{})
	body, _ := json.Marshal(updateProductRequest{Name: "x", Title: "x"})
	req := httptest.NewRequest(http.MethodPut, "/me/products/1", bytes.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteProduct_Success(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(newFakeShopRepo(), sessions, &fakeStorageClient{})
	req := httptest.NewRequest(http.MethodDelete, "/me/products/1", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
}

func TestDeleteProduct_NoCookie(t *testing.T) {
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore(), &fakeStorageClient{})
	req := httptest.NewRequest(http.MethodDelete, "/me/products/1", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestDeleteProductImage_Success(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(newFakeShopRepo(), sessions, &fakeStorageClient{})
	req := httptest.NewRequest(http.MethodDelete, "/me/products/1/images/1", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
}
```

- [ ] **Step 8: Wire the 3 new routes into `cmd/server/main.go`**

Add 3 more explicit `StripPrefix`-wrapped route registrations, next to the existing ones for `/me/products`, `/me/products/{id}/images`, `/me/logo`:

```go
	r.Put("/api/shops/me/products/{id}", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
	r.Delete("/api/shops/me/products/{id}", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
	r.Delete("/api/shops/me/products/{id}/images/{imageId}", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
```

- [ ] **Step 9: Run the full test suite**

```bash
cd avtopulse-backend
go build ./...
go test ./... -v
```

Expected: all tests pass (existing + new).

- [ ] **Step 10: Regenerate Swagger docs**

```bash
cd avtopulse-backend
$(go env GOPATH)/bin/swag init -g cmd/server/main.go -o docs --parseInternal
```

Read `docs/swagger.json`'s full `"paths"` object directly (not a truncated snippet — this exact mistake caused a real bug in Phase 1) to confirm it now lists 11 unique path templates total (the 8 from Phase 2 plus `/me/products/{id}` [put, delete] and `/me/products/{id}/images/{imageId}` [delete]).

- [ ] **Step 11: Commit**

```bash
git add avtopulse-backend
git commit -m "feat: PUT/DELETE /me/products/{id}, DELETE /me/products/{id}/images/{imageId}, dual-URL uploads"
```

---

## Task 4: Frontend — `src/api/shop.ts` additions + no-cache on all GETs

**Files:**
- Modify: `src/api/shop.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `ProductImage` interface updated to `{ id: number; minioUrl: string; s3Url: string; sira: number }`
  - `async function updateShopProduct(id: number, input: CreateProductInput): Promise<ShopProduct>`
  - `async function deleteShopProduct(id: number): Promise<void>`
  - `async function deleteProductImage(productId: number, imageId: number): Promise<void>`
  - All existing GET functions (`getShops`, `getShopByName`, `getShopProducts`, `getMyShopProducts`) get `cache: 'no-store'` added to their `fetch` options.

- [ ] **Step 1: Update the `ProductImage` interface**

```typescript
export interface ProductImage {
  id: number;
  minioUrl: string;
  s3Url: string;
  sira: number;
}
```

- [ ] **Step 2: Add `cache: 'no-store'` to the 4 existing GET functions**

```typescript
export async function getShops(): Promise<ShopSummary[]> {
  const res = await fetch(`${API_BASE}/api/shops`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`getShops failed: ${res.status}`);
  }
  return res.json();
}

export async function getShopByName(name: string): Promise<Shop> {
  const res = await fetch(`${API_BASE}/api/shops/by-name/${encodeURIComponent(name)}`, { cache: 'no-store' });
  if (res.status === 404) {
    throw new ShopNotFoundError(`Shop not found: ${name}`);
  }
  if (!res.ok) {
    throw new Error(`getShopByName failed: ${res.status}`);
  }
  return res.json();
}

export async function getShopProducts(shopId: number): Promise<ShopProduct[]> {
  const res = await fetch(`${API_BASE}/api/shops/${shopId}/products`, { cache: 'no-store' });
  if (res.status === 404) {
    throw new ShopNotFoundError(`Shop not found: ${shopId}`);
  }
  if (!res.ok) {
    throw new Error(`getShopProducts failed: ${res.status}`);
  }
  return res.json();
}

export async function getMyShopProducts(): Promise<ShopProduct[]> {
  const res = await fetch(`${API_BASE}/api/shops/me/products`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getMyShopProducts failed: ${res.status}`);
  }
  return res.json();
}
```

- [ ] **Step 3: Add `updateShopProduct`, `deleteShopProduct`, `deleteProductImage`**

```typescript
export async function updateShopProduct(id: number, input: CreateProductInput): Promise<ShopProduct> {
  const res = await fetch(`${API_BASE}/api/shops/me/products/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (res.status === 404) {
    throw new ShopNotFoundError(`Product not found: ${id}`);
  }
  if (!res.ok) {
    throw new Error(`updateShopProduct failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteShopProduct(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/shops/me/products/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (res.status === 404) {
    throw new ShopNotFoundError(`Product not found: ${id}`);
  }
  if (!res.ok) {
    throw new Error(`deleteShopProduct failed: ${res.status}`);
  }
}

export async function deleteProductImage(productId: number, imageId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/shops/me/products/${productId}/images/${imageId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (res.status === 404) {
    throw new ShopNotFoundError(`Image not found: ${imageId}`);
  }
  if (!res.ok) {
    throw new Error(`deleteProductImage failed: ${res.status}`);
  }
}
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc --noEmit
```

Expected: errors will appear in `src/pages/shop/MyShop.tsx` and `src/pages/shop/ShopFront.tsx` (both still reference `product.images[0].url`, the old field name) — this is expected and fixed in Tasks 5-6. For this task, confirm the errors are ONLY in those two files, not in `src/api/shop.ts` itself.

- [ ] **Step 5: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/api/shop.ts || echo CLEAN
git add src/api/shop.ts
git commit -m "feat: add updateShopProduct/deleteShopProduct/deleteProductImage, no-cache GETs, minioUrl/s3Url rename"
```

Note: this repo will not fully type-check until Task 6 lands — an intentionally incremental, expected mid-plan state.

---

## Task 5: Frontend — `ShopFront.tsx` rename fix

**Files:**
- Modify: `src/pages/shop/ShopFront.tsx`

**Interfaces:**
- Consumes: `ProductImage.minioUrl` (Task 4).

- [ ] **Step 1: Update the product image reference**

Find the line rendering `product.images[0].url` and change it to `product.images[0].minioUrl` (the public storefront only needs to show one working image URL — MinIO's is the one guaranteed to always be populated, per Task 1's design where `s3Url` can be empty if AWS isn't configured):

```tsx
              {product.images?.[0] && (
                <img
                  src={product.images[0].minioUrl}
                  alt={product.title}
                  className={styles.productImage}
                />
              )}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc --noEmit
```

Expected: remaining errors (if any) should now be confined to `src/pages/shop/MyShop.tsx` only (fixed in Task 6).

- [ ] **Step 3: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/shop/ShopFront.tsx || echo CLEAN
git add src/pages/shop/ShopFront.tsx
git commit -m "fix: ShopFront.tsx uses renamed ProductImage.minioUrl field"
```

---

## Task 6: Frontend — edit/delete UI + dual-storage labels on `/magazam`

**Files:**
- Modify: `src/pages/shop/MyShop.tsx`
- Modify: `src/pages/shop/MyShop.module.css`

**Interfaces:**
- Consumes: `updateShopProduct`, `deleteShopProduct`, `deleteProductImage` (Task 4), `ProductImage.minioUrl`/`.s3Url` (Task 4).
- Produces: working "Redaktə et" and "Sil" buttons per product card, per-image delete buttons, MinIO/AWS S3 labels under each image.

- [ ] **Step 1: Read the current `src/pages/shop/MyShop.tsx` in full** (296 lines as of this plan being written — confirm the exact current line numbers before editing, since Task 4/5 don't touch this file and it may have shifted slightly from other concurrent work).

- [ ] **Step 2: Add new state for editing, right after the existing `logoError` state declaration**

```tsx
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editImageFiles, setEditImageFiles] = useState<File[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);
```

- [ ] **Step 3: Add the import for the 3 new API functions**

Update the existing import block at the top of the file:

```tsx
import {
  getMyShopProducts,
  shopLogout,
  createShopProduct,
  uploadProductImages,
  uploadShopLogo,
  updateShopProduct,
  deleteShopProduct,
  deleteProductImage,
  ShopUnauthorizedError,
} from '../../api/shop';
```

- [ ] **Step 4: Add handler functions, right after the existing `handleCreateProduct` function**

```tsx
  const startEdit = (product: ShopProduct) => {
    setEditingProductId(product.id);
    setEditForm({
      name: product.name,
      title: product.title,
      details: product.details,
      marka: product.marka,
      model: product.model,
      il: String(product.il || ''),
      qiymet: String(product.qiymet || ''),
      yurus: String(product.yurus || ''),
      yanacaq: product.yanacaq,
      ban: product.ban,
    });
    setEditImageFiles([]);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingProductId(null);
    setEditForm(EMPTY_FORM);
    setEditImageFiles([]);
    setEditError(null);
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProductId === null) return;
    setEditError(null);
    if (!editForm.name.trim() || !editForm.title.trim()) {
      setEditError('Ad və başlıq tələb olunur.');
      return;
    }
    setEditSaving(true);
    try {
      await updateShopProduct(editingProductId, {
        name: editForm.name,
        title: editForm.title,
        details: editForm.details,
        marka: editForm.marka,
        model: editForm.model,
        il: editForm.il ? parseInt(editForm.il, 10) : 0,
        qiymet: editForm.qiymet ? parseInt(editForm.qiymet, 10) : 0,
        yurus: editForm.yurus ? parseInt(editForm.yurus, 10) : 0,
        yanacaq: editForm.yanacaq,
        ban: editForm.ban,
      });
      if (editImageFiles.length > 0) {
        try {
          await uploadProductImages(editingProductId, editImageFiles);
        } catch (err) {
          if (err instanceof ShopUnauthorizedError) {
            navigate('/magaza-giris');
            return;
          }
          setNotice('Məhsul yeniləndi, amma yeni şəkillər yüklənmədi.');
        }
      }
      cancelEdit();
      await loadProducts();
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setEditError('Məhsul yenilənərkən xəta baş verdi.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!window.confirm('Bu məhsulu silmək istədiyinizə əminsiniz?')) return;
    setDeletingProductId(productId);
    try {
      await deleteShopProduct(productId);
      await loadProducts();
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setNotice('Məhsul silinərkən xəta baş verdi.');
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleDeleteImage = async (productId: number, imageId: number) => {
    try {
      await deleteProductImage(productId, imageId);
      await loadProducts();
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setNotice('Şəkil silinərkən xəta baş verdi.');
    }
  };
```

- [ ] **Step 5: Replace the product grid rendering block**

Find the existing block that renders `{!error && products.length > 0 && (...)}` and replace its inner `.map` with:

```tsx
          {products.map((product) => (
            <div key={product.id} className={styles.productCard}>
              {editingProductId === product.id ? (
                <form onSubmit={handleUpdateProduct} className={styles.form}>
                  <input
                    className={styles.input}
                    placeholder="Ad (slug)"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    placeholder="Başlıq"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    placeholder="Marka"
                    value={editForm.marka}
                    onChange={(e) => setEditForm({ ...editForm, marka: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    placeholder="Model"
                    value={editForm.model}
                    onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    type="number"
                    placeholder="İl"
                    value={editForm.il}
                    onChange={(e) => setEditForm({ ...editForm, il: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    type="number"
                    placeholder="Qiymət (AZN)"
                    value={editForm.qiymet}
                    onChange={(e) => setEditForm({ ...editForm, qiymet: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    type="number"
                    placeholder="Yürüş (km)"
                    value={editForm.yurus}
                    onChange={(e) => setEditForm({ ...editForm, yurus: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    placeholder="Yanacaq"
                    value={editForm.yanacaq}
                    onChange={(e) => setEditForm({ ...editForm, yanacaq: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    placeholder="Ban növü"
                    value={editForm.ban}
                    onChange={(e) => setEditForm({ ...editForm, ban: e.target.value })}
                  />
                  <textarea
                    className={styles.textarea}
                    placeholder="Təsvir"
                    value={editForm.details}
                    onChange={(e) => setEditForm({ ...editForm, details: e.target.value })}
                  />

                  {product.images && product.images.length > 0 && (
                    <div className={styles.imageManageGrid}>
                      {product.images.map((img) => (
                        <div key={img.id} className={styles.imageManageItem}>
                          <img src={img.minioUrl} alt="" className={styles.imageManageThumb} />
                          <div className={styles.storageLabels}>
                            <span className={styles.storageLabel}>MinIO</span>
                            {img.s3Url && <span className={styles.storageLabel}>AWS S3</span>}
                          </div>
                          <button
                            type="button"
                            className={styles.imageDeleteBtn}
                            onClick={() => handleDeleteImage(product.id, img.id)}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setEditImageFiles(Array.from(e.target.files ?? []))}
                  />
                  {editError && <p className={styles.formError}>{editError}</p>}
                  <div className={styles.editActions}>
                    <button className={styles.submitBtn} type="submit" disabled={editSaving}>
                      {editSaving ? 'Yenilənir...' : 'Yadda saxla'}
                    </button>
                    <button type="button" className={styles.cancelBtn} onClick={cancelEdit}>
                      Ləğv et
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {product.images?.[0] && (
                    <img
                      src={product.images[0].minioUrl}
                      alt={product.title}
                      className={styles.productImage}
                    />
                  )}
                  {product.images && product.images.length > 0 && (
                    <div className={styles.storageLabels}>
                      <span className={styles.storageLabel}>MinIO</span>
                      {product.images[0].s3Url && <span className={styles.storageLabel}>AWS S3</span>}
                    </div>
                  )}
                  <div className={styles.productTitle}>{product.title}</div>
                  {product.details && <div className={styles.productDetails}>{product.details}</div>}
                  <div className={styles.productActions}>
                    <button className={styles.editBtn} onClick={() => startEdit(product)}>
                      ✎ Redaktə et
                    </button>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDeleteProduct(product.id)}
                      disabled={deletingProductId === product.id}
                    >
                      {deletingProductId === product.id ? 'Silinir...' : '🗑 Sil'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
```

- [ ] **Step 6: Append new CSS classes to `src/pages/shop/MyShop.module.css`** — read the current file first, then append (matching the file's existing token-based conventions):

```css
.productActions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.editBtn {
  flex: 1;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
}

.editBtn:hover {
  box-shadow: none;
  border-color: var(--accent);
}

.deleteBtn {
  flex: 1;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--error);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
}

.deleteBtn:hover {
  box-shadow: none;
  border-color: var(--error);
}

.deleteBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cancelBtn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 14px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
}

.cancelBtn:hover {
  box-shadow: none;
  color: var(--text-primary);
}

.editActions {
  display: flex;
  gap: var(--space-2);
}

.editActions .submitBtn {
  flex: 2;
}

.editActions .cancelBtn {
  flex: 1;
}

.imageManageGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: var(--space-2);
  margin: var(--space-2) 0;
}

.imageManageItem {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.imageManageThumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.imageDeleteBtn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--scrim, rgba(0, 0, 0, 0.7));
  color: #fff;
  border: none;
  font-size: 11px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.storageLabels {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.storageLabel {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-tertiary);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  padding: 2px 6px;
  border-radius: 100px;
}
```

- [ ] **Step 7: Type-check and build**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc --noEmit
npm run build
```

Expected: both succeed with no errors — this is the task where the whole repo becomes consistent again after the Task 1/4 rename.

- [ ] **Step 8: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/shop/MyShop.tsx src/pages/shop/MyShop.module.css || echo CLEAN
git add src/pages/shop/MyShop.tsx src/pages/shop/MyShop.module.css
git commit -m "feat: product edit/delete UI, per-image delete, MinIO/AWS S3 storage labels on /magazam"
```

---

## Task 7: Production deploy + end-to-end verification

**Files:** none — deploy-only task.

- [ ] **Step 1: Full local verification before deploy**

```bash
cd /Users/frontend/workspace/me-github/autopulse/avtopulse-backend
go build ./...
go test ./... -v

cd /Users/frontend/workspace/me-github/autopulse
npx tsc --noEmit
npm run build
```

Expected: all green.

- [ ] **Step 2: Push to main**

```bash
git push origin main
```

- [ ] **Step 3: Deploy the backend**

```bash
rsync -avz --exclude='.git' --exclude='avtopulse-backend/server' \
  -e "ssh -i ~/.ssh/youtube-remote-webrtc_ed25519" \
  /Users/frontend/workspace/me-github/autopulse/avtopulse-backend/ \
  root@157.180.73.79:/opt/avtopulse-backend/

ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "export PATH=\$PATH:/usr/local/go/bin && cd /opt/avtopulse-backend && go build -o avtopulse-backend ./cmd/server && echo BUILD_OK"

ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "chown youtube-remote:youtube-remote /opt/avtopulse-backend/avtopulse-backend && systemctl restart avtopulse-backend && sleep 1 && systemctl status avtopulse-backend --no-pager"
```

Expected: `active (running)`, and the startup log line confirms migrations ran (migration 0004 applies automatically via `db.RunMigrations` on server start).

- [ ] **Step 4: Deploy the frontend**

```bash
cd /Users/frontend/workspace/me-github/autopulse
bash deploy/deploy.sh
```

- [ ] **Step 5: Full live end-to-end verification**

```bash
# Login and confirm the response still shows only ShopSummary (unaffected by this plan)
curl -s -c /tmp/verify-cookies.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/login \
  -H "Content-Type: application/json" -d '{"name":"avto444","password":"avto444pass"}'
echo

# Confirm a real existing product now shows minioUrl/s3Url (not the old url field)
curl -s https://autopulse.157.180.73.79.sslip.io/api/shops/1/products | python3 -c "
import json, sys
data = json.load(sys.stdin)
with_images = [p for p in data if p['images']]
print(json.dumps(with_images[0] if with_images else 'no products with images', indent=2))
"

# Update a product (use a real product id from the previous output)
curl -s -b /tmp/verify-cookies.txt -X PUT https://autopulse.157.180.73.79.sslip.io/api/shops/me/products/PRODUCT_ID \
  -H "Content-Type: application/json" \
  -d '{"name":"test-updated","title":"Test Updated Title","marka":"Test","model":"Model","il":2024,"qiymet":1000,"yurus":0,"yanacaq":"Benzin","ban":"Sedan"}'
echo

# Delete a single image (use a real image id)
curl -s -b /tmp/verify-cookies.txt -X DELETE https://autopulse.157.180.73.79.sslip.io/api/shops/me/products/PRODUCT_ID/images/IMAGE_ID
echo

rm -f /tmp/verify-cookies.txt
```

Expected: the products response shows `minioUrl` and `s3Url` fields (not `url`); the PUT returns the updated product with the new title; the image DELETE returns `{"deleted":true}`.

**Do NOT run the product-DELETE verification against any of the real demo products created in this session (`bmw-320i`, `mercedes-e200`, `toyota-camry`, `hyundai-sonata`, `kia-sportage`, `nissan-altima`, `volkswagen-golf`, `toyota-rav4`, `honda-civic`, `mazda-cx5`)** — if you need to verify `DELETE /me/products/{id}` end-to-end, first create a new throwaway test product via `POST /me/products`, verify deleting THAT one works, and leave the demo catalog untouched.

- [ ] **Step 6: Update `workspace/me-github/my-servers/avtopulse/credentials.md`**

Add the 3 new endpoints to the "Live endpoints" list, and a note that `ProductImage`'s JSON field was renamed (`url` → `minioUrl`, new `s3Url`) as of this deploy — anyone testing against the API directly (e.g. via curl, as done throughout this project) needs to know the old `url` field no longer exists.

---

## Self-Review Notes

- **Spec coverage:** DB migration (url→minio_url, +s3_url) → Task 1. Dual-URL storage.Client.UploadDual → Task 2. PUT/DELETE endpoints + ownership checks + transactional delete → Task 3. Frontend API client additions + no-cache → Task 4. ShopFront.tsx rename fix → Task 5. MyShop.tsx edit/delete UI + storage labels → Task 6. Deploy + e2e verification, including explicit instruction to never delete real demo products → Task 7.
- **Breaking rename sequencing:** Task 1 intentionally leaves `internal/auth/handler.go` non-compiling until Task 3 lands (documented explicitly in Task 1's Step 6 and end note) — this is a deliberate, called-out incremental state, not an oversight. Same pattern on the frontend: Task 4 leaves `MyShop.tsx`/`ShopFront.tsx` non-compiling until Tasks 5-6 land (documented in Task 4's Step 4 and end note).
- **Placeholder scan:** no TBD/TODO markers; every step has literal, runnable code.
- **Type consistency:** Go `shop.ProductImage{MinioURL, S3URL}` JSON tags (`minioUrl`/`s3Url`) match the TS `ProductImage` interface exactly across Tasks 1, 4, 5, 6. `Repository.AddProductImage`'s new 5-arg signature (Task 1) is used consistently in Task 3's handler update. `UploadDual`'s 3-return-value signature (Task 2) is used consistently in Task 3.
- **Ownership-check pattern reuse:** `UpdateProduct`, `DeleteProduct`, and `DeleteProductImage` (Task 3) all use the identical `requireSession` → `GetProductShopID` → compare → 404-on-mismatch pattern already proven and reviewed in Phase 2's `UploadProductImages`, per the Global Constraints.
- **Demo data protection:** Task 7 explicitly calls out the 10 real demo products created in this session by name and instructs the deploy-verification step to never delete them, creating a disposable test product instead — this was a real risk given the task naturally involves testing a DELETE endpoint against live production data.
