# AutoPulse Shop Product Soft-Delete + Status Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the shop-owner "Sil" (delete) action on `/magazam` from a permanent hard-delete to a soft-delete (`status = 'legv_edilib'`), so cancelled products stop appearing on the public storefront but remain visible (and restorable) to the shop owner under a "Ləğv edilib" tab, alongside the existing full-catalog view.

**Architecture:** A new `status` column (`saytda` | `legv_edilib`) is added to `avto444.shop_products`. `DeleteProduct` becomes an `UPDATE ... SET status = 'legv_edilib'` instead of a hard `DELETE`; a new `RestoreProduct` sets it back to `saytda`. The public storefront query (`GET /api/shops/{shopId}/products`) filters to `status = 'saytda'` only; the owner's query (`GET /api/shops/me/products`) stays unfiltered — the frontend groups by status client-side into tabs ("Bütün elanlar" / "Saytda" / "Ləğv edilib"), matching the existing tab-based `/magazam` UI pattern already used elsewhere in the product (`Kabinet > Mənim elanlarım`).

**Tech Stack:** Go 1.26.5, `chi`, `pgx/v5` (existing — no new dependencies), React 18 + TypeScript (existing conventions).

## Global Constraints

- This plan touches ONLY the existing `avto444` shop/mağaza system (`internal/shop`, `internal/auth`, `src/api/shop.ts`, `src/pages/shop/MyShop.tsx`). It does NOT touch the separate fərdi/biznes personal-listings work spec'd in `docs/superpowers/specs/2026-08-23-avtopulse-personal-listings-design.md` — that is a fully independent domain (different tables, different Go packages) and is out of scope here.
- The existing "Ləğv et" button inside the edit form (cancels the in-progress edit, `cancelEdit()`) is UNRELATED to this plan's new "Ləğv edilib" status — do not rename or touch that existing button. Use "Bərpa et" for the new restore action and "Ləğv edilib" only as a status label/tab name, never reusing the word in a way that could be confused with the existing cancel-edit button.
- Every backend task must end with `go build ./...` and `go test ./...` passing (run from `avtopulse-backend/`). Every frontend task must end with `npx tsc -b --noEmit` and `npm run build` passing (note: `npx tsc --noEmit` alone is insufficient in this composite-tsconfig repo — it must be `-b`), plus the standing corruption scan (`grep -rn 'Ɛ\|Ɔ'` across touched files) before any commit.
- Follow the existing deploy workflow: backend via rsync + rebuild + `systemctl restart avtopulse-backend`; frontend via `git push origin main` then `bash deploy/deploy.sh` from `/Users/frontend/workspace/me-github/autopulse`.
- Do not touch the 10 real demo products (`bmw-320i`, `mercedes-e200`, `toyota-camry`, `hyundai-sonata`, `kia-sportage`, `nissan-altima`, `volkswagen-golf`, `toyota-rav4`, `honda-civic`, `mazda-cx5`) during any live verification — create a disposable test product instead.
- Reuse the existing ownership-check pattern (`requireSession` → `GetProductShopID` → compare → 404) for the new `RestoreProduct` endpoint, exactly as already used by `UpdateProduct`/`DeleteProduct`/`DeleteProductImage`.

---

## Task 1: Database migration + repository/model changes

**Files:**
- Create: `avtopulse-backend/migrations/0005_shop_products_status.sql`
- Modify: `avtopulse-backend/internal/shop/model.go`
- Modify: `avtopulse-backend/internal/shop/repository.go`
- Modify: `avtopulse-backend/internal/shop/handler_test.go` (fakeRepo)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Product.Status string` (JSON tag `status`); `Repository.DeleteProduct` becomes a soft-delete (unchanged signature); new `Repository.RestoreProduct(ctx, productID int64) error`; `Repository.ListProducts` gains a new `onlyStatus string` parameter (empty string = no filter, used by the owner's endpoint; `"saytda"` used by the public storefront).

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE avto444.shop_products
  ADD COLUMN status TEXT NOT NULL DEFAULT 'saytda' CHECK (status IN ('saytda', 'legv_edilib'));
```

Save as `avtopulse-backend/migrations/0005_shop_products_status.sql`.

- [ ] **Step 2: Add `Status` to the `Product` struct in `avtopulse-backend/internal/shop/model.go`**

```go
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
	Status  string `json:"status"`

	Images []ProductImage `json:"images"`
}
```

- [ ] **Step 3: Update the `Repository` interface in `avtopulse-backend/internal/shop/repository.go`**

```go
type Repository interface {
	ListShops(ctx context.Context) ([]ShopSummary, error)
	GetShopByName(ctx context.Context, name string) (*Shop, error)
	GetShopByID(ctx context.Context, id int64) (*Shop, error)
	ListProducts(ctx context.Context, shopID int64, onlyStatus string) ([]Product, error)
	GetPasswordHash(ctx context.Context, shopID int64) (string, error)
	CreateProduct(ctx context.Context, shopID int64, input CreateProductInput) (*Product, error)
	AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int) (*ProductImage, error)
	GetProductShopID(ctx context.Context, productID int64) (int64, error)
	SetShopLogo(ctx context.Context, shopID int64, url string) error
	UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error)
	DeleteProduct(ctx context.Context, productID int64) error
	RestoreProduct(ctx context.Context, productID int64) error
	GetImageProductID(ctx context.Context, imageID int64) (int64, error)
	DeleteProductImage(ctx context.Context, imageID int64) error
}
```

- [ ] **Step 4: Update `ListProducts` to accept and apply the new filter, and scan `status`**

```go
func (r *pgRepository) ListProducts(ctx context.Context, shopID int64, onlyStatus string) ([]Product, error) {
	query := `SELECT id, name, title, COALESCE(details, ''),
	                 COALESCE(marka, ''), COALESCE(model, ''), COALESCE(il, 0),
	                 COALESCE(qiymet, 0), COALESCE(yurus, 0), COALESCE(yanacaq, ''), COALESCE(ban, ''), status
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

- [ ] **Step 5: Update `CreateProduct` and `UpdateProduct` to set/return `Status`**

In `CreateProduct`, the returned `Product` literal gets `Status: "saytda"` added (the DB default handles the actual insert — no INSERT column list change needed since the column has a `DEFAULT`):

```go
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
		Status:  "saytda",
		Images:  []ProductImage{},
	}, nil
```

In `UpdateProduct`, fetch the current status alongside the update (an edit must not silently un-cancel a `legv_edilib` product, nor silently re-cancel a `saytda` one — status is only ever changed by Delete/Restore, never by a field edit):

```go
func (r *pgRepository) UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error) {
	var status string
	err := r.pool.QueryRow(ctx,
		`UPDATE avto444.shop_products
		 SET name = $1, title = $2, details = $3, marka = $4, model = $5, il = $6, qiymet = $7, yurus = $8, yanacaq = $9, ban = $10
		 WHERE id = $11
		 RETURNING status`,
		input.Name, input.Title, input.Details, input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, productID,
	).Scan(&status)
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
		Yurus: input.Yurus, Yanacaq: input.Yanacaq, Ban: input.Ban, Status: status, Images: images,
	}, nil
}
```

- [ ] **Step 6: Change `DeleteProduct` to a soft-delete, and add `RestoreProduct`**

```go
func (r *pgRepository) DeleteProduct(ctx context.Context, productID int64) error {
	_, err := r.pool.Exec(ctx, `UPDATE avto444.shop_products SET status = 'legv_edilib' WHERE id = $1`, productID)
	return err
}

func (r *pgRepository) RestoreProduct(ctx context.Context, productID int64) error {
	_, err := r.pool.Exec(ctx, `UPDATE avto444.shop_products SET status = 'saytda' WHERE id = $1`, productID)
	return err
}
```

Remove the old transactional hard-delete body (the `tx.Begin`/`shop_product_images` delete/`tx.Commit` code) — images are no longer deleted on product delete, since the product itself is only hidden, not removed. If this leaves `fmt` unused in this file, remove that import too (check remaining usages first — `GetImageProductID`/`DeleteProductImage` etc. don't use `fmt`, so it likely becomes unused).

- [ ] **Step 7: Update `avtopulse-backend/internal/shop/handler_test.go`'s `fakeRepo`**

Read the current `fakeRepo.ListProducts`/`DeleteProduct` first, then update to match the new signature and soft-delete semantics:

```go
func (f *fakeRepo) ListProducts(ctx context.Context, shopID int64, onlyStatus string) ([]Product, error) {
	out := []Product{}
	for _, p := range f.products[shopID] {
		if onlyStatus != "" && p.Status != onlyStatus {
			continue
		}
		out = append(out, p)
	}
	return out, nil
}
```

Update `fakeRepo.CreateProduct` to set `Status: "saytda"` on the product it appends. Update `fakeRepo.DeleteProduct` (used from `internal/shop/handler_test.go`'s own tests, if any exist there — check first) to set status instead of removing from the slice:

```go
func (f *fakeRepo) DeleteProduct(ctx context.Context, productID int64) error {
	for shopID, products := range f.products {
		for i, p := range products {
			if p.ID == productID {
				f.products[shopID][i].Status = "legv_edilib"
				return nil
			}
		}
	}
	return ErrNotFound
}

func (f *fakeRepo) RestoreProduct(ctx context.Context, productID int64) error {
	for shopID, products := range f.products {
		for i, p := range products {
			if p.ID == productID {
				f.products[shopID][i].Status = "saytda"
				return nil
			}
		}
	}
	return ErrNotFound
}
```

- [ ] **Step 8: Build and run tests**

```bash
cd avtopulse-backend
go build ./internal/shop/... ./internal/db/... ./internal/storage/...
```

Expected: succeeds (these packages don't depend on `internal/auth`, which will fail to compile until Task 2 — this is an intentionally incremental, expected mid-plan state, matching the pattern used in the earlier Phase 3 plan).

```bash
go test ./internal/shop/... -v
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add avtopulse-backend
git commit -m "feat: add shop_products.status, soft-delete + restore, status-filtered ListProducts"
```

---

## Task 2: Wire status filtering + restore endpoint into handlers

**Files:**
- Modify: `avtopulse-backend/internal/shop/handler.go` (public storefront — filter to `saytda`)
- Modify: `avtopulse-backend/internal/auth/handler.go` (owner endpoint — no filter; new `RestoreProduct` method + route)
- Modify: `avtopulse-backend/internal/auth/handler_test.go` (fakeShopRepo + new tests)
- Modify: `avtopulse-backend/cmd/server/main.go` (new route)

**Interfaces:**
- Consumes: `Repository.ListProducts(ctx, shopID, onlyStatus)`, `Repository.RestoreProduct(ctx, productID)` (Task 1).
- Produces: `POST /api/shops/me/products/{id}/restore` — new cookie-authenticated, ownership-checked endpoint.

- [ ] **Step 1: Find and update the public storefront's `ListProducts` call site**

In `avtopulse-backend/internal/shop/handler.go`, locate the handler mounted at `GET /{shopId}/products` and change its call from `h.repo.ListProducts(ctx, id)` to `h.repo.ListProducts(ctx, id, "saytda")` — the public storefront must only ever show non-cancelled products.

- [ ] **Step 2: Update the owner endpoint's call site in `avtopulse-backend/internal/auth/handler.go`**

In `MeProducts`, change `h.shopRepo.ListProducts(req.Context(), shopID)` to `h.shopRepo.ListProducts(req.Context(), shopID, "")` — the owner sees everything (both `saytda` and `legv_edilib`); the frontend does the tab split.

- [ ] **Step 3: Add the `RestoreProduct` handler method in `avtopulse-backend/internal/auth/handler.go`**

```go
// RestoreProduct godoc
// @Summary      Restore a cancelled (ləğv edilib) product back to saytda
// @Description  Requires a valid shop_session cookie. The product must belong to the authenticated shop.
// @Tags         auth
// @Produce      json
// @Param        id  path  int  true  "Product id"
// @Success      200  {object}  map[string]bool
// @Failure      400  {string}  string  "invalid product id"
// @Failure      401  {string}  string  "unauthorized"
// @Failure      404  {string}  string  "product not found or not owned by this shop"
// @Failure      500  {string}  string  "internal error"
// @Router       /me/products/{id}/restore [post]
func (h *authHandlers) RestoreProduct(w http.ResponseWriter, req *http.Request) {
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

	if err := h.shopRepo.RestoreProduct(req.Context(), productID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"restored": true})
}
```

- [ ] **Step 4: Register the route in `NewHandler` (same file)**

```go
	r.Post("/me/products/{id}/restore", h.RestoreProduct)
```

Add this line next to the existing `r.Delete("/me/products/{id}", h.DeleteProduct)` registration.

- [ ] **Step 5: Update `avtopulse-backend/internal/auth/handler_test.go`'s `fakeShopRepo`**

Update `ListProducts` (if a fake exists — check first, since `fakeShopRepo` in this file may not currently implement `ListProducts` at all, since `MeProducts` tests may use a different fixture) to accept the new `onlyStatus` parameter, and add:

```go
func (f *fakeShopRepo) RestoreProduct(ctx context.Context, productID int64) error {
	return nil
}
```

Also update `fakeShopRepo.ListProducts` (matching whatever its current return shape is) to accept `onlyStatus string` as a parameter even if the fake ignores it (return the same fixed list regardless), so the interface is satisfied.

- [ ] **Step 6: Add tests for `RestoreProduct` in `avtopulse-backend/internal/auth/handler_test.go`**

```go
func TestRestoreProduct_Success(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(newFakeShopRepo(), sessions, &fakeStorageClient{})
	req := httptest.NewRequest(http.MethodPost, "/me/products/1/restore", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
}

func TestRestoreProduct_WrongShop(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 999) // fakeShopRepo.GetProductShopID always returns 1

	h := NewHandler(newFakeShopRepo(), sessions, &fakeStorageClient{})
	req := httptest.NewRequest(http.MethodPost, "/me/products/1/restore", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestRestoreProduct_NoCookie(t *testing.T) {
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore(), &fakeStorageClient{})
	req := httptest.NewRequest(http.MethodPost, "/me/products/1/restore", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}
```

- [ ] **Step 7: Wire the new route into `cmd/server/main.go`**

```go
	r.Post("/api/shops/me/products/{id}/restore", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
```

Add next to the existing `DELETE /api/shops/me/products/{id}` registration.

- [ ] **Step 8: Build, test, regenerate Swagger**

```bash
cd avtopulse-backend
go build ./...
go test ./... -v
$(go env GOPATH)/bin/swag init -g cmd/server/main.go -o docs --parseInternal
```

Then read `docs/swagger.json`'s full `"paths"` object directly (not a truncated snippet) and confirm `/me/products/{id}/restore` [post] is now present alongside the existing 11 path templates (12 total).

- [ ] **Step 9: Commit**

```bash
git add avtopulse-backend
git commit -m "feat: filter public storefront to saytda-only, add POST /me/products/{id}/restore"
```

---

## Task 3: Frontend — status-aware tabs, restore button, no-cache

**Files:**
- Modify: `src/api/shop.ts`
- Modify: `src/pages/shop/MyShop.tsx`
- Modify: `src/pages/shop/MyShop.module.css`

**Interfaces:**
- Consumes: `Product.status` field (Task 1), `POST /me/products/{id}/restore` (Task 2).
- Produces: `ShopProduct.status: string`; `restoreShopProduct(id): Promise<void>`; a 3-tab UI on `/magazam` ("Bütün elanlar" / "Saytda" / "Ləğv edilib") with counts, matching the tab-list pattern already used in `Kabinet > Mənim elanlarım`.

- [ ] **Step 1: Add `status` to `ShopProduct` and a `restoreShopProduct` function in `src/api/shop.ts`**

```typescript
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
  status: string;
  images: ProductImage[];
}
```

```typescript
export async function restoreShopProduct(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/shops/me/products/${id}/restore`, {
    method: 'POST',
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (res.status === 404) {
    throw new ShopNotFoundError(`Product not found: ${id}`);
  }
  if (!res.ok) {
    throw new Error(`restoreShopProduct failed: ${res.status}`);
  }
}
```

- [ ] **Step 2: Add tab state and a restore handler in `src/pages/shop/MyShop.tsx`**

Update the import:

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
  restoreShopProduct,
  ShopUnauthorizedError,
} from '../../api/shop';
```

Add state, right after `deletingProductId`:

```tsx
  const [activeTab, setActiveTab] = useState<'hamisi' | 'saytda' | 'legv_edilib'>('hamisi');
  const [restoringProductId, setRestoringProductId] = useState<number | null>(null);
```

Add the handler, right after `handleDeleteProduct`:

```tsx
  const handleRestoreProduct = async (productId: number) => {
    setRestoringProductId(productId);
    try {
      await restoreShopProduct(productId);
      await loadProducts();
    } catch (err) {
      if (err instanceof ShopUnauthorizedError) {
        navigate('/magaza-giris');
        return;
      }
      setNotice('Məhsul bərpa edilərkən xəta baş verdi.');
    } finally {
      setRestoringProductId(null);
    }
  };
```

- [ ] **Step 3: Add the tab bar and filter the rendered list, in the JSX**

Right before the `{error && <p className={styles.status}>{error}</p>}` line, insert:

```tsx
      <div className={styles.tabBar}>
        <button
          className={activeTab === 'hamisi' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('hamisi')}
        >
          Bütün elanlar ({products.length})
        </button>
        <button
          className={activeTab === 'saytda' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('saytda')}
        >
          Saytda ({products.filter((p) => p.status === 'saytda').length})
        </button>
        <button
          className={activeTab === 'legv_edilib' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('legv_edilib')}
        >
          Ləğv edilib ({products.filter((p) => p.status === 'legv_edilib').length})
        </button>
      </div>
```

Then change the two `{!error && products...}` conditions to filter by the active tab. Replace:

```tsx
      {!error && products.length === 0 && (
        <p className={styles.status}>Hələ heç bir məhsulunuz yoxdur.</p>
      )}

      {!error && products.length > 0 && (
        <div className={styles.grid}>
          {products.map((product) => (
```

with:

```tsx
      {!error && visibleProducts.length === 0 && (
        <p className={styles.status}>Bu bölmədə heç bir məhsul yoxdur.</p>
      )}

      {!error && visibleProducts.length > 0 && (
        <div className={styles.grid}>
          {visibleProducts.map((product) => (
```

And add the `visibleProducts` derived value right before the `if (loading)` early return:

```tsx
  const visibleProducts = products.filter((product) => {
    if (activeTab === 'hamisi') return true;
    return product.status === activeTab;
  });

```

- [ ] **Step 4: Add the "Bərpa et" button, shown only for `legv_edilib` products, next to the existing edit/delete buttons**

Replace the existing `productActions` block:

```tsx
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
```

with:

```tsx
                  {product.status === 'legv_edilib' && (
                    <div className={styles.statusBadge}>Ləğv edilib</div>
                  )}
                  <div className={styles.productActions}>
                    <button className={styles.editBtn} onClick={() => startEdit(product)}>
                      ✎ Redaktə et
                    </button>
                    {product.status === 'legv_edilib' ? (
                      <button
                        className={styles.restoreBtn}
                        onClick={() => handleRestoreProduct(product.id)}
                        disabled={restoringProductId === product.id}
                      >
                        {restoringProductId === product.id ? 'Bərpa olunur...' : '↺ Bərpa et'}
                      </button>
                    ) : (
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDeleteProduct(product.id)}
                        disabled={deletingProductId === product.id}
                      >
                        {deletingProductId === product.id ? 'Silinir...' : '🗑 Sil'}
                      </button>
                    )}
                  </div>
```

- [ ] **Step 5: Append new CSS classes to `src/pages/shop/MyShop.module.css`**

```css
.tabBar {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
  flex-wrap: wrap;
}

.tab,
.tabActive {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
}

.tabActive {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border-color: var(--accent);
}

.tab:hover {
  box-shadow: none;
  border-color: var(--accent);
}

.statusBadge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  color: var(--error);
  background: var(--bg-elevated);
  border: 1px solid var(--error);
  padding: 2px 8px;
  border-radius: 100px;
  margin-bottom: var(--space-2);
}

.restoreBtn {
  flex: 1;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
}

.restoreBtn:hover {
  box-shadow: none;
  border-color: var(--accent);
}

.restoreBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

- [ ] **Step 6: Type-check and build**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc -b --noEmit
npm run build
```

Expected: both succeed with no errors.

- [ ] **Step 7: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/api/shop.ts src/pages/shop/MyShop.tsx src/pages/shop/MyShop.module.css || echo CLEAN
git add src/api/shop.ts src/pages/shop/MyShop.tsx src/pages/shop/MyShop.module.css
git commit -m "feat: status tabs + restore button on /magazam, saytda-only public storefront"
```

---

## Task 4: Deploy + end-to-end verification

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
git merge feature/shop-product-soft-delete --no-ff -m "Merge feature/shop-product-soft-delete: shop product soft-delete + status filter + restore"
git push origin main
```

(Assumes this plan's tasks were executed on a branch named `feature/shop-product-soft-delete`, created before Task 1 — if a different branch name was used, substitute it here.)

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

Expected: `active (running)`, and no migration errors in the startup log (migration 0005 applies automatically).

- [ ] **Step 4: Deploy the frontend**

```bash
cd /Users/frontend/workspace/me-github/autopulse
bash deploy/deploy.sh
```

- [ ] **Step 5: Live end-to-end verification using a disposable test product**

```bash
curl -s -c /tmp/verify-cookies.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/login \
  -H "Content-Type: application/json" -d '{"name":"avto444","password":"avto444pass"}'
echo

# Create a disposable test product
CREATED=$(curl -s -b /tmp/verify-cookies.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/me/products \
  -H "Content-Type: application/json" \
  -d '{"name":"softdelete-test-throwaway","title":"Soft Delete Test","marka":"Test","model":"Test","il":2020,"qiymet":1,"yurus":0,"yanacaq":"Test","ban":"Test"}')
echo "$CREATED"
TEST_ID=$(echo "$CREATED" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "Test product id: $TEST_ID"

# Confirm it appears on the public storefront (status=saytda)
curl -s https://autopulse.157.180.73.79.sslip.io/api/shops/1/products | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('public sees it:', any(p['id'] == $TEST_ID for p in data))
"

# Delete (soft) it
curl -s -o /dev/null -w "delete: %{http_code}\n" -b /tmp/verify-cookies.txt -X DELETE https://autopulse.157.180.73.79.sslip.io/api/shops/me/products/$TEST_ID

# Confirm it NO LONGER appears on the public storefront
curl -s https://autopulse.157.180.73.79.sslip.io/api/shops/1/products | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('public still sees it (should be False):', any(p['id'] == $TEST_ID for p in data))
"

# Confirm the owner endpoint still sees it, with status legv_edilib
curl -s -b /tmp/verify-cookies.txt https://autopulse.157.180.73.79.sslip.io/api/shops/me/products | python3 -c "
import json, sys
data = json.load(sys.stdin)
mine = [p for p in data if p['id'] == $TEST_ID]
print('owner sees it:', bool(mine), 'status:', mine[0]['status'] if mine else None)
"

# Restore it
curl -s -o /dev/null -w "restore: %{http_code}\n" -b /tmp/verify-cookies.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/me/products/$TEST_ID/restore

# Confirm it's back on the public storefront
curl -s https://autopulse.157.180.73.79.sslip.io/api/shops/1/products | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('public sees it again after restore:', any(p['id'] == $TEST_ID for p in data))
"

# Clean up: hard-delete is no longer possible via the API (by design) — leave the
# restored test product as 'saytda', then immediately soft-delete it again so it
# doesn't linger as visible clutter on the real storefront.
curl -s -o /dev/null -w "final cleanup delete: %{http_code}\n" -b /tmp/verify-cookies.txt -X DELETE https://autopulse.157.180.73.79.sslip.io/api/shops/me/products/$TEST_ID

rm -f /tmp/verify-cookies.txt
```

Expected: public sees it right after creation, stops seeing it after delete, owner still sees it with `status: "legv_edilib"`, public sees it again after restore. Final cleanup leaves the disposable test product soft-deleted (hidden from the public storefront) rather than deleting the test data itself, since hard-delete no longer exists — this is an accepted, intentional trade-off of this feature (test/disposable rows accumulate as hidden `legv_edilib` rows rather than truly vanishing; acceptable at this scale, revisit only if it becomes a real nuisance).

**Do NOT run any part of this verification against the 10 real demo products** — always create a fresh disposable product first, exactly as shown above.

- [ ] **Step 6: Update `workspace/me-github/my-servers/avtopulse/credentials.md`**

Add a note that `shop_products` now has a `status` column, that `DELETE /me/products/{id}` is a soft-delete (not reversible via the DB directly being dropped — use `POST /me/products/{id}/restore` instead), and that the public storefront endpoint now filters to `status='saytda'` only.

---

## Self-Review Notes

- **Spec coverage:** status column + soft-delete semantics → Task 1. Public-storefront filtering + restore endpoint → Task 2. Tab UI + restore button on `/magazam` → Task 3. Deploy + live verification (including the restore round-trip) → Task 4.
- **Placeholder scan:** no TBD/TODO markers; every step has literal, runnable code.
- **Type consistency:** `Product.Status`/`ShopProduct.status` (Go `status` JSON tag ↔ TS `status: string`) match across Tasks 1 and 3. `ListProducts(ctx, shopID, onlyStatus)`'s 3-arg signature is used consistently in both its `pgRepository` implementation (Task 1) and both call sites (Task 2). `RestoreProduct`'s signature matches between `Repository` interface, `pgRepository` implementation, `fakeRepo`, `fakeShopRepo`, and the new HTTP handler.
- **Existing-button collision check:** explicitly called out in Global Constraints and in Task 3 Step 2/4 that the pre-existing "Ləğv et" (cancel-edit) button is untouched and unrelated to the new "Ləğv edilib" status/tab — different code paths, different meanings, verified by re-reading `MyShop.tsx`'s current `cancelEdit`/edit-form-cancel-button before writing this plan.
- **Ownership-check reuse:** `RestoreProduct` (Task 2) uses the identical `requireSession` → `GetProductShopID` → compare → 404 pattern already proven in `UpdateProduct`/`DeleteProduct`/`DeleteProductImage`, per the Global Constraints.
- **Demo data protection:** Task 4 explicitly creates a disposable test product for the full create→delete→restore→delete-again round-trip and calls out, by name, the 10 real demo products that must never be touched by this verification.
- **Known limitation surfaced, not hidden:** Task 4 Step 5 explicitly notes that hard-delete no longer exists post this change — disposable test products end up soft-deleted (hidden, not removed) rather than truly gone. This is flagged as an accepted trade-off rather than silently left for the user to discover.
