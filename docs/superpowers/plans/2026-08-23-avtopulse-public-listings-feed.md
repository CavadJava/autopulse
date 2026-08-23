# AutoPulse Public Unified Listings Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any visitor see every approved (`saytda`) listing across both shops and individual users in one public feed (`/elanlar` and the homepage), and open any real listing's detail page to see its actual fields, images, and seller identity (shop name or "Şəxsi") — without needing any login.

**Architecture:** A new, small, fully public (unauthenticated) Go package `internal/listings` reads from the EXISTING `shop.Repository` and `user.Repository` (adding one new read method to each: `ListActiveProducts`, returning only `status='saytda'` rows plus the owning shop's name where applicable) and merges them into one JSON array with a `source: "shop" | "user"` discriminant field. The frontend's `src/api/listings.ts` gets real `getListings()`/`getListingById()` implementations that call this new API instead of the in-memory `mockListings` array — but the existing mock `Listing` type and its rich UI (`ListingDetail.tsx`, `InteractiveGallery`, `ListingDetailTabs`) are NOT touched or made to render real data; a real listing gets routed to a brand-new, deliberately simpler detail page (`RealListingDetail.tsx`) built for the smaller real field set. `Listings.tsx`/`Home.tsx` render both mock-shaped and real-shaped listings by normalizing both into one shared summary-card shape.

**Tech Stack:** Go 1.26.5, `chi`, `pgx/v5` (existing — no new dependencies), React 18 + TypeScript (existing conventions).

## Global Constraints

- Full design reference: `docs/superpowers/specs/2026-08-23-avtopulse-public-listings-feed-design.md`. This plan implements exactly what that spec's "Daxildir" section describes — no view-count/contact-count tracking, no real-time expiry ticker, no rich fields added to `shop_products`/`user_products`, no shop-storefront redirect. All of those are explicitly out of scope.
- This is a fully PUBLIC, unauthenticated API — `GET /api/listings` and `GET /api/listings/{source}/{id}` require no cookie/session at all. Do not add any auth middleware to these two routes.
- Only `status='saytda'` rows are ever returned by this new package — a `gozlemede`/`legv_edilib` listing must be 404 from `GET /api/listings/{source}/{id}` and absent from `GET /api/listings`, exactly like the existing public shop storefront endpoint (`GET /api/shops/{shopId}/products`) already does.
- Seller identity: a shop-sourced listing must expose the shop's real name (`sellerName`); a user-sourced listing must expose an EMPTY `sellerName` (never the individual's phone or name) — this is a deliberate privacy decision, confirmed explicitly with the user. `sellerType` is `"diler"` for shop listings, `"şəxsi"` for user listings.
- Do NOT modify the existing mock `Listing` type (`src/types/index.ts`), `mockListings` data, `ListingDetail.tsx`, `InteractiveGallery.tsx`, or `ListingDetailTabs.tsx` — these continue to serve the pre-existing sample/demo listings exactly as before. A real (shop/user) listing is rendered by an entirely separate, new detail page.
- Every backend task must end with `go build ./...` and `go test ./...` passing (run from `avtopulse-backend/`). Every frontend task must end with `npx tsc -b --noEmit` (NOT plain `npx tsc --noEmit`) and `npm run build` passing, run from the repo root, plus the standing corruption scan (`grep -rn 'Ɛ\|Ɔ'` across touched files) before any commit.
- Follow the existing deploy workflow: backend via rsync + `go build` on server + `systemctl restart avtopulse-backend`; frontend via `git push origin main` + `bash deploy/deploy.sh` from `/Users/frontend/workspace/me-github/autopulse`.
- Do not touch the 12 real live products (10 original demo products + `mazda-cx4` + a leftover disposable test product, per `credentials.md`) or any real shop/user account during live verification — always create disposable test data instead.

---

## Task 1: Backend — `ListActiveProducts` on both repositories, new `internal/listings` package

**Files:**
- Modify: `avtopulse-backend/internal/shop/repository.go` (add `ListActiveProducts`)
- Modify: `avtopulse-backend/internal/user/repository.go` (add `ListActiveProducts`)
- Create: `avtopulse-backend/internal/listings/model.go`
- Create: `avtopulse-backend/internal/listings/handler.go`
- Create: `avtopulse-backend/internal/listings/handler_test.go`
- Modify: `avtopulse-backend/internal/shop/handler_test.go` (extend fakeRepo)
- Modify: `avtopulse-backend/internal/auth/handler_test.go` (extend fakeShopRepo)
- Modify: `avtopulse-backend/internal/admin/handler_test.go` (extend fakeShopRepo/fakeUserRepo, if those implement the full interface — check first)

**Interfaces:**
- Consumes: `shop.Repository`, `user.Repository` (existing).
- Produces: `shop.Repository.ListActiveProducts(ctx) ([]ProductWithShopName, error)` (a NEW return type, since the plain `shop.Product` has no shop-name field), `user.Repository.ListActiveProducts(ctx) ([]Product, error)`, `listings.PublicListing{Source, ID, Marka, Model, Il, Qiymet, Yurus, Yanacaq, Ban, Title, Details, Images, SellerType, SellerName}`, `listings.NewHandler(userRepo user.Repository, shopRepo shop.Repository) http.Handler`.

- [ ] **Step 1: Add a new `ProductWithShopName` type and `ListActiveProducts` method to `internal/shop/repository.go`**

Add near the top of the file, after the existing type declarations (this file doesn't have a dedicated model.go — types live directly in `internal/shop/model.go`, so add this new type there instead):

In `avtopulse-backend/internal/shop/model.go`, add:

```go
type ProductWithShopName struct {
	Product
	ShopName string `json:"shopName"`
}
```

In `avtopulse-backend/internal/shop/repository.go`, add to the `Repository` interface:

```go
	ListActiveProducts(ctx context.Context) ([]ProductWithShopName, error)
```

Add the implementation (joins `shop_products` to `shop` for the name, filters to `status='saytda'` only):

```go
func (r *pgRepository) ListActiveProducts(ctx context.Context) ([]ProductWithShopName, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT sp.id, sp.name, sp.title, COALESCE(sp.details, ''),
		        COALESCE(sp.marka, ''), COALESCE(sp.model, ''), COALESCE(sp.il, 0),
		        COALESCE(sp.qiymet, 0), COALESCE(sp.yurus, 0), COALESCE(sp.yanacaq, ''), COALESCE(sp.ban, ''), sp.status,
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
```

- [ ] **Step 2: Add `ListActiveProducts` to `internal/user/repository.go`** (no join needed — user identity is never exposed):

Add to the `Repository` interface:

```go
	ListActiveProducts(ctx context.Context) ([]Product, error)
```

Add the implementation:

```go
func (r *pgRepository) ListActiveProducts(ctx context.Context) ([]Product, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, COALESCE(marka, ''), COALESCE(model, ''), COALESCE(il, 0),
		        COALESCE(qiymet, 0), COALESCE(yurus, 0), COALESCE(yanacaq, ''), COALESCE(ban, ''),
		        title, COALESCE(details, ''), status
		 FROM avto444.user_products WHERE status = 'saytda' ORDER BY id`,
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
```

- [ ] **Step 3: Write `internal/listings/model.go`**

```go
package listings

type ImageOut struct {
	MinioURL string `json:"minioUrl"`
	S3URL    string `json:"s3Url"`
	Sira     int    `json:"sira"`
}

type PublicListing struct {
	Source     string     `json:"source"` // "shop" or "user"
	ID         int64      `json:"id"`
	Marka      string     `json:"marka"`
	Model      string     `json:"model"`
	Il         int        `json:"il"`
	Qiymet     int        `json:"qiymet"`
	Yurus      int        `json:"yurus"`
	Yanacaq    string     `json:"yanacaq"`
	Ban        string     `json:"ban"`
	Title      string     `json:"title"`
	Details    string     `json:"details"`
	Images     []ImageOut `json:"images"`
	SellerType string     `json:"sellerType"` // "diler" or "şəxsi"
	SellerName string     `json:"sellerName"` // shop name, or "" for user listings
}
```

- [ ] **Step 4: Write `internal/listings/handler.go`**

```go
package listings

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"github.com/CavadJava/avtopulse-backend/internal/user"
	"github.com/go-chi/chi/v5"
)

type listingsHandlers struct {
	userRepo user.Repository
	shopRepo shop.Repository
}

func NewHandler(userRepo user.Repository, shopRepo shop.Repository) http.Handler {
	h := &listingsHandlers{userRepo: userRepo, shopRepo: shopRepo}
	r := chi.NewRouter()

	r.Get("/", h.PublicListings)
	r.Get("/{source}/{id}", h.PublicListingDetail)

	return r
}

func toImageOut(minioURL, s3URL string, sira int) ImageOut {
	return ImageOut{MinioURL: minioURL, S3URL: s3URL, Sira: sira}
}

// PublicListings godoc
// @Summary      List every approved listing across shops and individual users
// @Description  Fully public — no authentication required. Only status='saytda' listings are included.
// @Tags         listings
// @Produce      json
// @Success      200  {array}   PublicListing
// @Failure      500  {string}  string  "internal error"
// @Router       /listings [get]
func (h *listingsHandlers) PublicListings(w http.ResponseWriter, req *http.Request) {
	out := []PublicListing{}

	shopProducts, err := h.shopRepo.ListActiveProducts(req.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	for _, p := range shopProducts {
		images := make([]ImageOut, len(p.Images))
		for i, img := range p.Images {
			images[i] = toImageOut(img.MinioURL, img.S3URL, img.Sira)
		}
		out = append(out, PublicListing{
			Source: "shop", ID: p.ID, Marka: p.Marka, Model: p.Model, Il: p.Il,
			Qiymet: p.Qiymet, Yurus: p.Yurus, Yanacaq: p.Yanacaq, Ban: p.Ban,
			Title: p.Title, Details: p.Details, Images: images,
			SellerType: "diler", SellerName: p.ShopName,
		})
	}

	userProducts, err := h.userRepo.ListActiveProducts(req.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	for _, p := range userProducts {
		images := make([]ImageOut, len(p.Images))
		for i, img := range p.Images {
			images[i] = toImageOut(img.MinioURL, img.S3URL, img.Sira)
		}
		out = append(out, PublicListing{
			Source: "user", ID: p.ID, Marka: p.Marka, Model: p.Model, Il: p.Il,
			Qiymet: p.Qiymet, Yurus: p.Yurus, Yanacaq: p.Yanacaq, Ban: p.Ban,
			Title: p.Title, Details: p.Details, Images: images,
			SellerType: "şəxsi", SellerName: "",
		})
	}

	writeJSON(w, http.StatusOK, out)
}

// PublicListingDetail godoc
// @Summary      Get one approved listing's detail, by source and id
// @Description  Fully public — no authentication required. source must be "shop" or "user". Only status='saytda' listings are visible.
// @Tags         listings
// @Produce      json
// @Param        source  path  string  true  "shop or user"
// @Param        id      path  int     true  "Listing id"
// @Success      200     {object}  PublicListing
// @Failure      400     {string}  string  "invalid source or id"
// @Failure      404     {string}  string  "listing not found"
// @Failure      500     {string}  string  "internal error"
// @Router       /listings/{source}/{id} [get]
func (h *listingsHandlers) PublicListingDetail(w http.ResponseWriter, req *http.Request) {
	source := chi.URLParam(req, "source")
	if source != "shop" && source != "user" {
		http.Error(w, "invalid source", http.StatusBadRequest)
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	if source == "shop" {
		shopProducts, err := h.shopRepo.ListActiveProducts(req.Context())
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		for _, p := range shopProducts {
			if p.ID != id {
				continue
			}
			images := make([]ImageOut, len(p.Images))
			for i, img := range p.Images {
				images[i] = toImageOut(img.MinioURL, img.S3URL, img.Sira)
			}
			writeJSON(w, http.StatusOK, PublicListing{
				Source: "shop", ID: p.ID, Marka: p.Marka, Model: p.Model, Il: p.Il,
				Qiymet: p.Qiymet, Yurus: p.Yurus, Yanacaq: p.Yanacaq, Ban: p.Ban,
				Title: p.Title, Details: p.Details, Images: images,
				SellerType: "diler", SellerName: p.ShopName,
			})
			return
		}
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}

	userProducts, err := h.userRepo.ListActiveProducts(req.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	for _, p := range userProducts {
		if p.ID != id {
			continue
		}
		images := make([]ImageOut, len(p.Images))
		for i, img := range p.Images {
			images[i] = toImageOut(img.MinioURL, img.S3URL, img.Sira)
		}
		writeJSON(w, http.StatusOK, PublicListing{
			Source: "user", ID: p.ID, Marka: p.Marka, Model: p.Model, Il: p.Il,
			Qiymet: p.Qiymet, Yurus: p.Yurus, Yanacaq: p.Yanacaq, Ban: p.Ban,
			Title: p.Title, Details: p.Details, Images: images,
			SellerType: "şəxsi", SellerName: "",
		})
		return
	}
	http.Error(w, "listing not found", http.StatusNotFound)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
```

Note: `PublicListingDetail` re-fetches the FULL active list and filters client-side (in Go) rather than adding a new single-item repository method — this is a deliberate, small-scale trade-off (acceptable at this project's current data volume, matching the existing codebase's precedent of simplicity-over-premature-optimization) rather than adding yet another repository method per package. Do not "optimize" this away in this task; if it ever becomes a real performance problem, that is a separate, future task.

- [ ] **Step 5: Update `internal/shop/handler_test.go`'s `fakeRepo` to implement `ListActiveProducts`**

Read the file's current `fakeRepo` first (it has a `products map[int64][]Product` field per earlier phases), then add:

```go
func (f *fakeRepo) ListActiveProducts(ctx context.Context) ([]ProductWithShopName, error) {
	out := []ProductWithShopName{}
	for _, products := range f.products {
		for _, p := range products {
			if p.Status == "saytda" {
				out = append(out, ProductWithShopName{Product: p, ShopName: "test-shop"})
			}
		}
	}
	return out, nil
}
```

- [ ] **Step 6: Update `internal/auth/handler_test.go`'s `fakeShopRepo` to implement `ListActiveProducts`**

Read the file's current `fakeShopRepo` first, then add a matching stub (this fake's tests never exercise the public listings feed, so a simple stub is sufficient — mirror the pattern already used for `ListAllProducts` in this same fake, which was added in an earlier phase for the exact same "this package needs the full interface to compile" reason):

```go
func (f *fakeShopRepo) ListActiveProducts(ctx context.Context) ([]shop.ProductWithShopName, error) {
	return nil, nil
}
```

- [ ] **Step 7: Update `internal/admin/handler_test.go`'s `fakeShopRepo` and `fakeUserRepo` (if they implement the full interfaces — check first) to add stub `ListActiveProducts` methods**, same pattern as Step 6.

- [ ] **Step 8: Write `internal/listings/handler_test.go`**

```go
package listings

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"github.com/CavadJava/avtopulse-backend/internal/user"
)

type fakeShopRepo struct {
	active []shop.ProductWithShopName
}

func (f *fakeShopRepo) ListShops(ctx context.Context) ([]shop.ShopSummary, error) { return nil, nil }
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
func (f *fakeShopRepo) DeleteProduct(ctx context.Context, productID int64) error   { return nil }
func (f *fakeShopRepo) RestoreProduct(ctx context.Context, productID int64) error { return nil }
func (f *fakeShopRepo) GetImageProductID(ctx context.Context, imageID int64) (int64, error) {
	return 0, nil
}
func (f *fakeShopRepo) DeleteProductImage(ctx context.Context, imageID int64) error { return nil }
func (f *fakeShopRepo) ListAllProducts(ctx context.Context) ([]shop.Product, error) { return nil, nil }
func (f *fakeShopRepo) ListActiveProducts(ctx context.Context) ([]shop.ProductWithShopName, error) {
	return f.active, nil
}

type fakeUserRepo struct {
	active []user.Product
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
	return nil, nil
}
func (f *fakeUserRepo) ApproveProduct(ctx context.Context, productID int64) error { return nil }
func (f *fakeUserRepo) RejectProduct(ctx context.Context, productID int64) error  { return nil }
func (f *fakeUserRepo) ListActiveProducts(ctx context.Context) ([]user.Product, error) {
	return f.active, nil
}

func TestPublicListings_MergesShopAndUser(t *testing.T) {
	shopRepo := &fakeShopRepo{active: []shop.ProductWithShopName{
		{Product: shop.Product{ID: 1, Title: "BMW 320i", Status: "saytda"}, ShopName: "avto444"},
	}}
	userRepo := &fakeUserRepo{active: []user.Product{
		{ID: 5, Title: "Toyota Camry", Status: "saytda"},
	}}

	h := NewHandler(userRepo, shopRepo)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
}

func TestPublicListingDetail_ShopSource_Found(t *testing.T) {
	shopRepo := &fakeShopRepo{active: []shop.ProductWithShopName{
		{Product: shop.Product{ID: 1, Title: "BMW 320i", Status: "saytda"}, ShopName: "avto444"},
	}}
	userRepo := &fakeUserRepo{}

	h := NewHandler(userRepo, shopRepo)
	req := httptest.NewRequest(http.MethodGet, "/shop/1", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
}

func TestPublicListingDetail_UserSource_NotFound(t *testing.T) {
	shopRepo := &fakeShopRepo{}
	userRepo := &fakeUserRepo{active: []user.Product{
		{ID: 5, Title: "Toyota Camry", Status: "saytda"},
	}}

	h := NewHandler(userRepo, shopRepo)
	req := httptest.NewRequest(http.MethodGet, "/user/999", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestPublicListingDetail_InvalidSource(t *testing.T) {
	h := NewHandler(&fakeUserRepo{}, &fakeShopRepo{})
	req := httptest.NewRequest(http.MethodGet, "/bogus/1", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}
```

- [ ] **Step 9: Build and test**

```bash
cd avtopulse-backend
go build ./...
go test ./... -v
```

Expected: everything builds and passes.

- [ ] **Step 10: Commit**

```bash
git add avtopulse-backend
git commit -m "feat: internal/listings package — public unified shop+user listings feed"
```

---

## Task 2: Wire routes into `cmd/server/main.go`, regenerate Swagger

**Files:**
- Modify: `avtopulse-backend/cmd/server/main.go`

**Interfaces:**
- Consumes: `listings.NewHandler` (Task 1).
- Produces: `GET /api/listings`, `GET /api/listings/{source}/{id}` — fully public routes.

- [ ] **Step 1: Add the import and mount the new handler**

Add to the import block:

```go
	"github.com/CavadJava/avtopulse-backend/internal/listings"
```

Right after the existing `r.Mount("/api/shops", shop.NewHandler(shopRepo))` line (and after the user/admin route registrations from the prior phase), add:

```go
	r.Mount("/api/listings", listings.NewHandler(userRepo, shopRepo))
```

This uses chi's `r.Mount`, matching the existing pattern already used for `/api/shops` — no `StripPrefix` wrapper needed since `listings.NewHandler`'s own router already expects paths relative to `/api/listings` (its `Get("/", ...)` and `Get("/{source}/{id}", ...)` match the mount point directly, same as `shop.NewHandler`'s existing mount).

- [ ] **Step 2: Build and test the whole module**

```bash
cd avtopulse-backend
go build ./...
go test ./... -v
```

- [ ] **Step 3: Regenerate Swagger**

```bash
cd avtopulse-backend
$(go env GOPATH)/bin/swag init -g cmd/server/main.go -o docs --parseInternal
```

Read `docs/swagger.json`'s full `"paths"` object directly (not a truncated snippet). Confirm `/listings` and `/listings/{source}/{id}` appear, tagged `listings`. Given this project's established history of `@Router` path collisions across packages sharing one `@BasePath` (already hit twice in the previous phase), check the `swag init` output for any "declared multiple times" warning involving `/listings` — if one appears, disambiguate by adding an explicit prefix to these two annotations (e.g., there should be no collision since no other package uses `/listings`, but verify empirically rather than assuming).

- [ ] **Step 4: Commit**

```bash
git add avtopulse-backend
git commit -m "feat: mount /api/listings routes in cmd/server/main.go"
```

---

## Task 3: Frontend — real `getListings()`/`getListingById()`, feed page updates

**Files:**
- Modify: `src/api/listings.ts`
- Modify: `src/pages/Listings.tsx`
- Modify: `src/pages/Home.tsx`

**Interfaces:**
- Consumes: `GET /api/listings`, `GET /api/listings/{source}/{id}` (Task 2).
- Produces: `ApiListing` type, `getRealListings(): Promise<ApiListing[]>`, `getRealListingById(source, id): Promise<ApiListing | null>` — NEW functions, added alongside (not replacing) the existing mock `getListings`/`getListingById`/`updateListing` (those keep serving the pre-existing sample/demo data untouched, per the Global Constraints).

- [ ] **Step 1: Read the current `src/pages/Listings.tsx` and `src/pages/Home.tsx` in full** — confirm their exact current rendering structure (both currently call the mock `getListings()` and render `Listing[]` via some card component — identify that component's name/prop shape before editing).

- [ ] **Step 2: Add the real-API types and functions to `src/api/listings.ts`**, alongside (not replacing) the existing mock functions:

```typescript
const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

export interface ApiListingImage {
  minioUrl: string;
  s3Url: string;
  sira: number;
}

export interface ApiListing {
  source: 'shop' | 'user';
  id: number;
  marka: string;
  model: string;
  il: number;
  qiymet: number;
  yurus: number;
  yanacaq: string;
  ban: string;
  title: string;
  details: string;
  images: ApiListingImage[];
  sellerType: 'diler' | 'şəxsi';
  sellerName: string;
}

export async function getRealListings(): Promise<ApiListing[]> {
  const res = await fetch(`${API_BASE}/api/listings`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`getRealListings failed: ${res.status}`);
  }
  return res.json();
}

export async function getRealListingById(source: 'shop' | 'user', id: number): Promise<ApiListing | null> {
  const res = await fetch(`${API_BASE}/api/listings/${source}/${id}`, { cache: 'no-store' });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`getRealListingById failed: ${res.status}`);
  }
  return res.json();
}
```

- [ ] **Step 3: Wire `Listings.tsx` and `Home.tsx` to fetch and render `ApiListing[]` alongside the existing mock `Listing[]`**

For each page: call both `getListings(filters)` (existing mock) and `getRealListings()` (new, Step 2) in parallel (`Promise.all`), and render two sections (or interleave, matching whatever the page's existing layout supports most simply) — mock listings keep their existing card component untouched; real listings get a new, simpler summary card showing: `title`, `marka`/`model`/`il`, `qiymet`, `yurus`, `yanacaq`, first image (if any, else a placeholder), and a small `sellerType`-based badge ("Diler / Salon" or "Şəxsi"). Read the existing card component first to match its visual container/grid conventions (spacing, class names) even though the real-listing card is a new component — visual consistency with the existing card grid matters more than code reuse here, given the differing data shapes.

Each real-listing card links to `/elan/shop-${id}` or `/elan/user-${id}` (a composite string id embedding both the source and the numeric id — this keeps the existing `/elan/:id` route unchanged, per the Global Constraints' prohibition on touching `ListingDetail.tsx`'s route).

- [ ] **Step 4: Type-check and build**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc -b --noEmit
npm run build
```

- [ ] **Step 5: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/api/listings.ts src/pages/Listings.tsx src/pages/Home.tsx || echo CLEAN
git add src/api/listings.ts src/pages/Listings.tsx src/pages/Home.tsx
git commit -m "feat: fetch and render real shop+user listings alongside existing mock feed"
```

---

## Task 4: Frontend — new `RealListingDetail.tsx` page + route

**Files:**
- Create: `src/pages/RealListingDetail.tsx`
- Create: `src/pages/RealListingDetail.module.css`
- Modify: `src/App.tsx` (route dispatch logic — see Step 2)

**Interfaces:**
- Consumes: `getRealListingById` (Task 3).
- Produces: a new page rendering one real (shop or user) listing's detail, reachable at `/elan/shop-{id}` or `/elan/user-{id}`.

- [ ] **Step 1: Read `src/App.tsx`'s current `/elan/:id` route and `src/pages/ListingDetail.tsx` in full** to confirm the exact current behavior before adding a dispatch layer.

- [ ] **Step 2: Add a small dispatcher inside the existing `/elan/:id` route** — rather than adding a second route (which could collide with the existing `:id` pattern), keep ONE route (`/elan/:id`) but have its element decide, based on the `id` param's shape, which component to render:

In `src/App.tsx`, change:

```tsx
            <Route path="/elan/:id" element={<ListingDetail />} />
```

to:

```tsx
            <Route path="/elan/:id" element={<ListingRouter />} />
```

Add a new tiny component (either inline in `App.tsx` above the `Routes` block, or as its own small file `src/pages/ListingRouter.tsx` — prefer the latter to keep `App.tsx` focused on route declarations, matching this codebase's existing one-page-per-file convention):

```tsx
import { useParams } from 'react-router-dom';
import ListingDetail from './ListingDetail';
import RealListingDetail from './RealListingDetail';

export default function ListingRouter() {
  const { id } = useParams<{ id: string }>();

  if (id?.startsWith('shop-') || id?.startsWith('user-')) {
    return <RealListingDetail />;
  }
  return <ListingDetail />;
}
```

Both `ListingDetail` and `RealListingDetail` independently call `useParams<{ id: string }>()` themselves — `ListingDetail` is untouched and keeps using the raw `id` string as before (for mock listings, whose ids never start with `shop-`/`user-`); `RealListingDetail` parses the `shop-`/`user-` prefix itself.

- [ ] **Step 3: Write `src/pages/RealListingDetail.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getRealListingById } from '../api/listings';
import type { ApiListing } from '../api/listings';
import styles from './RealListingDetail.module.css';

export default function RealListingDetail() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<ApiListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setNotFound(false);
      if (!id) return;

      const [source, numericIdStr] = id.split('-');
      const numericId = Number(numericIdStr);
      if ((source !== 'shop' && source !== 'user') || Number.isNaN(numericId)) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        const detail = await getRealListingById(source, numericId);
        if (!detail) {
          setNotFound(true);
        } else {
          setListing(detail);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className={styles.loading}>Yüklənir...</div>;
  if (notFound || !listing) return <div className={styles.error}>Elan tapılmadı.</div>;

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to="/elanlar">{listing.marka}</Link>
        <span className={styles.breadcrumbSep}>·</span>
        <span className={styles.breadcrumbCurrent}>{listing.model}</span>
      </div>

      <div className={styles.container}>
        <div className={styles.main}>
          {listing.images.length > 0 ? (
            <div className={styles.gallery}>
              {listing.images.map((img) => (
                <img key={img.minioUrl} src={img.minioUrl} alt={listing.title} className={styles.galleryImage} />
              ))}
            </div>
          ) : (
            <div className={styles.noImage}>Şəkil yoxdur</div>
          )}

          <h1 className={styles.title}>{listing.title}</h1>
          <p className={styles.meta}>
            {listing.marka} {listing.model} · {listing.il} · {listing.yurus.toLocaleString()} km · {listing.yanacaq} · {listing.ban}
          </p>
          {listing.details && <p className={styles.details}>{listing.details}</p>}
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.contactCard}>
            <div className={styles.price}>{listing.qiymet.toLocaleString()} ₼</div>

            <div className={styles.cardDivider} />

            <div className={styles.sellerRow}>
              <span className={styles.sellerTypeBadge}>
                {listing.sellerType === 'diler' ? 'Diler / Salon' : 'Şəxsi'}
              </span>
              {listing.sellerName && <p className={styles.sellerName}>{listing.sellerName}</p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/pages/RealListingDetail.module.css`** — read `src/pages/ListingDetail.module.css` first to reuse the same design tokens (`var(--space-*)`, `var(--radius-*)`, `var(--accent)`, `var(--text-*)`, `var(--bg-elevated)`, `var(--border)`) for visual consistency, but write a fresh, simpler stylesheet (the real detail page has fewer sections — no tabs, no promote grid, no phone-reveal button):

```css
.page {
  padding: var(--space-10) var(--space-6) var(--space-16);
  max-width: var(--max-width);
  margin: 0 auto;
}

.loading,
.error {
  padding: var(--space-16);
  text-align: center;
  color: var(--text-secondary);
}

.breadcrumb {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: var(--space-6);
}

.breadcrumbSep {
  color: var(--border-strong);
}

.breadcrumbCurrent {
  color: var(--text-primary);
  font-weight: 600;
}

.container {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: var(--space-8);
}

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-6);
}

.galleryImage {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.noImage {
  padding: var(--space-10);
  text-align: center;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-6);
}

.title {
  font-size: 24px;
  font-weight: 800;
  font-family: var(--font-display);
  margin-bottom: var(--space-2);
}

.meta {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: var(--space-4);
}

.details {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
}

.sidebar {
  align-self: start;
}

.contactCard {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  position: sticky;
  top: var(--space-6);
}

.price {
  font-size: 26px;
  font-weight: 800;
  font-family: var(--font-display);
}

.cardDivider {
  height: 1px;
  background: var(--border);
  margin: var(--space-4) 0;
}

.sellerRow {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sellerTypeBadge {
  display: inline-block;
  align-self: flex-start;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 100px;
}

.sellerName {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

@media (max-width: 900px) {
  .container {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Type-check and build**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc -b --noEmit
npm run build
```

- [ ] **Step 6: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/RealListingDetail.tsx src/pages/RealListingDetail.module.css src/pages/ListingRouter.tsx src/App.tsx || echo CLEAN
git add src/pages/RealListingDetail.tsx src/pages/RealListingDetail.module.css src/pages/ListingRouter.tsx src/App.tsx
git commit -m "feat: new RealListingDetail page for shop/user listings, dispatched via ListingRouter"
```

---

## Task 5: Deploy + end-to-end verification

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

- [ ] **Step 2: Merge to main and push**

```bash
git checkout main
git merge feature/public-listings-feed --no-ff -m "Merge feature/public-listings-feed: public unified shop+user listings feed"
git push origin main
```

(Assumes Tasks 1-4 were executed on a branch named `feature/public-listings-feed`, created before Task 1 — if a different branch name was used, substitute it here.)

- [ ] **Step 3: Deploy the backend**

```bash
rsync -avz --exclude='.git' --exclude='avtopulse-backend/server' \
  -e "ssh -i ~/.ssh/youtube-remote-webrtc_ed25519" \
  /Users/frontend/workspace/me-github/autopulse/avtopulse-backend/ \
  root@157.180.73.79:/opt/avtopulse-backend/

ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "export PATH=\$PATH:/usr/local/go/bin && cd /opt/avtopulse-backend && go build -o avtopulse-backend ./cmd/server && echo BUILD_OK"

ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "chown youtube-remote:youtube-remote /opt/avtopulse-backend/avtopulse-backend && systemctl restart avtopulse-backend && sleep 1 && systemctl status avtopulse-backend --no-pager && journalctl -u avtopulse-backend -n 15 --no-pager"
```

Expected: `active (running)`, no errors (no new migration in this plan, no new required env vars).

- [ ] **Step 4: Deploy the frontend**

```bash
cd /Users/frontend/workspace/me-github/autopulse
bash deploy/deploy.sh
```

- [ ] **Step 5: Live end-to-end verification**

```bash
# Confirm the public feed returns real data, mixing shop and user sources
curl -s https://autopulse.157.180.73.79.sslip.io/api/listings | python3 -c "
import json, sys
data = json.load(sys.stdin)
sources = set(item['source'] for item in data)
print('total listings:', len(data))
print('sources present:', sources)
shop_items = [i for i in data if i['source'] == 'shop']
if shop_items:
    print('sample shop listing sellerName:', shop_items[0]['sellerName'], '| sellerType:', shop_items[0]['sellerType'])
user_items = [i for i in data if i['source'] == 'user']
if user_items:
    print('sample user listing sellerName (should be empty):', repr(user_items[0]['sellerName']), '| sellerType:', user_items[0]['sellerType'])
"

# Confirm a single shop listing's detail is fetchable (use a real id from the above output)
curl -s https://autopulse.157.180.73.79.sslip.io/api/listings/shop/1 | python3 -m json.tool

# Confirm a nonexistent id 404s
curl -s -o /dev/null -w "nonexistent shop listing: %{http_code}\n" https://autopulse.157.180.73.79.sslip.io/api/listings/shop/999999

# Confirm an invalid source 400s
curl -s -o /dev/null -w "invalid source: %{http_code}\n" https://autopulse.157.180.73.79.sslip.io/api/listings/bogus/1
```

Expected: the feed includes both `"shop"` and (if any exist) `"user"` sourced listings, shop listings show a real `sellerName` (the shop's actual name, e.g. `"avto444"`), user listings show `sellerName: ""`. A real shop listing id returns full detail. A nonexistent id 404s. An invalid source 400s.

Then, in a browser (or via curl against the frontend's served HTML if a headless check is preferred), visit `https://autopulse.157.180.73.79.sslip.io/elanlar` and confirm real listings appear alongside the mock ones, and clicking a real listing card navigates to `/elan/shop-{id}` or `/elan/user-{id}` and shows the simplified detail view with the correct seller badge.

**This verification is READ-ONLY against real production data (the 12 existing shop products) — no test data creation or mutation is needed for this task**, since the feed and detail endpoints are pure GETs with no side effects.

- [ ] **Step 6: Update `workspace/me-github/my-servers/avtopulse/credentials.md`** with the new `GET /api/listings`/`GET /api/listings/{source}/{id}` endpoints, the frontend's new `/elan/shop-{id}` / `/elan/user-{id}` URL convention, and a note that this is a separate, later phase from the earlier "Faza A" (user listings + moderation) — profile/stats/cards/balance/expiry-ticker are still not built.

---

## Self-Review Notes

- **Spec coverage:** `GET /api/listings` (merged, saytda-only, source-tagged) → Task 1. `GET /api/listings/{source}/{id}` (single listing, 404 on wrong status/missing) → Task 1. Seller identity rules (shop name vs. empty for user) → Task 1's handler logic, explicitly tested. Frontend feed wiring (`/elanlar`, `/`) → Task 3. Simple detail view for real listings, without touching the existing mock detail page → Task 4. Deploy + live, read-only verification → Task 5.
- **Placeholder scan:** no TBD/TODO markers; every step has literal, runnable code.
- **Type consistency:** Go `PublicListing`'s JSON tags (`source`, `marka`, `model`, ..., `sellerType`, `sellerName`) match the TS `ApiListing` interface exactly across Tasks 1, 3, and 4.
- **Existing-UI protection:** explicitly called out in Global Constraints and reiterated in Task 3/4 that `ListingDetail.tsx`, `InteractiveGallery.tsx`, `ListingDetailTabs.tsx`, the mock `Listing` type, and `mockListings` are never modified — the real-data path is a fully parallel, new set of components (`RealListingDetail.tsx`, `ListingRouter.tsx`), dispatched via an id-prefix check so the existing `/elan/:id` route doesn't need to change shape.
- **Public-endpoint safety:** Global Constraints explicitly forbid adding auth middleware to the new routes, and explicitly require the `saytda`-only filter, matching the existing public shop storefront's established precedent (`GET /api/shops/{shopId}/products`).
- **Privacy rule enforcement:** Task 1's handler code hardcodes `SellerName: ""` for every user-sourced listing (never reads or exposes `user.Phone`/`user.Name`) — this was a specific, explicit user decision confirmed via clarifying question, and is directly visible/auditable in the handler code (no accidental leak path, since `user.Product` doesn't even carry the owning user's name/phone in its own struct to begin with).
- **Demo-data safety:** Task 5's live verification is explicitly read-only (pure GETs, no test-data creation needed) against the 12 real existing products — no risk of polluting or disturbing production data, unlike prior phases' plans which needed disposable test rows for write-path verification.
