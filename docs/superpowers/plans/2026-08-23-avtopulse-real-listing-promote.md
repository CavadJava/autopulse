# Real Elanlar üçün Promote (VIP Tier) Sistemi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real elanlar (`shop_products`/`user_products`) üçün tam funksional Promote (İrəli çək/VIP/Premium) sistemi — real DB-də saxlanan balans, real backend endpoint, real balans-tədqədüq. Promote düymələri sahibin öz idarəetmə səhifəsində (`KabinetElanlarim.tsx`/`MyShop.tsx`) işlək olur; `RealListingDetail.tsx`-in ictimai sidebar-ında eyni kart görünür, YALNIZ baxan şəxs bu elanın sahibi olduqda aktivdir.

**Architecture:** `shop`/`user` sahiblərinə (mağaza/istifadəçi) `balans INT` sütunu, `shop_products`/`user_products`-a `vip_tier TEXT` sütunu. `POST /me/products/{id}/promote` — tək tranzaksiyada server-side qiymətlə balansdan tədqədüq edir, tier-i yeniləyir. VIP tier həmişəlik qalır (müddət/expiry yoxdur). Mock `PromoteModal` komponenti olduğu kimi təkrar istifadə olunur, yalnız `onConfirm` real API-yə bağlanır.

**Tech Stack:** Go/chi/pgx (backend, tranzaksiya üçün `pgx.Tx`), React/TypeScript (frontend).

## Global Constraints

- Qiymətlər (dəyişməz, server-side sabit): `ireli_cek: 3 AZN`, `vip: 5 AZN`, `premium_vip: 7 AZN`.
- `ireli_cek` tier-i HEÇ VAXT `vip_tier`-i dəyişdirmir — yalnız balans tədqədüq edir (mock sistemdəki `promoTierToVipTier` davranışı ilə eyni).
- Balans YALNIZ admin/manual olaraq birbaşa `psql UPDATE` ilə artırılır — bu plan heç bir top-up UI/endpoint yaratmır.
- VIP tier müddətsizdir (heç bir expiry/cron yoxdur).
- Balans kifayət etməyəndə: backend `402 Payment Required`, frontend "Balansınız kifayət etmir" mesajı göstərir, heç bir dəyişiklik baş vermir.
- Başqasının elanını promote etməyə cəhd backend tərəfindən `404`/`401` ilə rədd olunur (mövcud `GetProductShopID`/`GetProductUserID` mülkiyyət-yoxlama nümunəsi ilə eyni).
- Mövcud 12+ real elana və mock sistemə (dəyişməz qalır) toxunulmur.
- Deploy axını dəyişməz: backend = rsync + `go build` serverdə + `systemctl restart avtopulse-backend` + **migrasiya faylını serverə köçürdükdən sonra mütləq `public.schema_migrations`-a tracking sətri əlavə et** (2026-08-23-də tapılan gotcha — əl ilə `psql -f` tətbiqi backend-in öz migrasiya runner-i üçün "tətbiq olunmayıb" kimi görünür, restart zamanı crash-loop yaradır); frontend = `git push origin main` + `bash deploy/deploy.sh`.

---

## Task 1: DB migrasiyası — `balans`, `vip_tier`

**Files:**
- Create: `avtopulse-backend/migrations/0009_promote_and_balance.sql`

**Interfaces:**
- Produces: `avto444.shop.balans`, `avto444.user.balans`, `avto444.shop_products.vip_tier`, `avto444.user_products.vip_tier` sütunları — bütün sonrakı Go dəyişikliklər bunlardan asılıdır.

- [ ] **Step 1: Migrasiya faylını yaz**

```sql
ALTER TABLE avto444.shop ADD COLUMN balans INT NOT NULL DEFAULT 0;
ALTER TABLE avto444.user ADD COLUMN balans INT NOT NULL DEFAULT 0;

ALTER TABLE avto444.shop_products ADD COLUMN vip_tier TEXT NOT NULL DEFAULT 'standart'
  CHECK (vip_tier IN ('standart', 'vip', 'premium_vip'));
ALTER TABLE avto444.user_products ADD COLUMN vip_tier TEXT NOT NULL DEFAULT 'standart'
  CHECK (vip_tier IN ('standart', 'vip', 'premium_vip'));
```

- [ ] **Step 2: Serverə köçür (rsync ilə, backend deploy-un bir hissəsi kimi Task 8-də tətbiq olunacaq)**

Bu addımda faylı YALNIZ yarat və commit et — server-side tətbiqi Task 8-də (backend deploy) ediləcək, çünki backend-in öz migrasiya runner-i faylı avtomatik tətbiq edəcək (rsync + restart kifayətdir, əl ilə `psql -f` lazım deyil — əvvəlki gotcha-nın dərsi budur: manual tətbiq yalnız runner-in özünü buraxdıqda lazımdır).

- [ ] **Step 3: Commit**

```bash
git add avtopulse-backend/migrations/0009_promote_and_balance.sql
git commit -m "feat(backend): add balans and vip_tier columns for promote system"
```

---

## Task 2: Go struct genişlənməsi — `Shop`/`User`/`Product`-a `Balans`/`VipTier`

**Files:**
- Modify: `avtopulse-backend/internal/shop/model.go`
- Modify: `avtopulse-backend/internal/user/model.go`

**Interfaces:**
- Consumes: Task 1-in `balans`/`vip_tier` sütunları.
- Produces: `Shop.Balans int`, `User.Balans int`, `Product.VipTier string` (hər iki paketdə) — Task 3/4-ün repository dəyişiklikləri bunları scan edəcək.

- [ ] **Step 1: `shop/model.go`-ya sahələr əlavə et**

```go
type Shop struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	CustomerID int64  `json:"customerId"`
	Title      string `json:"title"`
	Details    string `json:"details"`
	WorkTimes  string `json:"workTimes"`
	LogoURL    string `json:"logoUrl"`
	Email      string `json:"email"`
	Balans     int    `json:"balans"`
}
```

`Product` struct-ına:

```go
	DetailsJSON json.RawMessage `json:"details"`
	ViewCount   int             `json:"viewCount"`
	VipTier     string          `json:"vipTier"`

	Images []ProductImage `json:"images"`
```

(yəni mövcud `DetailsJSON`/`ViewCount` sahələrinin yanına `VipTier string json:"vipTier"` əlavə olunur.)

- [ ] **Step 2: `user/model.go`-ya eyni sahələri əlavə et**

`User` struct-ına `Balans int json:"balans"`, `Product` struct-ına `VipTier string json:"vipTier"` (eyni yerdə, `DetailsJSON`/`ViewCount`-un yanında).

- [ ] **Step 3: `go build` ilə kompilyasiyanı yoxla (gözlənilən: repository/handler fayllarında `Scan`/literal xətaları — sonrakı tasklarda düzələcək)**

```bash
cd avtopulse-backend && go vet ./internal/shop/... ./internal/user/... 2>&1 | head -20
```

Sintaksis xətası olmamalıdır — Go-da yeni struct sahəsi əlavə etmək mövcud named-field literal-ları pozmur (əvvəlki fazada da eyni müşahidə edilib).

- [ ] **Step 4: Commit**

```bash
git add avtopulse-backend/internal/shop/model.go avtopulse-backend/internal/user/model.go
git commit -m "feat(backend): add Balans and VipTier fields to shop and user models"
```

---

## Task 3: `shop` repository — `PromoteProduct`, balans oxuma

**Files:**
- Modify: `avtopulse-backend/internal/shop/repository.go`
- Modify: `avtopulse-backend/internal/shop/handler_test.go` (fake repo-nun yeni metodu implementasiya etməsi üçün)

**Interfaces:**
- Consumes: Task 2-nin `Shop.Balans`, `Product.VipTier` sahələri.
- Produces: `Repository`-ə yeni metod `PromoteProduct(ctx, productID int64, tier string, price int) (*Product, error)`; yeni `ErrInsufficientBalance` xəta tipi; `GetShopByID`/`ListProducts`/`ListAllProducts`/`ListActiveProducts`-in `vip_tier` oxuması. Task 5 (auth handler) bunu istifadə edəcək.

- [ ] **Step 1: `ErrInsufficientBalance` xəta tipini əlavə et**

```go
var ErrInsufficientBalance = errors.New("shop: insufficient balance")
```

(`var ErrNotFound`/`var ErrDuplicate`-in yanına.)

- [ ] **Step 2: `GetShopByID`-i `balans`-ı da oxuyacaq şəkildə dəyiş**

```go
func (r *pgRepository) GetShopByID(ctx context.Context, id int64) (*Shop, error) {
	var s Shop
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, customer_id, title, COALESCE(details, ''), COALESCE(work_times, ''), COALESCE(logo_url, ''), email, balans FROM avto444.shop WHERE id = $1`,
		id,
	).Scan(&s.ID, &s.Name, &s.CustomerID, &s.Title, &s.Details, &s.WorkTimes, &s.LogoURL, &s.Email, &s.Balans)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}
```

- [ ] **Step 3: `ListProducts`/`ListAllProducts`/`ListActiveProducts`-a `vip_tier` sütununu əlavə et**

Hər üç funksiyada `SELECT`-ə `, vip_tier` (mövcud `details_json, view_count`-un yanına), `Scan`-a `&p.VipTier` əlavə et. Nümunə (`ListProducts`, yalnız dəyişən sətirlər):

```go
	query := `SELECT id, name, title, COALESCE(details, ''),
	                 COALESCE(marka, ''), COALESCE(model, ''), COALESCE(il, 0),
	                 COALESCE(qiymet, 0), COALESCE(yurus, 0), COALESCE(yanacaq, ''), COALESCE(ban, ''), status,
	                 details_json, view_count, vip_tier
	          FROM avto444.shop_products WHERE shop_id = $1`
	...
		if err := rows.Scan(&p.ID, &p.Name, &p.Title, &p.Details,
			&p.Marka, &p.Model, &p.Il, &p.Qiymet, &p.Yurus, &p.Yanacaq, &p.Ban, &p.Status,
			&p.DetailsJSON, &p.ViewCount, &p.VipTier); err != nil {
```

Eyni forma `ListAllProducts` və `ListActiveProducts`-da (bu ikincidə cədvəl alias-ı `sp` olduğuna görə `sp.vip_tier`).

- [ ] **Step 4: `CreateProduct`/`UpdateProduct`-ın qaytardığı `Product{}` literal-larına `VipTier: "standart"` (create) və ya oxunan dəyər (update, aşağıda) əlavə et**

`CreateProduct`-ın qaytardığı literala: `VipTier: "standart",` əlavə et (yeni elan həmişə standart tier-də yaranır).

`UpdateProduct`-un `RETURNING`-inə `vip_tier` əlavə et ki, dəyişməz qalan tier itməsin:

```go
func (r *pgRepository) UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error) {
	var status string
	var vipTier string
	err := r.pool.QueryRow(ctx,
		`UPDATE avto444.shop_products
		 SET name = $1, title = $2, details = $3, marka = $4, model = $5, il = $6, qiymet = $7, yurus = $8, yanacaq = $9, ban = $10,
		     details_json = details_json || $11::jsonb
		 WHERE id = $12
		 RETURNING status, vip_tier`,
		input.Name, input.Title, input.Details, input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban,
		nonSellerFields(input.DetailsJSON), productID,
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
		VipTier: vipTier, Images: images,
	}, nil
}
```

- [ ] **Step 5: `PromoteProduct` metodunu interfeysə və implementasiyaya əlavə et**

`Repository` interfeysinə:

```go
PromoteProduct(ctx context.Context, productID int64, tier string, price int) (*Product, error)
```

İmplementasiya (tək tranzaksiyada balans yoxlama + tədqədüq + tier yeniləmə):

```go
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
		        details_json, view_count, vip_tier
		 FROM avto444.shop_products WHERE id = $1`,
		productID,
	).Scan(&p.ID, &p.Name, &p.Title, &p.Details, &p.Marka, &p.Model, &p.Il,
		&p.Qiymet, &p.Yurus, &p.Yanacaq, &p.Ban, &p.Status, &p.DetailsJSON, &p.ViewCount, &newTier)
	if err != nil {
		return nil, err
	}
	p.VipTier = newTier
	p.Images = images
	return &p, nil
}
```

- [ ] **Step 6: `handler_test.go`-dakı fake repo-ya `PromoteProduct` stub-ı əlavə et**

`grep -n "func (f \*fakeRepo)" avtopulse-backend/internal/shop/handler_test.go` ilə fake-in adını təsdiqlə, sonuna əlavə et:

```go
func (f *fakeRepo) PromoteProduct(ctx context.Context, productID int64, tier string, price int) (*Product, error) {
	return nil, nil
}
```

- [ ] **Step 7: Testləri işə sal**

```bash
cd avtopulse-backend && go test ./internal/shop/... -v
```

Gözlənilən: PASS (mövcud testlər dəyişməyib, yalnız fake-in interfeys uyğunluğu üçün stub əlavə olundu).

- [ ] **Step 8: Commit**

```bash
git add avtopulse-backend/internal/shop/repository.go avtopulse-backend/internal/shop/handler_test.go
git commit -m "feat(backend): shop repository supports promote (tiered balance deduction) and reads vip_tier"
```

---

## Task 4: `user` repository — eyni `PromoteProduct`, balans oxuma

**Files:**
- Modify: `avtopulse-backend/internal/user/repository.go`
- Modify: `avtopulse-backend/internal/user/repository_test.go`
- Modify: `avtopulse-backend/internal/user/handler_test.go`

**Interfaces:**
- Consumes: Task 2-nin `User.Balans`, `Product.VipTier`.
- Produces: `Repository.PromoteProduct(ctx, productID int64, tier string, price int) (*Product, error)`, `ErrInsufficientBalance` — Task 6 bunu istifadə edəcək.

- [ ] **Step 1: `ErrInsufficientBalance` əlavə et**

```go
var ErrInsufficientBalance = errors.New("user: insufficient balance")
```

- [ ] **Step 2: `ListMyProducts`/`ListPendingProducts`/`ListActiveProducts`-a `vip_tier` əlavə et**

Task 3 Step 3-dəki eyni forma — `SELECT`-ə `, vip_tier`, `Scan`-a `&p.VipTier`.

- [ ] **Step 3: `CreateProduct`-ın qaytardığı literala `VipTier: "standart"` əlavə et, `UpdateProduct`-un `RETURNING`-inə `vip_tier` əlavə et**

`CreateProduct`:
```go
	return &Product{
		ID: id, UserID: userID, Marka: input.Marka, Model: input.Model, Il: input.Il,
		Qiymet: input.Qiymet, Yurus: input.Yurus, Yanacaq: input.Yanacaq, Ban: input.Ban,
		Title: input.Title, Details: input.Details, Status: "gozlemede",
		DetailsJSON: detailsJSON, VipTier: "standart", Images: []ProductImage{},
	}, nil
```

`UpdateProduct`:
```go
func (r *pgRepository) UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error) {
	var currentStatus string
	err := r.pool.QueryRow(ctx, `SELECT status FROM avto444.user_products WHERE id = $1`, productID).Scan(&currentStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	newStatus := currentStatus
	if currentStatus == "legv_edilib" {
		newStatus = "gozlemede"
	}

	var userID int64
	var vipTier string
	err = r.pool.QueryRow(ctx,
		`UPDATE avto444.user_products
		 SET marka = $1, model = $2, il = $3, qiymet = $4, yurus = $5, yanacaq = $6, ban = $7, title = $8, details = $9, status = $10, updated_at = now(),
		     details_json = details_json || $11::jsonb
		 WHERE id = $12
		 RETURNING user_id, vip_tier`,
		input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, input.Title, input.Details, newStatus,
		nonSellerFields(input.DetailsJSON), productID,
	).Scan(&userID, &vipTier)
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
		Title: input.Title, Details: input.Details, Status: newStatus, VipTier: vipTier, Images: images,
	}, nil
}
```

- [ ] **Step 4: `PromoteProduct` metodunu əlavə et**

`Repository` interfeysinə: `PromoteProduct(ctx context.Context, productID int64, tier string, price int) (*Product, error)`.

İmplementasiya — Task 3 Step 5-dəki eyni struktur, `avto444.user`/`user_products` üzərində:

```go
func (r *pgRepository) PromoteProduct(ctx context.Context, productID int64, tier string, price int) (*Product, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var userID int64
	if err := tx.QueryRow(ctx, `SELECT user_id FROM avto444.user_products WHERE id = $1`, productID).Scan(&userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	var balans int
	if err := tx.QueryRow(ctx, `SELECT balans FROM avto444.user WHERE id = $1 FOR UPDATE`, userID).Scan(&balans); err != nil {
		return nil, err
	}
	if balans < price {
		return nil, ErrInsufficientBalance
	}

	if _, err := tx.Exec(ctx, `UPDATE avto444.user SET balans = balans - $1 WHERE id = $2`, price, userID); err != nil {
		return nil, err
	}

	newTier := tier
	if tier == "ireli_cek" {
		var currentTier string
		if err := tx.QueryRow(ctx, `SELECT vip_tier FROM avto444.user_products WHERE id = $1`, productID).Scan(&currentTier); err != nil {
			return nil, err
		}
		newTier = currentTier
	} else {
		if _, err := tx.Exec(ctx, `UPDATE avto444.user_products SET vip_tier = $1 WHERE id = $2`, tier, productID); err != nil {
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
		`SELECT id, user_id, COALESCE(marka, ''), COALESCE(model, ''), COALESCE(il, 0),
		        COALESCE(qiymet, 0), COALESCE(yurus, 0), COALESCE(yanacaq, ''), COALESCE(ban, ''),
		        title, COALESCE(details, ''), status, details_json, view_count
		 FROM avto444.user_products WHERE id = $1`,
		productID,
	).Scan(&p.ID, &p.UserID, &p.Marka, &p.Model, &p.Il, &p.Qiymet, &p.Yurus,
		&p.Yanacaq, &p.Ban, &p.Title, &p.Details, &p.Status, &p.DetailsJSON, &p.ViewCount)
	if err != nil {
		return nil, err
	}
	p.VipTier = newTier
	p.Images = images
	return &p, nil
}
```

- [ ] **Step 5: `repository_test.go`/`handler_test.go`-dakı fake-lərə `PromoteProduct` stub-ı əlavə et**

Hər iki fayldakı fake üçün (adları Task əvvəlki fazada `fakeRepo`/`fakeUserRepo` idi):

```go
func (f *fakeRepo) PromoteProduct(ctx context.Context, productID int64, tier string, price int) (*Product, error) {
	return nil, nil
}
```

(uyğun struct adı ilə hər faylda).

- [ ] **Step 6: Testləri işə sal**

```bash
go test ./internal/user/... -v
```

Gözlənilən: PASS.

- [ ] **Step 7: Commit**

```bash
git add avtopulse-backend/internal/user/repository.go avtopulse-backend/internal/user/repository_test.go avtopulse-backend/internal/user/handler_test.go
git commit -m "feat(backend): user repository supports promote (tiered balance deduction) and reads vip_tier"
```

---

## Task 5: `listings` paketinə `vipTier` əlavə et

**Files:**
- Modify: `avtopulse-backend/internal/listings/model.go`
- Modify: `avtopulse-backend/internal/listings/handler.go`

**Interfaces:**
- Consumes: Task 3/4-ün `Product.VipTier`.
- Produces: `PublicListing.VipTier string json:"vipTier"` — Task 9-un frontend `ApiListing` tipi bunu güdəcək.

- [ ] **Step 1: `PublicListing`-ə sahə əlavə et**

```go
type PublicListing struct {
	Source      string          `json:"source"`
	ID          int64           `json:"id"`
	Marka       string          `json:"marka"`
	Model       string          `json:"model"`
	Il          int             `json:"il"`
	Qiymet      int             `json:"qiymet"`
	Yurus       int             `json:"yurus"`
	Yanacaq     string          `json:"yanacaq"`
	Ban         string          `json:"ban"`
	Title       string          `json:"title"`
	Details     string          `json:"details"`
	Images      []ImageOut      `json:"images"`
	SellerType  string          `json:"sellerType"`
	SellerName  string          `json:"sellerName"`
	DetailsJSON json.RawMessage `json:"detailsJson"`
	ViewCount   int             `json:"viewCount"`
	VipTier     string          `json:"vipTier"`
}
```

- [ ] **Step 2: `handler.go`-nun 4 `PublicListing{}` literalına `VipTier: p.VipTier` əlavə et**

`PublicListings`-in shop qolu, `PublicListings`-in user qolu, `PublicListingDetail`-in shop qolu, `PublicListingDetail`-in user qolu — hamısına `DetailsJSON: p.DetailsJSON, ViewCount: ...`-un yanına `VipTier: p.VipTier,` əlavə et.

- [ ] **Step 3: Testləri işə sal**

```bash
go test ./internal/listings/... -v
```

Gözlənilən: PASS (mövcud fake-lər `Product`-i embed etdiyi üçün `VipTier` avtomatik ötürülür, əlavə dəyişiklik lazım deyil).

- [ ] **Step 4: Commit**

```bash
git add avtopulse-backend/internal/listings/
git commit -m "feat(backend): expose vipTier on public listings API"
```

---

## Task 6: `POST /me/products/{id}/promote` endpoint-i (shop tərəf)

**Files:**
- Modify: `avtopulse-backend/internal/auth/handler.go`
- Modify: `avtopulse-backend/cmd/server/main.go` (route mount, `r.Post("/api/shops/me/products/{id}/promote", ...)`)

**Interfaces:**
- Consumes: Task 3-ün `shop.Repository.PromoteProduct`, `shop.ErrInsufficientBalance`.
- Produces: `POST /api/shops/me/products/{id}/promote` — Task 10-un frontend `promoteShopListing` funksiyası bunu çağıracaq.

- [ ] **Step 1: `internal/auth/handler.go`-ya `promoteRequest` tipi və server-side qiymət cədvəli əlavə et**

```go
var promoPrices = map[string]int{"ireli_cek": 3, "vip": 5, "premium_vip": 7}

type promoteRequest struct {
	Tier string `json:"tier"`
}
```

- [ ] **Step 2: `PromoteProduct` handler funksiyasını yaz**

```go
// PromoteProduct godoc
// @Summary      Promote a listing (İrəli çək/VIP/Premium) by deducting the shop's balance
// @Description  Requires a valid shop_session cookie. The product must belong to the authenticated shop. Price is server-side, not client-supplied.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        id    path  int              true  "Product id"
// @Param        body  body  promoteRequest   true  "Tier: ireli_cek, vip, or premium_vip"
// @Success      200   {object}  shop.Product
// @Failure      400   {string}  string  "invalid tier"
// @Failure      401   {string}  string  "unauthorized"
// @Failure      402   {object}  map[string]any  "insufficient balance"
// @Failure      404   {string}  string  "product not found or not owned by this shop"
// @Failure      500   {string}  string  "internal error"
// @Router       /me/products/{id}/promote [post]
func (h *authHandlers) PromoteProduct(w http.ResponseWriter, req *http.Request) {
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

	var body promoteRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	price, ok := promoPrices[body.Tier]
	if !ok {
		http.Error(w, "invalid tier", http.StatusBadRequest)
		return
	}

	product, err := h.shopRepo.PromoteProduct(req.Context(), productID, body.Tier, price)
	if errors.Is(err, shop.ErrInsufficientBalance) {
		writeJSON(w, http.StatusPaymentRequired, map[string]any{
			"error": "insufficient_balance", "required": price,
		})
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, product)
}
```

- [ ] **Step 3: `cmd/server/main.go`-da route mount et**

`grep -n "r.Post(\"/api/shops/me/products/{id}/restore\"" avtopulse-backend/cmd/server/main.go` ilə mövcud oxşar sətri tap, ondan sonra əlavə et:

```go
r.Post("/api/shops/me/products/{id}/promote", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
})
```

`internal/auth`-ın öz iç router-ində (`NewHandler` funksiyasında) `r.Post("/me/products/{id}/promote", h.PromoteProduct)` əlavə et — `grep -n "r.Post(\"/me/products/{id}/restore\"" avtopulse-backend/internal/auth/handler.go` ilə mövcud nümunəni tap.

- [ ] **Step 4: `go build` və testləri işə sal**

```bash
go build ./... && go test ./internal/auth/... -v
```

Gözlənilən: PASS.

- [ ] **Step 5: Commit**

```bash
git add avtopulse-backend/internal/auth/handler.go avtopulse-backend/cmd/server/main.go
git commit -m "feat(backend): add POST /me/products/{id}/promote endpoint for shop listings"
```

---

## Task 7: `POST /me/products/{id}/promote` endpoint-i (user tərəf)

**Files:**
- Modify: `avtopulse-backend/internal/user/handler.go`
- Modify: `avtopulse-backend/cmd/server/main.go`

**Interfaces:**
- Consumes: Task 4-ün `user.Repository.PromoteProduct`, `user.ErrInsufficientBalance`.
- Produces: `POST /api/users/me/products/{id}/promote` — Task 10-un frontend `promoteUserListing` funksiyası bunu çağıracaq.

- [ ] **Step 1: `internal/user/handler.go`-ya eyni `promoPrices`/`promoteRequest`/`PromoteProduct` handler-i əlavə et**

Task 6 Step 1-2-dəki eyni struktur, `h.repo.GetProductUserID`/`h.repo.PromoteProduct` və `user.ErrNotFound`/`user.ErrInsufficientBalance` ilə (paket daxili olduğu üçün `user.` prefiksi yoxdur):

```go
var promoPrices = map[string]int{"ireli_cek": 3, "vip": 5, "premium_vip": 7}

type promoteRequest struct {
	Tier string `json:"tier"`
}

func (h *userHandlers) PromoteProduct(w http.ResponseWriter, req *http.Request) {
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

	var body promoteRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	price, ok := promoPrices[body.Tier]
	if !ok {
		http.Error(w, "invalid tier", http.StatusBadRequest)
		return
	}

	product, err := h.repo.PromoteProduct(req.Context(), productID, body.Tier, price)
	if errors.Is(err, ErrInsufficientBalance) {
		writeJSON(w, http.StatusPaymentRequired, map[string]any{
			"error": "insufficient_balance", "required": price,
		})
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, product)
}
```

- [ ] **Step 2: `NewHandler`-in iç router-inə route əlavə et**

```go
r.Post("/me/products/{id}/promote", h.PromoteProduct)
```

- [ ] **Step 3: `cmd/server/main.go`-da mount et**

```go
r.Post("/api/users/me/products/{id}/promote", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
})
```

- [ ] **Step 4: `go build` və testləri işə sal**

```bash
go build ./... && go test ./...
```

Gözlənilən: bütün paketlər PASS.

- [ ] **Step 5: Commit**

```bash
git add avtopulse-backend/internal/user/handler.go avtopulse-backend/cmd/server/main.go
git commit -m "feat(backend): add POST /me/products/{id}/promote endpoint for user listings"
```

---

## Task 8: Backend deploy + canlı doğrulama

**Files:** (kod dəyişikliyi yoxdur — yalnız deploy)

**Interfaces:**
- Consumes: Task 1-7-nin bütün dəyişiklikləri.
- Produces: canlıda işlək promote API — Task 9-11 (frontend) bu canlı API-yə qarşı test olunacaq.

- [ ] **Step 1: Serverə rsync et, build et, restart et**

```bash
rsync -avz --exclude='.git' --exclude='avtopulse-backend/server' \
  -e "ssh -i ~/.ssh/youtube-remote-webrtc_ed25519" \
  avtopulse-backend/ root@157.180.73.79:/opt/avtopulse-backend/

ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "export PATH=\$PATH:/usr/local/go/bin && cd /opt/avtopulse-backend && go build -o avtopulse-backend ./cmd/server"

ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "chown youtube-remote:youtube-remote /opt/avtopulse-backend/avtopulse-backend && systemctl restart avtopulse-backend"
```

- [ ] **Step 2: Backend-in düzgün başladığını doğrula (migrasiya crash-loop-una qarşı)**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 "sleep 2 && systemctl status avtopulse-backend --no-pager | head -10"
```

Gözlənilən: `Active: active (running)`. Əgər crash-loop varsa, `journalctl -u avtopulse-backend -n 20 --no-pager` ilə səbəbi yoxla — çox güman ki backend-in öz migrasiya runner-i `0009_promote_and_balance.sql`-ı avtomatik tətbiq edib, əlavə əl işi lazım deyil.

- [ ] **Step 3: Test mağazasına balans əlavə et (manual, birbaşa DB)**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "PGPASSWORD='z8vsYpTz9GjEwdKSwtYWK2bvTvXUPUs' psql -h localhost -U avtopulse -d avtopulse -c \"UPDATE avto444.shop SET balans = 20 WHERE name = 'avto444'\""
```

- [ ] **Step 4: Login et, kifayət qədər balansla promote et**

```bash
curl -s -c /tmp/shop_cookie.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/login \
  -H "Content-Type: application/json" -d '{"email":"avto444@autopulse.local","password":"avto444pass"}'

curl -s -b /tmp/shop_cookie.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/me/products/7/promote \
  -H "Content-Type: application/json" -d '{"tier":"vip"}'
```

Gözlənilən: `200`, cavabda `"vipTier":"vip"`.

- [ ] **Step 5: Balansın azaldığını doğrula**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "PGPASSWORD='z8vsYpTz9GjEwdKSwtYWK2bvTvXUPUs' psql -h localhost -U avtopulse -d avtopulse -c \"SELECT balans FROM avto444.shop WHERE name = 'avto444'\""
```

Gözlənilən: `15` (20 - 5 VIP qiyməti).

- [ ] **Step 6: Kifayət etməyən balansla cəhd et**

```bash
curl -s -b /tmp/shop_cookie.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/me/products/7/promote \
  -H "Content-Type: application/json" -d '{"tier":"premium_vip"}'
```

Balans 15 AZN, premium_vip 7 AZN-dir — bu, uğurlu olmalıdır (15 ≥ 7). Balansı 5-ə endirib təkrar cəhd et ki, `402` görünsün:

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "PGPASSWORD='z8vsYpTz9GjEwdKSwtYWK2bvTvXUPUs' psql -h localhost -U avtopulse -d avtopulse -c \"UPDATE avto444.shop SET balans = 2 WHERE name = 'avto444'\""

curl -s -w "\nHTTP %{http_code}\n" -b /tmp/shop_cookie.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/me/products/7/promote \
  -H "Content-Type: application/json" -d '{"tier":"vip"}'
```

Gözlənilən: `HTTP 402`, body `{"error":"insufficient_balance","required":5}`.

- [ ] **Step 7: `ireli_cek`-in tier-i dəyişdirmədiyini doğrula**

Balansı bərpa et, `ireli_cek` göndər, `vipTier`-in DƏYİŞMƏDİYİNİ (əvvəlki `vip` olaraq qaldığını) yoxla:

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "PGPASSWORD='z8vsYpTz9GjEwdKSwtYWK2bvTvXUPUs' psql -h localhost -U avtopulse -d avtopulse -c \"UPDATE avto444.shop SET balans = 20 WHERE name = 'avto444'\""

curl -s -b /tmp/shop_cookie.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/me/products/7/promote \
  -H "Content-Type: application/json" -d '{"tier":"ireli_cek"}'
```

Gözlənilən: `200`, `"vipTier":"vip"` (dəyişməyib), balans 3 AZN azalıb.

- [ ] **Step 8: Test elanının `vip_tier`-ini `standart`-a geri qaytar (canlı datanı təmiz saxlamaq üçün)**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "PGPASSWORD='z8vsYpTz9GjEwdKSwtYWK2bvTvXUPUs' psql -h localhost -U avtopulse -d avtopulse -c \"UPDATE avto444.shop_products SET vip_tier = 'standart' WHERE id = 7; UPDATE avto444.shop SET balans = 0 WHERE name = 'avto444'\""
rm -f /tmp/shop_cookie.txt
```

---

## Task 9: Frontend tipləri — `vipTier`/`balans` əlavə et

**Files:**
- Modify: `src/api/listings.ts` (`ApiListing`)
- Modify: `src/api/auth.ts` (`UserListingApi`, `apiListingToUserListing`)
- Modify: `src/api/shop.ts` (`ShopProduct`)

**Interfaces:**
- Consumes: Task 5-in `PublicListing.VipTier`, Task 3/4-ün `Product.VipTier`.
- Produces: `ApiListing.vipTier`, `UserListing.vipTier` (real dəyər, artıq hardcode `'standart'` deyil), `ShopProduct.vipTier` — Task 10/11 bunları istifadə edəcək.

- [ ] **Step 1: `src/api/listings.ts`-də `ApiListing`-ə `vipTier` əlavə et**

```typescript
export interface ApiListing {
  // ...mövcud sahələr...
  detailsJson: ApiListingDetails;
  viewCount: number;
  vipTier: 'standart' | 'vip' | 'premium_vip';
}
```

- [ ] **Step 2: `src/api/auth.ts`-də `UserListingApi`-ə `vipTier` əlavə et, `apiListingToUserListing`-i real dəyəri istifadə edəcək şəkildə dəyiş**

```typescript
export interface UserListingApi {
  // ...mövcud sahələr...
  detailsJson?: ApiListingDetails;
  vipTier: 'standart' | 'vip' | 'premium_vip';
}
```

```typescript
export function apiListingToUserListing(l: UserListingApi): UserListing {
  return {
    id: String(l.id),
    listingId: String(l.id),
    başlıq: l.title,
    qiymət: l.qiymet,
    şəkil: l.images?.[0]?.minioUrl ?? '',
    status: apiStatusToLocal(l.status),
    tarix: '',
    vipTier: l.vipTier,
  };
}
```

- [ ] **Step 3: `src/api/shop.ts`-də `ShopProduct`-a `vipTier` əlavə et**

```typescript
export interface ShopProduct {
  // ...mövcud sahələr...
  vipTier: 'standart' | 'vip' | 'premium_vip';
}
```

- [ ] **Step 4: `npx tsc -b --noEmit` işə sal**

```bash
cd /Users/frontend/workspace/me-github/autopulse && npx tsc -b --noEmit 2>&1 | head -40
```

Gözlənilən: PASS (yeni sahələr əlavədir, mövcud kod pozulmur).

- [ ] **Step 5: Commit**

```bash
git add src/api/listings.ts src/api/auth.ts src/api/shop.ts
git commit -m "feat(frontend): add vipTier to ApiListing/UserListingApi/ShopProduct types"
```

---

## Task 10: Real promote API funksiyaları

**Files:**
- Modify: `src/api/auth.ts` (`promoteRealUserListing`)
- Modify: `src/api/shop.ts` (`promoteShopListing`)

**Interfaces:**
- Consumes: Task 6/7-nin `POST .../promote` endpoint-ləri.
- Produces: `promoteRealUserListing(id, tier)`, `promoteShopListing(id, tier)` — Task 11/12-nin UI inteqrasiyası bunları çağıracaq.

- [ ] **Step 1: `src/api/auth.ts`-ə `InsufficientBalanceError` və `promoteRealUserListing` əlavə et**

```typescript
export class InsufficientBalanceError extends Error {
  constructor(public required: number) {
    super('Insufficient balance');
  }
}

export async function promoteRealUserListing(
  listingId: number,
  tier: 'ireli_cek' | 'vip' | 'premium_vip'
): Promise<UserListingApi> {
  const res = await fetch(`${API_BASE}/api/users/me/products/${listingId}/promote`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
  });
  if (res.status === 401) {
    throw new UserUnauthorizedError('Not logged in');
  }
  if (res.status === 402) {
    const body = await res.json();
    throw new InsufficientBalanceError(body.required);
  }
  if (!res.ok) {
    throw new Error(`promoteRealUserListing failed: ${res.status}`);
  }
  return res.json();
}
```

- [ ] **Step 2: `src/api/shop.ts`-ə eyni `promoteShopListing` funksiyasını əlavə et**

`InsufficientBalanceError`-u `auth.ts`-dən import et (`import { InsufficientBalanceError } from './auth'`) — iki ayrı sinif təkrar yaratmaqdansa bir dəfə paylaşılır:

```typescript
export async function promoteShopListing(
  productId: number,
  tier: 'ireli_cek' | 'vip' | 'premium_vip'
): Promise<ShopProduct> {
  const res = await fetch(`${API_BASE}/api/shops/me/products/${productId}/promote`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (res.status === 402) {
    const body = await res.json();
    throw new InsufficientBalanceError(body.required);
  }
  if (!res.ok) {
    throw new Error(`promoteShopListing failed: ${res.status}`);
  }
  return res.json();
}
```

- [ ] **Step 3: `npx tsc -b --noEmit` işə sal**

```bash
npx tsc -b --noEmit 2>&1 | head -40
```

Gözlənilən: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/api/auth.ts src/api/shop.ts
git commit -m "feat(frontend): add real promote API client functions with InsufficientBalanceError"
```

---

## Task 11: `KabinetElanlarim.tsx` və `MyShop.tsx`-a Promote düyməsi

**Files:**
- Modify: `src/pages/kabinet/KabinetElanlarim.tsx`
- Modify: `src/pages/kabinet/KabinetElanlarim.module.css`
- Modify: `src/pages/shop/MyShop.tsx`
- Modify: `src/pages/shop/MyShop.module.css`

**Interfaces:**
- Consumes: Task 10-un `promoteRealUserListing`/`promoteShopListing`, mövcud `PromoteModal` komponenti.
- Produces: hər iki səhifədə real, işlək promote UX-i — Task 12-nin `RealListingDetail.tsx`-i eyni backend-i istifadə edəcək (fərqli giriş nöqtəsindən).

- [ ] **Step 1: `KabinetElanlarim.tsx`-ə promote state-i və `PromoteModal` inteqrasiyasını əlavə et**

```typescript
import { useState } from 'react'; // artıq import olunub, dəyişməz
import PromoteModal from '../../components/PromoteModal';
import {
  getMyListings,
  apiListingToUserListing,
  deleteUserListing,
  promoteRealUserListing,
  InsufficientBalanceError,
  UserUnauthorizedError,
} from '../../api/auth';
```

`KabinetElanlarim` funksiyasının içinə:

```typescript
const [promotingListing, setPromotingListing] = useState<UserListing | null>(null);
const [promoteError, setPromoteError] = useState<string | null>(null);

const handlePromote = async (tier: 'ireli_cek' | 'vip' | 'premium_vip') => {
  if (!promotingListing) return;
  try {
    await promoteRealUserListing(Number(promotingListing.listingId), tier);
    setPromoteError(null);
    await loadListings();
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      setPromoteError(`Balansınız kifayət etmir (${err.required} AZN lazımdır).`);
    } else {
      setPromoteError('Yüksəltmə zamanı xəta baş verdi.');
    }
    throw err; // PromoteModal-ın öz "loading" state-i düzgün sıfırlansın deyə
  }
};
```

- [ ] **Step 2: Hər elan kartına "Yüksəlt" düyməsi əlavə et**

`cardActions` div-inin içinə (mövcud "Redaktə et"/"Sil" düymələrinin yanına):

```tsx
<button
  className={styles.promoteBtn}
  onClick={() => setPromotingListing(listing)}
>
  ↑ Yüksəlt
</button>
```

Komponentin JSX-inin sonuna (bağlanan `</div>`-dən əvvəl):

```tsx
{promotingListing && (
  <PromoteModal
    onClose={() => setPromotingListing(null)}
    onConfirm={handlePromote}
  />
)}
```

- [ ] **Step 3: `PromoteModal`-ın `user.balans`-a ehtiyacını real balansla təmin et**

`PromoteModal` hazırda `useAuth()`-dan (mock context) `user.balans` oxuyur — bu, real şəxs sessiyası ilə uyğun deyil. Bu addımda `PromoteModal`-a opsional `balans`/`onInsufficientBalance` prop-ları əlavə et ki, çağıran səhifə real balansı ötürə bilsin:

`src/components/PromoteModal.tsx`-i belə dəyiş:

```tsx
interface PromoteModalProps {
  onClose: () => void;
  onConfirm: (tier: PromoTier) => Promise<void>;
  balans: number; // artıq useAuth()-dan deyil, çağıran ötürür
}

export default function PromoteModal({ onClose, onConfirm, balans }: PromoteModalProps) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<PromoTier | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedPrice = selected ? PROMO_PRICES[selected] : 0;
  const insufficientBalance = selected !== null && balans < selectedPrice;

  const handleConfirm = async () => {
    if (!selected || insufficientBalance) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await onConfirm(selected);
      onClose();
    } catch {
      setErrorMessage('Yüksəltmə zamanı xəta baş verdi.');
    } finally {
      setLoading(false);
    }
  };
  // ...qalan JSX dəyişmir, `user.balans` yerinə `balans` istifadə olunur...
```

(`if (!user) return null;` sətri silinir — bu artıq mock auth-a bağlı deyil; `useAuth` importu da silinir.)

Mock `ListingDetail.tsx`-in `PromoteModal` çağırışını da yeni prop-a uyğunlaşdır — `grep -n "PromoteModal" src/pages/ListingDetail.tsx` ilə tap, `balans={user.balans}` əlavə et (bu fayl artıq `user`-i `useAuth()`-dan alır, dəyişməz qalır).

`getMyListings()`/`getMyShopProducts()` balansı qaytarmır (bu plan geriyə uyğunluğu qorumaq üçün "mənim elanlarım" cavabına yeni sahə əlavə etmir — bax Global Constraints). Ona görə `KabinetElanlarim.tsx`/`MyShop.tsx` modal-a real balansı ÖNCƏDƏN göstərə bilmir — `balans` prop-unu `Infinity` keçir (frontend əvvəlcədən bloklamır), əsl yoxlama backend-in `402` cavabında baş verir, nəticə `InsufficientBalanceError` kimi `handlePromote`-da tutulub `promoteError`-a yazılır:

```tsx
<PromoteModal
  onClose={() => setPromotingListing(null)}
  onConfirm={handlePromote}
  balans={Infinity}
/>
```

`promoteError` state-i modal bağlandıqdan sonra səhifədə (məs. `error` mesajının olduğu yerdə) göstərilir:

```tsx
{promoteError && <p className={styles.empty}>{promoteError}</p>}
```

- [ ] **Step 4: `KabinetElanlarim.module.css`-ə `.promoteBtn` sinifini əlavə et**

Mövcud `.editBtn`/`.adBtn`-in yanına, oxşar stilistika ilə:

```css
.promoteBtn {
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
}

.promoteBtn:hover {
  border-color: var(--accent);
}
```

- [ ] **Step 5: Eyni 4 addımı `MyShop.tsx`/`MyShop.module.css`-də təkrarla**

`promoteShopListing`/`InsufficientBalanceError`-u `../../api/shop` və `../../api/auth`-dan import et, `promotingProduct`/`promoteError` state-ləri, hər məhsul kartına "Yüksəlt" düyməsi, `PromoteModal balans={Infinity}` inteqrasiyası — Step 1-4-dəki eyni forma, `listing`/`UserListing` yerinə `product`/`ShopProduct` ilə.

- [ ] **Step 6: `npx tsc -b --noEmit` və `npm run build`**

```bash
cd /Users/frontend/workspace/me-github/autopulse && npx tsc -b --noEmit && npm run build
```

Gözlənilən: PASS.

- [ ] **Step 7: Korrupsiya scan**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/kabinet/KabinetElanlarim.tsx src/pages/shop/MyShop.tsx src/components/PromoteModal.tsx src/pages/ListingDetail.tsx
```

Gözlənilən: boş.

- [ ] **Step 8: Commit**

```bash
git add src/pages/kabinet/KabinetElanlarim.tsx src/pages/kabinet/KabinetElanlarim.module.css \
        src/pages/shop/MyShop.tsx src/pages/shop/MyShop.module.css \
        src/components/PromoteModal.tsx src/pages/ListingDetail.tsx
git commit -m "feat(frontend): wire real promote flow into KabinetElanlarim and MyShop"
```

---

## Task 12: `RealListingDetail.tsx`-ə promote kartı (yalnız sahib üçün aktiv)

**Files:**
- Modify: `src/pages/RealListingDetail.tsx`
- Modify: `src/pages/RealListingDetail.module.css`

**Interfaces:**
- Consumes: Task 9-un `ApiListing.vipTier`, Task 10-un `promoteRealUserListing`/`promoteShopListing`, mövcud `getMyListings()`/`getMyShopProducts()`.
- Produces: ictimai elan detalı səhifəsində promote kartı — yalnız baxan şəxs bu elanın sahibi olduqda aktiv/görünən.

- [ ] **Step 1: Sahiblik yoxlama state-i əlavə et**

```typescript
import { getMyListings, promoteRealUserListing, InsufficientBalanceError } from '../api/auth';
import { getMyShopProducts, promoteShopListing } from '../api/shop';
import PromoteModal from '../components/PromoteModal';
```

`RealListingDetail` funksiyasının içinə:

```typescript
const [isOwner, setIsOwner] = useState(false);
const [promoteOpen, setPromoteOpen] = useState(false);
const [promoteError, setPromoteError] = useState<string | null>(null);
```

- [ ] **Step 2: `useEffect`-in içində, elan yükləndikdən sonra sahiblik yoxlaması apar**

Mövcud `useEffect`-in `detail` uğurla alındıqdan sonrakı hissəsinə əlavə et (sessiyasız istifadəçilər üçün hər iki çağırış səssizcə uğursuz olur, `isOwner` `false` qalır):

```typescript
if (source === 'shop') {
  try {
    const myProducts = await getMyShopProducts();
    setIsOwner(myProducts.some((p) => p.id === numericId));
  } catch {
    setIsOwner(false);
  }
} else {
  try {
    const myListings = await getMyListings();
    setIsOwner(myListings.some((l) => l.id === numericId));
  } catch {
    setIsOwner(false);
  }
}
```

- [ ] **Step 3: Sidebar-a promote kartını əlavə et**

`contactCard`-ın sonuna (mövcud `btnCall`/`btnMessage`-dan sonra):

```tsx
{isOwner && (
  <>
    <div className={styles.cardDivider} />
    <div className={styles.promoGrid}>
      <button className={styles.promoTile} onClick={() => setPromoteOpen(true)}>
        <span className={styles.promoIcon}>↑</span>
        <span>İrəli çək</span>
        <span className={styles.promoPrice}>3 AZN</span>
      </button>
      <button className={styles.promoTile} onClick={() => setPromoteOpen(true)}>
        <span className={styles.promoIcon}>♦</span>
        <span>VIP</span>
        <span className={styles.promoPrice}>5 AZN</span>
      </button>
      <button className={styles.promoTile} onClick={() => setPromoteOpen(true)}>
        <span className={styles.promoIcon}>♛</span>
        <span>Premium</span>
        <span className={styles.promoPrice}>7 AZN</span>
      </button>
    </div>
    {promoteError && <p className={styles.error}>{promoteError}</p>}
  </>
)}
```

- [ ] **Step 4: `PromoteModal`-ı render et, `handlePromote`-u `source`-a görə düzgün funksiyaya bağla**

```typescript
const handlePromote = async (tier: 'ireli_cek' | 'vip' | 'premium_vip') => {
  if (!id) return;
  const [source, numericIdStr] = id.split('-');
  const numericId = Number(numericIdStr);
  try {
    if (source === 'shop') {
      await promoteShopListing(numericId, tier);
    } else {
      await promoteRealUserListing(numericId, tier);
    }
    setPromoteError(null);
    // Elanı yenidən yüklə ki, yeni vipTier göstərilsin
    const detail = await getRealListingById(source as 'shop' | 'user', numericId);
    if (detail) setListing(apiListingToMockShape(detail));
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      setPromoteError(`Balansınız kifayət etmir (${err.required} AZN lazımdır).`);
    } else {
      setPromoteError('Yüksəltmə zamanı xəta baş verdi.');
    }
    throw err;
  }
};
```

JSX-in sonuna:

```tsx
{promoteOpen && (
  <PromoteModal
    onClose={() => setPromoteOpen(false)}
    onConfirm={handlePromote}
    balans={Infinity}
  />
)}
```

- [ ] **Step 5: `apiListingToMockShape`-də `vipTier: l.vipTier` istifadə et (indi `'standart'` hardcode)**

```typescript
vipTier: l.vipTier,
```

- [ ] **Step 6: `RealListingDetail.module.css`-ə `.promoGrid`/`.promoTile`/`.promoIcon`/`.promoPrice` siniflərini əlavə et**

`ListingDetail.module.css`-dəki eyni sinifləri köçür (mövcud `.promoGrid`/`.promoTile`/`.promoIcon`/`.promoPrice` — əvvəlki fazada oxunmuşdu):

```css
.promoGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.promoTile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: var(--space-3) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
}

.promoTile:hover {
  border-color: var(--accent);
  box-shadow: none;
}

.promoIcon {
  font-size: 16px;
  color: var(--gold);
}

.promoPrice {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
}
```

- [ ] **Step 7: `npx tsc -b --noEmit` və `npm run build`**

```bash
npx tsc -b --noEmit && npm run build
```

Gözlənilən: PASS.

- [ ] **Step 8: Korrupsiya scan**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/RealListingDetail.tsx src/pages/RealListingDetail.module.css
```

Gözlənilən: boş.

- [ ] **Step 9: Commit**

```bash
git add src/pages/RealListingDetail.tsx src/pages/RealListingDetail.module.css
git commit -m "feat(frontend): show promote card on RealListingDetail for the listing's owner"
```

---

## Task 13: Frontend deploy + tam canlı doğrulama

**Files:** (kod dəyişikliyi yoxdur — yalnız deploy + manual doğrulama)

**Interfaces:**
- Consumes: Task 9-12-nin bütün dəyişiklikləri.

- [ ] **Step 1: Deploy et**

```bash
git push origin main
bash deploy/deploy.sh
```

- [ ] **Step 2: `KabinetElanlarim`-də promote-u test et**

Test istifadəçisinə (`+994501112233`, əvvəlki fazadan) balans əlavə et, real elanına giriş edib "Yüksəlt" düyməsini test et.

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "PGPASSWORD='z8vsYpTz9GjEwdKSwtYWK2bvTvXUPUs' psql -h localhost -U avtopulse -d avtopulse -c \"UPDATE avto444.user SET balans = 20 WHERE phone = '+994501112233'\""
```

Brauzerdə `/kabinet/elanlarim`-ə OTP (`1234`) ilə giriş et, "Yüksəlt" düyməsinə klik, VIP seç, təsdiqlə — uğurlu mesaj və balansın azaldığını doğrula.

- [ ] **Step 3: `MyShop`-da promote-u test et**

`avto444`/`avto444pass` ilə giriş et, balans əlavə et, bir məhsulu VIP-ə yüksəlt.

- [ ] **Step 4: `RealListingDetail`-də sahib kimi promote kartının göründüyünü, sahib olmayanda görünmədiyini doğrula**

Sahib kimi giriş etmiş halda `/elan/shop-{id}` (öz elanı) aç — promote kartı görünməli. Çıxış edib (və ya fərqli brauzerdə) eyni URL-i aç — promote kartı görünməməli.

- [ ] **Step 5: Kifayət etməyən balansla xəta mesajının göründüyünü doğrula**

Balansı azaldıb (`UPDATE ... SET balans = 0`), promote cəhdi et, "Balansınız kifayət etmir" mesajının UI-da göründüyünü təsdiqlə.

- [ ] **Step 6: Test datasını təmizlə**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "PGPASSWORD='z8vsYpTz9GjEwdKSwtYWK2bvTvXUPUs' psql -h localhost -U avtopulse -d avtopulse -c \"UPDATE avto444.user SET balans = 0 WHERE phone = '+994501112233'; UPDATE avto444.shop SET balans = 0 WHERE name = 'avto444'\""
```

Test zamanı `vip_tier`-ə dəyişdirilmiş real elanları (istəyə görə) `standart`-a geri qaytar.

- [ ] **Step 7: Nəticəni istifadəçiyə raportla**

Test edilən elanların linklərini paylaş, hər addımın gözlənilən nəticəyə uyğun olduğunu qeyd et.
