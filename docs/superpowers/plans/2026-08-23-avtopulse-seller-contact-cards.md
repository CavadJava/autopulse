# Fərdi/Biznes Satıcı Əlaqə Kartları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `RealListingDetail.tsx`-in tək, sadə `contactCard`-ını iki zəngin, source-a görə seçilən komponentə (`IndividualSellerCard`/`BusinessSellerCard`) bölmək — USD qiymət, mağaza loqosu/ünvanı/iş saatları/əlaqə şəxsi/elan sayı, üzvlük tarixi daxil olmaqla.

**Architecture:** Backend-ə yeni sahələr (`qiymet_usd`, `address`, `contact_name`, `created_at`), `listings` public API-sinə bu sahələr, yeni `PUT /me` shop-profil endpoint-i. Frontend-də iki yeni, məqsədyönlü komponent, `RealListingDetail.tsx` `source`-a görə birini render edir, mövcud `isOwner`/promote state-i dəyişmədən hər ikisinə ötürülür.

**Tech Stack:** Go/chi/pgx (backend), React/TypeScript (frontend).

## Global Constraints

- "Mesaj yaz" düyməsi hər iki yeni komponentdə hazırkı kimi funksionalsız qalır (heç yerə aparmır) — real messaging sistemi bu planın xaricindədir.
- `qiymet_usd` satıcının özü tərəfindən əl ilə daxil edilir, avtomatik məzənnə hesablaması yoxdur.
- Nömrə-varsa-göstər davranışı: `satıcıZəng` boşdursa telefon düyməsi tamamilə gizlədilir (mövcud davranış, dəyişmir).
- "Elan sayı" = mağazanın `status='saytda'` olan məhsullarının sayı.
- `created_at` mövcud sətirlər üçün migrasiya anını alır (real qeydiyyat tarixi deyil) — bu qəbul edilib, düzəliş tələb olunmur.
- Promote kartı (İrəliCek/VIP/Premium) yalnız `isOwner === true` olduqda görünür — mövcud məntiq, hər iki yeni komponentə eyni şəkildə köçürülür.
- Mövcud 12+ real elana (yeni sahələr boş/defolt) toxunulmur, xəta vermədən göstərilməlidir.
- Deploy axını dəyişməz: backend = rsync + `go build` serverdə + `systemctl restart avtopulse-backend` (migrasiya faylı avtomatik tətbiq olunur, əl ilə `psql -f` lazım deyil); frontend = `git push origin main` + `bash deploy/deploy.sh`.

---

## Task 1: DB migrasiyası — `qiymet_usd`, `address`, `contact_name`, `created_at`

**Files:**
- Create: `avtopulse-backend/migrations/0010_seller_contact_fields.sql`

**Interfaces:**
- Produces: `avto444.shop.address`, `.contact_name`, `.created_at`; `avto444.user.created_at`; `avto444.shop_products.qiymet_usd`; `avto444.user_products.qiymet_usd` — bütün sonrakı Go dəyişikliklər bunlardan asılıdır.

- [ ] **Step 1: Migrasiya faylını yaz**

```sql
ALTER TABLE avto444.shop ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE avto444.shop ADD COLUMN contact_name TEXT NOT NULL DEFAULT '';
ALTER TABLE avto444.shop ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE avto444.user ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE avto444.shop_products ADD COLUMN qiymet_usd INT NOT NULL DEFAULT 0;
ALTER TABLE avto444.user_products ADD COLUMN qiymet_usd INT NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Commit**

```bash
git add avtopulse-backend/migrations/0010_seller_contact_fields.sql
git commit -m "feat(backend): add address/contact_name/created_at/qiymet_usd columns for seller contact cards"
```

(Server-side tətbiqi Task 8-də, backend deploy-un bir hissəsi kimi — backend-in öz migrasiya runner-i rsync+restart-dan sonra avtomatik tətbiq edəcək.)

---

## Task 2: Go struct genişlənməsi — `Shop`/`User`/`Product`-a yeni sahələr

**Files:**
- Modify: `avtopulse-backend/internal/shop/model.go`
- Modify: `avtopulse-backend/internal/user/model.go`

**Interfaces:**
- Consumes: Task 1-in yeni sütunları.
- Produces: `Shop.Address`, `.ContactName`, `.CreatedAt`; `User.CreatedAt`; `Product.QiymetUSD` (hər iki paketdə) — Task 3/4-ün repository dəyişiklikləri bunları scan edəcək.

- [ ] **Step 1: `shop/model.go`-ya sahələr əlavə et**

```go
package shop

import (
	"encoding/json"
	"time"
)

type Shop struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	CustomerID  int64     `json:"customerId"`
	Title       string    `json:"title"`
	Details     string    `json:"details"`
	WorkTimes   string    `json:"workTimes"`
	LogoURL     string    `json:"logoUrl"`
	Email       string    `json:"email"`
	Balans      int       `json:"balans"`
	Address     string    `json:"address"`
	ContactName string    `json:"contactName"`
	CreatedAt   time.Time `json:"createdAt"`
}
```

`Product` struct-ına (mövcud `DetailsJSON`/`ViewCount`/`VipTier`-in yanına):

```go
	QiymetUSD int `json:"qiymetUsd"`
```

- [ ] **Step 2: `user/model.go`-ya eyni sahələri əlavə et**

```go
package user

import (
	"encoding/json"
	"time"
)

type User struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Phone     string    `json:"phone"`
	Balans    int       `json:"balans"`
	CreatedAt time.Time `json:"createdAt"`
}
```

`Product` struct-ına: `QiymetUSD int json:"qiymetUsd"`.

- [ ] **Step 2: `go build` ilə kompilyasiyanı yoxla**

```bash
cd avtopulse-backend && go build ./... 2>&1 | head -40
```

Gözlənilən: repository/handler-lərdə `Scan`/literal xətaları (sonrakı tasklarda düzələcək) — model paketlərinin özü sintaktik cəhətdən düzgün olmalıdır.

- [ ] **Step 3: Commit**

```bash
git add avtopulse-backend/internal/shop/model.go avtopulse-backend/internal/user/model.go
git commit -m "feat(backend): add Address/ContactName/CreatedAt/QiymetUSD fields to shop and user models"
```

---

## Task 3: `shop` repository — yeni sahələri oxu/yaz, `UpdateShopProfile`

**Files:**
- Modify: `avtopulse-backend/internal/shop/repository.go`
- Modify: `avtopulse-backend/internal/shop/handler_test.go`

**Interfaces:**
- Consumes: Task 2-nin `Shop.Address`/`.ContactName`/`.CreatedAt`, `Product.QiymetUSD`.
- Produces: `Repository`-ə yeni metod `UpdateShopProfile(ctx, shopID int64, address, contactName string) error`; `CreateProductInput.QiymetUSD` yazma; `GetShopByID`/`GetShopByName`/`GetShopByEmail`/`ListProducts`/`ListAllProducts`/`ListActiveProducts` yeni sahələri oxuyur — Task 5/6 bunu istifadə edəcək.

- [ ] **Step 1: `GetShopByID`/`GetShopByName`/`GetShopByEmail`-i yeni sahələri oxuyacaq şəkildə dəyiş**

Hər üçündə `SELECT`-ə `, address, contact_name, created_at` əlavə et, `Scan`-a `&s.Address, &s.ContactName, &s.CreatedAt` əlavə et. Nümunə (`GetShopByID`):

```go
func (r *pgRepository) GetShopByID(ctx context.Context, id int64) (*Shop, error) {
	var s Shop
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, customer_id, title, COALESCE(details, ''), COALESCE(work_times, ''), COALESCE(logo_url, ''), email, balans,
		        address, contact_name, created_at
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
```

Eyni forma `GetShopByName`/`GetShopByEmail`-də (yalnız `WHERE` şərti dəyişir).

- [ ] **Step 2: `ListProducts`/`ListAllProducts`/`ListActiveProducts`-a `qiymet_usd` əlavə et**

Hər üçündə `SELECT`-ə `, qiymet_usd` (mövcud `details_json, view_count, vip_tier`-in yanına), `Scan`-a `&p.QiymetUSD` əlavə et.

- [ ] **Step 3: `CreateProduct`-a `QiymetUSD`-i saxlama əlavə et**

```go
	var id int64
	err = r.pool.QueryRow(ctx,
		`INSERT INTO avto444.shop_products (name, title, details, marka, model, il, qiymet, yurus, yanacaq, ban, shop_id, details_json, qiymet_usd)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		 RETURNING id`,
		input.Name, input.Title, input.Details, input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, shopID, detailsJSON, input.QiymetUSD,
	).Scan(&id)
```

Qaytarılan `Product{}` literalına `QiymetUSD: input.QiymetUSD,` əlavə et.

`CreateProductInput`-a (`model.go`-da) `QiymetUSD int json:"qiymetUsd"` sahəsi əlavə et (Task 2-də edilmədisə).

- [ ] **Step 4: `UpdateProduct`-a `qiymet_usd` yeniləməsi əlavə et**

```go
	err := r.pool.QueryRow(ctx,
		`UPDATE avto444.shop_products
		 SET name = $1, title = $2, details = $3, marka = $4, model = $5, il = $6, qiymet = $7, yurus = $8, yanacaq = $9, ban = $10,
		     details_json = details_json || $11::jsonb, qiymet_usd = $12
		 WHERE id = $13
		 RETURNING status, vip_tier`,
		input.Name, input.Title, input.Details, input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban,
		nonSellerFields(input.DetailsJSON), input.QiymetUSD, productID,
	).Scan(&status, &vipTier)
```

Qaytarılan `Product{}` literalına `QiymetUSD: input.QiymetUSD,` əlavə et.

- [ ] **Step 5: `UpdateShopProfile` metodunu interfeysə və implementasiyaya əlavə et**

`Repository` interfeysinə:

```go
UpdateShopProfile(ctx context.Context, shopID int64, address, contactName string) error
```

İmplementasiya:

```go
func (r *pgRepository) UpdateShopProfile(ctx context.Context, shopID int64, address, contactName string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE avto444.shop SET address = $1, contact_name = $2 WHERE id = $3`,
		address, contactName, shopID,
	)
	return err
}
```

- [ ] **Step 6: `handler_test.go`-dakı fake repo-ya `UpdateShopProfile` stub-ı əlavə et**

```go
func (f *fakeRepo) UpdateShopProfile(ctx context.Context, shopID int64, address, contactName string) error {
	return nil
}
```

- [ ] **Step 7: Testləri işə sal**

```bash
cd avtopulse-backend && go test ./internal/shop/... -v
```

Gözlənilən: PASS.

- [ ] **Step 8: Commit**

```bash
git add avtopulse-backend/internal/shop/repository.go avtopulse-backend/internal/shop/handler_test.go
git commit -m "feat(backend): shop repository reads/writes address, contact_name, created_at, qiymet_usd"
```

---

## Task 4: `user` repository — yeni sahələri oxu/yaz

**Files:**
- Modify: `avtopulse-backend/internal/user/repository.go`

**Interfaces:**
- Consumes: Task 2-nin `User.CreatedAt`, `Product.QiymetUSD`.
- Produces: `FindOrCreateByPhone` `created_at`-ı oxuyur; `CreateProductInput.QiymetUSD` yazma; `ListMyProducts`/`ListPendingProducts`/`ListActiveProducts` yeni sahəni oxuyur.

- [ ] **Step 1: `FindOrCreateByPhone`-u `created_at`-ı oxuyacaq şəkildə dəyiş**

```go
func (r *pgRepository) FindOrCreateByPhone(ctx context.Context, phone string) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, phone, created_at FROM avto444.user WHERE phone = $1`,
		phone,
	).Scan(&u.ID, &u.Name, &u.Phone, &u.CreatedAt)
	if err == nil {
		return &u, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	err = r.pool.QueryRow(ctx,
		`INSERT INTO avto444.user (name, phone) VALUES ('', $1) RETURNING id, name, phone, created_at`,
		phone,
	).Scan(&u.ID, &u.Name, &u.Phone, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}
```

- [ ] **Step 2: `CreateProduct`-da `u.CreatedAt`-a ehtiyac yoxdur, amma `SELECT id, name, phone FROM avto444.user`-ə `created_at` əlavə etmə lazım deyil (yalnız `satıcıAd`/`satıcıZəng` üçün `Name`/`Phone` istifadə olunur) — bu sorğuya toxunma**

- [ ] **Step 3: `ListMyProducts`/`ListPendingProducts`/`ListActiveProducts`-a `qiymet_usd` əlavə et**

Hər üçündə `SELECT`-ə `, qiymet_usd` (mövcud `details_json, view_count, vip_tier`-in yanına), `Scan`-a `&p.QiymetUSD` əlavə et.

- [ ] **Step 4: `CreateProduct`-a `qiymet_usd` yazma əlavə et**

```go
	var id int64
	err = r.pool.QueryRow(ctx,
		`INSERT INTO avto444.user_products (user_id, marka, model, il, qiymet, yurus, yanacaq, ban, title, details, status, details_json, qiymet_usd)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'gozlemede', $11, $12)
		 RETURNING id`,
		userID, input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, input.Title, input.Details, detailsJSON, input.QiymetUSD,
	).Scan(&id)
```

Qaytarılan `Product{}` literalına `QiymetUSD: input.QiymetUSD,` əlavə et. `CreateProductInput`-a `QiymetUSD int json:"qiymetUsd"` sahəsi əlavə et (Task 2-də edilmədisə).

- [ ] **Step 5: `UpdateProduct`-a `qiymet_usd` yeniləməsi əlavə et**

```go
	err = r.pool.QueryRow(ctx,
		`UPDATE avto444.user_products
		 SET marka = $1, model = $2, il = $3, qiymet = $4, yurus = $5, yanacaq = $6, ban = $7, title = $8, details = $9, status = $10, updated_at = now(),
		     details_json = details_json || $11::jsonb, qiymet_usd = $12
		 WHERE id = $13
		 RETURNING user_id, vip_tier`,
		input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, input.Title, input.Details, newStatus,
		nonSellerFields(input.DetailsJSON), input.QiymetUSD, productID,
	).Scan(&userID, &vipTier)
```

Qaytarılan `Product{}` literalına `QiymetUSD: input.QiymetUSD,` əlavə et.

- [ ] **Step 6: Testləri işə sal**

```bash
go test ./internal/user/... -v
```

Gözlənilən: PASS.

- [ ] **Step 7: Commit**

```bash
git add avtopulse-backend/internal/user/repository.go
git commit -m "feat(backend): user repository reads/writes created_at, qiymet_usd"
```

---

## Task 5: `PUT /me` shop-profil endpoint-i (`address`/`contactName`)

**Files:**
- Modify: `avtopulse-backend/internal/auth/handler.go`
- Modify: `avtopulse-backend/internal/auth/handler_test.go`
- Modify: `avtopulse-backend/cmd/server/main.go`

**Interfaces:**
- Consumes: Task 3-ün `shop.Repository.UpdateShopProfile`.
- Produces: `PUT /api/shops/me` — Task 10-un frontend `updateShopProfile` funksiyası bunu çağıracaq.

- [ ] **Step 1: `updateShopProfileRequest` tipi və handler-i əlavə et**

`RestoreProduct` handler-inin yanına (və ya `MeProducts`-dan sonra) əlavə et:

```go
type updateShopProfileRequest struct {
	Address     string `json:"address"`
	ContactName string `json:"contactName"`
}

// UpdateShopProfile godoc
// @Summary      Update the logged-in shop's address and contact person name
// @Description  Requires a valid shop_session cookie.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body  updateShopProfileRequest  true  "Address and contact name"
// @Success      200   {object}  map[string]bool
// @Failure      400   {string}  string  "invalid request body"
// @Failure      401   {string}  string  "unauthorized"
// @Failure      500   {string}  string  "internal error"
// @Router       /me [put]
func (h *authHandlers) UpdateShopProfile(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var body updateShopProfileRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.shopRepo.UpdateShopProfile(req.Context(), shopID, body.Address, body.ContactName); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"updated": true})
}
```

- [ ] **Step 2: `NewHandler`-in iç router-inə route əlavə et**

```go
r.Put("/me", h.UpdateShopProfile)
```

(mövcud `r.Get("/me/products", ...)` sətrindən əvvəl və ya sonra, `handler.go`-nun başındakı route siyahısında.)

- [ ] **Step 3: `cmd/server/main.go`-da mount et**

`grep -n "api/shops/me/products\"" avtopulse-backend/cmd/server/main.go` ilə mövcud `r.Get("/api/shops/me/products", ...)` sətrini tap, ondan əvvəl əlavə et:

```go
r.Put("/api/shops/me", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
})
```

- [ ] **Step 4: `handler_test.go`-da yeni testlər yaz**

```go
func TestUpdateShopProfile_Success(t *testing.T) {
	repo := newFakeShopRepo()
	sessions := newFakeSessionStore()
	h := NewHandler(repo, sessions, &fakeStorage{})

	token := "test-token"
	sessions.sessions[token] = 1

	req := httptest.NewRequest(http.MethodPut, "/me", strings.NewReader(`{"address":"Bakı, Nizami 10","contactName":"Sənan Vəliyev"}`))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateShopProfile_NoCookie(t *testing.T) {
	repo := newFakeShopRepo()
	sessions := newFakeSessionStore()
	h := NewHandler(repo, sessions, &fakeStorage{})

	req := httptest.NewRequest(http.MethodPut, "/me", strings.NewReader(`{"address":"x"}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}
```

(Mövcud test faylındakı `newFakeShopRepo`/`newFakeSessionStore`/`fakeStorage`/`cookieName` adlarını `grep -n "func newFakeShopRepo\|func newFakeSessionStore\|type fakeStorage\|cookieName" avtopulse-backend/internal/auth/handler_test.go avtopulse-backend/internal/auth/handler.go` ilə təsdiqləyib bu adlara uyğunlaşdır.)

- [ ] **Step 5: `go build` və testləri işə sal**

```bash
go build ./... && go test ./internal/auth/... -v
```

Gözlənilən: PASS.

- [ ] **Step 6: Commit**

```bash
git add avtopulse-backend/internal/auth/handler.go avtopulse-backend/internal/auth/handler_test.go avtopulse-backend/cmd/server/main.go
git commit -m "feat(backend): add PUT /me endpoint for shop address/contact name"
```

---

## Task 6: `listings` paketinə yeni sahələr

**Files:**
- Modify: `avtopulse-backend/internal/listings/model.go`
- Modify: `avtopulse-backend/internal/listings/handler.go`

**Interfaces:**
- Consumes: Task 3/4-ün `Shop.Address`/`.ContactName`/`.CreatedAt`, `User.CreatedAt`, `Product.QiymetUSD`; Task 3-ün `shop.Repository.ListActiveProducts` (elan sayı hesablamaq üçün).
- Produces: `PublicListing.QiymetUSD`, `.SellerCreatedAt`, `.SellerContactName`, `.SellerWorkTimes`, `.SellerAddress`, `.SellerActiveListingCount` — Task 11-in frontend `ApiListing` tipi bunları güdəcək.

- [ ] **Step 1: `PublicListing`-ə sahələr əlavə et**

```go
type PublicListing struct {
	Source      string          `json:"source"`
	ID          int64           `json:"id"`
	Marka       string          `json:"marka"`
	Model       string          `json:"model"`
	Il          int             `json:"il"`
	Qiymet      int             `json:"qiymet"`
	QiymetUSD   int             `json:"qiymetUsd"`
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

	SellerCreatedAt          string `json:"sellerCreatedAt"`
	SellerContactName        string `json:"sellerContactName,omitempty"`
	SellerWorkTimes          string `json:"sellerWorkTimes,omitempty"`
	SellerAddress            string `json:"sellerAddress,omitempty"`
	SellerLogoURL            string `json:"sellerLogoUrl,omitempty"`
	SellerActiveListingCount int    `json:"sellerActiveListingCount,omitempty"`
}
```

`"time"` importunun lazım olub-olmadığını yoxla (RFC3339 stringi handler-də formatlanacaq, `model.go`-da `time` importu lazım deyil, çünki sahə `string`).

- [ ] **Step 2: `PublicListings`/`PublicListingDetail`-in shop qollarında əlavə sahələri doldur**

Hər iki shop qolunda (list və detail), `shopProducts` alındıqdan sonra, mağazanın aktiv elan sayını bir dəfə hesablamaq üçün (list halında hər elan üçün təkrar sorğu getməsin deyə) — `PublicListings`-in shop loop-undan əvvəl:

```go
shopActiveCounts := map[string]int{} // shop name → count
for _, p := range shopProducts {
	shopActiveCounts[p.ShopName]++
}
```

(Bu, sadəcə `shopProducts`-ın özündən hesablanır — əlavə sorğu lazım deyil, çünki `ListActiveProducts` onsuz da yalnız `status='saytda'` olanları qaytarır.)

Hər iki `PublicListing{}` literalına (list və detail, shop qolu) əlavə et:

```go
			QiymetUSD: p.QiymetUSD,
			SellerCreatedAt: p.CreatedAt.UTC().Format(time.RFC3339),
```

Bunun üçün shop məhsulunun sahibinin `Shop`-unu tapmaq lazımdır — `ProductWithShopName` özü `Shop.CreatedAt`-ı daşımır (yalnız `ShopName`), ona görə `h.shopRepo.GetShopByName(req.Context(), p.ShopName)` çağırışı lazımdır. Bu, N+1 sorğu yaradır — `PublicListings` üçün qəbul edilə bilər (mövcud kodda onsuz da hər elanın şəkilləri ayrıca `listProductImages` çağırışı ilə yüklənir, eyni pattern).

Tam nümunə (`PublicListings`-in shop loop-u):

```go
	for _, p := range shopProducts {
		images := make([]ImageOut, len(p.Images))
		for i, img := range p.Images {
			images[i] = toImageOut(img.MinioURL, img.S3URL, img.Sira, img.Kind)
		}
		shopInfo, err := h.shopRepo.GetShopByName(req.Context(), p.ShopName)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		out = append(out, PublicListing{
			Source: "shop", ID: p.ID, Marka: p.Marka, Model: p.Model, Il: p.Il,
			Qiymet: p.Qiymet, QiymetUSD: p.QiymetUSD, Yurus: p.Yurus, Yanacaq: p.Yanacaq, Ban: p.Ban,
			Title: p.Title, Details: p.Details, Images: images,
			SellerType: "diler", SellerName: p.ShopName,
			DetailsJSON: p.DetailsJSON, ViewCount: p.ViewCount, VipTier: p.VipTier,
			SellerCreatedAt: shopInfo.CreatedAt.UTC().Format(time.RFC3339),
			SellerContactName: shopInfo.ContactName, SellerWorkTimes: shopInfo.WorkTimes,
			SellerAddress: shopInfo.Address, SellerLogoURL: shopInfo.LogoURL,
			SellerActiveListingCount: shopActiveCounts[p.ShopName],
		})
	}
```

Eyni forma `PublicListingDetail`-in shop qolunda (`shopInfo` tapıldıqdan sonra, `_ = h.shopRepo.IncrementViewCount(...)` sətrindən sonra) — burada `shopActiveCounts` lazım deyil, çünki tək elan göstərilir; `sellerActiveListingCount` üçün `h.shopRepo.ListProducts(req.Context(), shopInfo.ID, "saytda")`-nin uzunluğu istifadə olunur:

```go
			activeProducts, err := h.shopRepo.ListProducts(req.Context(), shopInfo.ID, "saytda")
			if err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, PublicListing{
				// ...mövcud sahələr...
				SellerCreatedAt: shopInfo.CreatedAt.UTC().Format(time.RFC3339),
				SellerContactName: shopInfo.ContactName, SellerWorkTimes: shopInfo.WorkTimes,
				SellerAddress: shopInfo.Address, SellerLogoURL: shopInfo.LogoURL,
				SellerActiveListingCount: len(activeProducts),
			})
```

- [ ] **Step 3: `PublicListings`/`PublicListingDetail`-in user qollarında `qiymetUsd`/`sellerCreatedAt`-ı doldur**

User tərəf üçün `Shop`-a bənzər ayrı sorğu lazım deyil — `p.CreatedAt` birbaşa `user.Product`-da yoxdur (`user.Product`-da `CreatedAt` sahəsi Task 2-də əlavə edilmədi, çünki üzvlük tarixi `User.CreatedAt`-dandır, məhsulun özündən deyil). Ona görə user qolunda `userRepo.FindOrCreateByPhone` istifadə edilə bilməz (telefon lazımdır, yalnız `userID` var) — bunun əvəzinə `user.Repository`-yə əlavə heç bir yeni metod yaratmadan, `p.UserID`-dən istifadə edən sadə bir sorğu üçün user paketinə növbəti addımda (Step 4) kiçik bir `GetUserByID` metodu əlavə olunur.

- [ ] **Step 4: `user.Repository`-yə `GetUserByID` metodu əlavə et**

`avtopulse-backend/internal/user/repository.go`-da:

```go
GetUserByID(ctx context.Context, id int64) (*User, error)
```

```go
func (r *pgRepository) GetUserByID(ctx context.Context, id int64) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx, `SELECT id, name, phone, created_at FROM avto444.user WHERE id = $1`, id).Scan(&u.ID, &u.Name, &u.Phone, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &u, err
}
```

Bu metodu `Repository` interfeysinə də əlavə et. `internal/user/handler_test.go`/`repository_test.go`/`internal/admin/handler_test.go`/`internal/listings/handler_test.go`-dakı bütün fake-lərə uyğun stub əlavə et (əvvəlki fazalarda olduğu kimi geniş footprint — hər yerdə `user.Repository`-ni implementasiya edən fake-lər).

- [ ] **Step 5: `listings/handler.go`-nun user qollarında `qiymetUsd`/`sellerCreatedAt`-ı doldur**

`PublicListings`-in user loop-unda, hər `p` üçün `h.userRepo.GetUserByID(req.Context(), p.UserID)` çağır, `SellerCreatedAt: userInfo.CreatedAt.UTC().Format(time.RFC3339)` əlavə et. `PublicListingDetail`-in user qolunda eyni şəkildə.

`"time"` importunu `handler.go`-nun başına əlavə et.

- [ ] **Step 6: `listings/handler_test.go`-dakı fake-lərə `GetShopByName`/`GetUserByID`-in artıq mövcud olub-olmadığını yoxla, real dəyər qaytaracaq şəkildə yenilə**

`GetShopByName` artıq fake-də mövcuddur (`return nil, nil` qaytarır) — bu, `handler.go`-nun yeni koduna görə nil-pointer səbəb olacaq. Fake-i yenilə ki, test datasına uyğun real bir `*shop.Shop`/`*user.User` qaytarsın:

```go
func (f *fakeShopRepo) GetShopByName(ctx context.Context, name string) (*shop.Shop, error) {
	for _, p := range f.active {
		if p.ShopName == name {
			return &shop.Shop{ID: 1, Name: name, CreatedAt: time.Now()}, nil
		}
	}
	return nil, shop.ErrNotFound
}
```

```go
func (f *fakeUserRepo) GetUserByID(ctx context.Context, id int64) (*user.User, error) {
	return &user.User{ID: id, CreatedAt: time.Now()}, nil
}
```

`"time"` importunu `handler_test.go`-ya əlavə et.

- [ ] **Step 7: Testləri işə sal**

```bash
go test ./internal/listings/... -v
go test ./... 2>&1 | tail -20
```

Gözlənilən: bütün paketlər PASS (Step 4-ün geniş footprint-i digər paketlərdəki fake-ləri də düzəldib).

- [ ] **Step 8: Commit**

```bash
git add avtopulse-backend/internal/listings/ avtopulse-backend/internal/user/repository.go avtopulse-backend/internal/user/repository_test.go avtopulse-backend/internal/user/handler_test.go avtopulse-backend/internal/admin/handler_test.go
git commit -m "feat(backend): expose qiymetUsd/seller createdAt/contactName/workTimes/address/activeListingCount on public listings API"
```

---

## Task 7: `MyShop.tsx`-ə ünvan/əlaqə-şəxsi/USD-qiymət redaktə sahələri

**Files:**
- Modify: `src/api/shop.ts` (`Shop`, `CreateProductInput`, `ShopProduct`, `updateShopProfile`)
- Modify: `src/pages/shop/MyShop.tsx`

**Interfaces:**
- Consumes: Task 5-in `PUT /me` endpoint-i, Task 3-ün `ShopProduct.qiymetUsd`.
- Produces: mağaza öz ünvanını/əlaqə şəxsini redaktə edə bilir, yeni məhsul yaradarkən USD qiymət daxil edə bilir.

- [ ] **Step 1: `src/api/shop.ts`-də `Shop`/`ShopProduct`/`CreateProductInput`-a sahələr əlavə et**

```typescript
export interface Shop {
  id: number;
  name: string;
  customerId: number;
  title: string;
  details: string;
  workTimes: string;
  logoUrl: string;
  address: string;
  contactName: string;
  createdAt: string;
}

export interface ShopProduct {
  // ...mövcud sahələr...
  qiymetUsd: number;
}

export interface CreateProductInput {
  // ...mövcud sahələr...
  qiymetUsd?: number;
}
```

- [ ] **Step 2: `updateShopProfile` funksiyasını əlavə et**

`uploadShopLogo`-nun yanına:

```typescript
export async function updateShopProfile(address: string, contactName: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/shops/me`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, contactName }),
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`updateShopProfile failed: ${res.status}`);
  }
}
```

- [ ] **Step 3: `MyShop.tsx`-də profil redaktə state-i və UI-si əlavə et**

Mövcud logo bölməsinin yanına (`import` sətrinə `updateShopProfile` əlavə et):

```typescript
const [profileAddress, setProfileAddress] = useState('');
const [profileContactName, setProfileContactName] = useState('');
const [profileSaving, setProfileSaving] = useState(false);
const [profileError, setProfileError] = useState<string | null>(null);

const handleProfileSave = async () => {
  setProfileSaving(true);
  setProfileError(null);
  try {
    await updateShopProfile(profileAddress, profileContactName);
  } catch (err) {
    if (err instanceof ShopUnauthorizedError) {
      navigate('/magaza-giris');
      return;
    }
    setProfileError('Profil yenilənərkən xəta baş verdi.');
  } finally {
    setProfileSaving(false);
  }
};
```

JSX-də logo bölməsindən sonra:

```tsx
<div className={styles.logoSection}>
  <div className={styles.logoLabel}>Ünvan və əlaqə şəxsi</div>
  <input
    className={styles.input}
    placeholder="Ünvan"
    value={profileAddress}
    onChange={(e) => setProfileAddress(e.target.value)}
  />
  <input
    className={styles.input}
    placeholder="Əlaqə şəxsinin adı (Ad Soyad)"
    value={profileContactName}
    onChange={(e) => setProfileContactName(e.target.value)}
  />
  <button className={styles.uploadBtn} onClick={handleProfileSave} disabled={profileSaving}>
    {profileSaving ? 'Yadda saxlanılır...' : 'Yadda saxla'}
  </button>
  {profileError && <p className={styles.formError}>{profileError}</p>}
</div>
```

- [ ] **Step 4: Yeni-məhsul və redaktə formlarına USD qiymət sahəsi əlavə et**

`EMPTY_FORM`-a `qiymetUsd: ''` əlavə et. `handleCreateProduct`-ın `createShopProduct({...})` çağırışına `qiymetUsd: form.qiymetUsd ? parseInt(form.qiymetUsd, 10) : 0` əlavə et. Eyni şəkildə `handleUpdateProduct`-ın `updateShopProduct(...)` çağırışına və `startEdit`-in `setEditForm({...})`-una.

Yeni-məhsul formunda "Qiymət (AZN)" input-undan sonra:

```tsx
<input
  className={styles.input}
  type="number"
  placeholder="Qiymət (USD, opsional)"
  value={form.qiymetUsd}
  onChange={(e) => setForm({ ...form, qiymetUsd: e.target.value })}
/>
```

Eyni sahə redaktə formunda da (`editForm.qiymetUsd`).

- [ ] **Step 5: `npx tsc -b --noEmit` işə sal**

```bash
cd /Users/frontend/workspace/me-github/autopulse && npx tsc -b --noEmit 2>&1 | head -40
```

Gözlənilən: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/shop.ts src/pages/shop/MyShop.tsx
git commit -m "feat(frontend): MyShop supports address/contact name profile edit and USD price"
```

---

## Task 8: Backend deploy + canlı doğrulama

**Files:** (kod dəyişikliyi yoxdur — yalnız deploy)

**Interfaces:**
- Consumes: Task 1-6-nın bütün dəyişiklikləri.
- Produces: canlıda işlək yeni sahələr — Task 9-11 (frontend) bu canlı API-yə qarşı test olunacaq.

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

- [ ] **Step 2: Backend-in düzgün başladığını doğrula**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 "sleep 2 && systemctl status avtopulse-backend --no-pager | head -10"
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "PGPASSWORD='z8vsYpTz9GjEwdKSwtYWK2bvTvXUPUs' psql -h localhost -U avtopulse -d avtopulse -c \"SELECT filename FROM public.schema_migrations ORDER BY applied_at DESC LIMIT 1\""
```

Gözlənilən: `Active: active (running)`, son migrasiya `0010_seller_contact_fields.sql`.

- [ ] **Step 3: `avto444` mağazasına test address/contactName əlavə et, doğrula**

```bash
curl -s -c /tmp/shop_cookie.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/login \
  -H "Content-Type: application/json" -d '{"email":"avto444@autopulse.local","password":"avto444pass"}'

curl -s -b /tmp/shop_cookie.txt -X PUT https://autopulse.157.180.73.79.sslip.io/api/shops/me \
  -H "Content-Type: application/json" -d '{"address":"Bakı, Nizami küç. 10","contactName":"Sənan Vəliyev"}'

curl -s https://autopulse.157.180.73.79.sslip.io/api/listings/shop/7 | python3 -m json.tool
```

Gözlənilən: `sellerAddress`, `sellerContactName`, `sellerWorkTimes`, `sellerActiveListingCount`, `sellerCreatedAt` sahələri doğru göstərilir.

- [ ] **Step 4: `qiymet_usd`-i test et**

```bash
curl -s -b /tmp/shop_cookie.txt -X PUT https://autopulse.157.180.73.79.sslip.io/api/shops/me/products/7 \
  -H "Content-Type: application/json" -d '{"name":"kia-sportage","title":"Kia Sportage, 2021","marka":"Kia","model":"Sportage","il":2021,"qiymet":38000,"qiymetUsd":22000}'

curl -s https://autopulse.157.180.73.79.sslip.io/api/listings/shop/7 | grep -o '"qiymetUsd":[0-9]*'
```

Gözlənilən: `"qiymetUsd":22000`.

- [ ] **Step 5: Mövcud (yeni sahələr boş) real elanların hələ xəta vermədən göründüyünü doğrula**

```bash
curl -s https://autopulse.157.180.73.79.sslip.io/api/listings | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d), 'listings OK')"
```

Gözlənilən: xəta yoxdur, bütün elanlar (mövcud + yeni sahələr) qaytarılır.

- [ ] **Step 6: Test dəyişikliklərini geri qaytar (canlı datanı təmiz saxlamaq üçün, əgər test address/contactName əlavə edildi)**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "PGPASSWORD='z8vsYpTz9GjEwdKSwtYWK2bvTvXUPUs' psql -h localhost -U avtopulse -d avtopulse -c \"UPDATE avto444.shop SET address = '', contact_name = '' WHERE name = 'avto444'\""
```

(Real `avto444` mağazasına test edilən `qiymetUsd`/`address`/`contactName` dəyərlərini istifadəçi saxlamaq istəyərsə, bu addımı atla — implementasiya zamanı istifadəçi ilə dəqiqləşdirilə bilər ki, bu test datası real, saxlanılası dəyər kimi qalsın.)

```bash
rm -f /tmp/shop_cookie.txt
```

---

## Task 9: Frontend `ApiListing` tipi — yeni sahələr

**Files:**
- Modify: `src/api/listings.ts`

**Interfaces:**
- Consumes: Task 6-nın `PublicListing.QiymetUSD`/`.SellerCreatedAt`/`.SellerContactName`/`.SellerWorkTimes`/`.SellerAddress`/`.SellerActiveListingCount`.
- Produces: `ApiListing.qiymetUsd`, `.sellerCreatedAt`, `.sellerContactName`, `.sellerWorkTimes`, `.sellerAddress`, `.sellerActiveListingCount` — Task 10-un `IndividualSellerCard`/`BusinessSellerCard`-ı bunları istifadə edəcək.

- [ ] **Step 1: `ApiListing`-ə sahələr əlavə et**

```typescript
export interface ApiListing {
  source: 'shop' | 'user';
  id: number;
  marka: string;
  model: string;
  il: number;
  qiymet: number;
  qiymetUsd: number;
  yurus: number;
  yanacaq: string;
  ban: string;
  title: string;
  details: string;
  images: ApiListingImage[];
  sellerType: 'diler' | 'şəxsi';
  sellerName: string;
  detailsJson: ApiListingDetails;
  viewCount: number;
  vipTier: 'standart' | 'vip' | 'premium_vip';
  sellerCreatedAt: string;
  sellerContactName?: string;
  sellerWorkTimes?: string;
  sellerAddress?: string;
  sellerLogoUrl?: string;
  sellerActiveListingCount?: number;
}
```

- [ ] **Step 2: `npx tsc -b --noEmit` işə sal**

```bash
npx tsc -b --noEmit 2>&1 | head -40
```

Gözlənilən: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/api/listings.ts
git commit -m "feat(frontend): extend ApiListing type with qiymetUsd and seller profile fields"
```

---

## Task 10: `IndividualSellerCard` komponenti

**Files:**
- Create: `src/components/IndividualSellerCard.tsx`
- Create: `src/components/IndividualSellerCard.module.css`

**Interfaces:**
- Consumes: `Listing` tipi (mövcud), `isOwner: boolean`, `onPromote: (tier: PromoTier) => Promise<void>`, `promoteError: string | null`, `onPromoteClick: () => void`.
- Produces: `RealListingDetail.tsx`-in `source === 'user'` olduqda render edəcəyi komponent.

- [ ] **Step 1: `RealListingDetail.module.css`-dəki mövcud `contactCard`/`price`/`featureRow`/`feature`/`cardDivider`/`sellerRow`/`sellerTypeBadge`/`sellerName`/`btnCall`/`btnMessage`/`promoGrid`/`promoTile`/`promoIcon`/`promoPrice`/`promoteError` siniflərini `IndividualSellerCard.module.css`-ə köçür (eyni CSS, fayl adı dəyişir)**

`RealListingDetail.module.css`-dəki bu sinifləri (dəyişməz) yeni fayla köçür — `RealListingDetail.module.css`-də qalırlar (Task 12-də çıxarılacaq).

- [ ] **Step 2: `IndividualSellerCard.tsx`-i yaz**

```tsx
import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { Listing, PromoTier } from '../types';
import styles from './IndividualSellerCard.module.css';

interface IndividualSellerCardProps {
  listing: Listing;
  isOwner: boolean;
  onPromoteClick: () => void;
}

function memberSince(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('az-AZ', { month: '2-digit', year: 'numeric' });
}

export default function IndividualSellerCard({ listing, isOwner, onPromoteClick }: IndividualSellerCardProps) {
  const [phoneRevealed, setPhoneRevealed] = useState(false);

  const maskedPhone = listing.satıcıZəng
    ? listing.satıcıZəng.replace(/(\+994\d{2})\d{3}(\d{2})(\d{2})/, '$1 XXX $2 $3')
    : '';

  return (
    <div className={styles.contactCard}>
      <div className={styles.price}>{listing.qiymət.toLocaleString()} ₼</div>
      <div className={styles.featureRow}>
        {listing.kredit && <span className={styles.feature}>Kredit</span>}
        {listing.barter && <span className={styles.feature}>Barter</span>}
      </div>

      <div className={styles.cardDivider} />

      <div className={styles.sellerRow}>
        <span className={styles.sellerTypeBadge}>Şəxsi</span>
        {listing.satıcıAd && <p className={styles.sellerName}>{listing.satıcıAd}</p>}
      </div>
      {listing.şəhər && <p className={styles.sellerMeta}>{listing.şəhər}</p>}
      {listing.satıcıÜzvlükTarixi && (
        <p className={styles.sellerMeta}>
          Satıcı {memberSince(listing.satıcıÜzvlükTarixi)} tarixindən AutoPulse-da
        </p>
      )}

      {listing.satıcıZəng && (
        <button className={styles.btnCall} onClick={() => setPhoneRevealed(true)}>
          📞 {phoneRevealed ? listing.satıcıZəng : `Nömrəni göstər · ${maskedPhone}`}
        </button>
      )}
      <button className={styles.btnMessage}>💬 Mesaj yaz</button>

      {isOwner && (
        <>
          <div className={styles.cardDivider} />
          <div className={styles.promoGrid}>
            <button className={styles.promoTile} onClick={onPromoteClick}>
              <span className={styles.promoIcon}>↑</span>
              <span>İrəli çək</span>
              <span className={styles.promoPrice}>3 AZN</span>
            </button>
            <button className={styles.promoTile} onClick={onPromoteClick}>
              <span className={styles.promoIcon}>♦</span>
              <span>VIP</span>
              <span className={styles.promoPrice}>5 AZN</span>
            </button>
            <button className={styles.promoTile} onClick={onPromoteClick}>
              <span className={styles.promoIcon}>♛</span>
              <span>Premium</span>
              <span className={styles.promoPrice}>7 AZN</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

Qeyd: `promoteError` göstərilməsi `RealListingDetail.tsx`-in özündə (kartın xaricində, modal ilə bağlı) qalır — bu komponent yalnız görünüşü idarə edir, `Link` importu istifadə olunmadığı üçün silinməlidir (Şəxsi kartda mağaza-keçid linki yoxdur).

- [ ] **Step 3: `Link` importunu sil (istifadə olunmur)**

Yuxarıdakı kodda `import { Link } from 'react-router-dom';` sətrini sil.

- [ ] **Step 4: `IndividualSellerCard.module.css`-ə `.sellerMeta` sinifini əlavə et**

`ListingDetail.module.css`-dəki `.sellerMeta` sinifini (`font-size: 12px; color: var(--text-secondary);`) köçür.

- [ ] **Step 5: `npx tsc -b --noEmit` işə sal**

```bash
npx tsc -b --noEmit 2>&1 | head -40
```

Gözlənilən: `RealListingDetail.tsx` hələ bu komponenti import etmədiyi üçün xəta yoxdur (Task 12-də inteqrasiya olunacaq), amma `IndividualSellerCard.tsx`-in özü tip xətasız olmalıdır.

- [ ] **Step 6: Commit**

```bash
git add src/components/IndividualSellerCard.tsx src/components/IndividualSellerCard.module.css
git commit -m "feat(frontend): add IndividualSellerCard component for real user listings"
```

---

## Task 11: `BusinessSellerCard` komponenti

**Files:**
- Create: `src/components/BusinessSellerCard.tsx`
- Create: `src/components/BusinessSellerCard.module.css`

**Interfaces:**
- Consumes: `Listing` tipi, `ApiListing`-dən əlavə seller sahələri (`sellerContactName`, `sellerWorkTimes`, `sellerAddress`, `sellerActiveListingCount`, `sellerName`, `qiymetUsd`), `isOwner`, `onPromoteClick`.
- Produces: `RealListingDetail.tsx`-in `source === 'shop'` olduqda render edəcəyi komponent.

- [ ] **Step 1: `BusinessSellerCard.tsx`-i yaz**

Bu komponent `Listing` tipindən əlavə, `ApiListing`-in mağaza-spesifik sahələrini də tələb edir — `RealListingDetail.tsx` bunları ayrıca prop kimi ötürəcək (adapter funksiyası `Listing`-ə uyğunlaşdırmır, çünki bu sahələr mock `Listing` tipində yoxdur):

```tsx
import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { Listing } from '../types';
import styles from './BusinessSellerCard.module.css';

interface BusinessSellerCardProps {
  listing: Listing;
  sellerName: string;
  logoUrl?: string;
  contactName?: string;
  workTimes?: string;
  address?: string;
  activeListingCount?: number;
  qiymetUsd?: number;
  isOwner: boolean;
  onPromoteClick: () => void;
}

function memberSince(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('az-AZ', { month: '2-digit', year: 'numeric' });
}

export default function BusinessSellerCard({
  listing,
  sellerName,
  logoUrl,
  contactName,
  workTimes,
  address,
  activeListingCount,
  qiymetUsd,
  isOwner,
  onPromoteClick,
}: BusinessSellerCardProps) {
  const [phoneRevealed, setPhoneRevealed] = useState(false);

  const maskedPhone = listing.satıcıZəng
    ? listing.satıcıZəng.replace(/(\+994\d{2})\d{3}(\d{2})(\d{2})/, '$1 XXX $2 $3')
    : '';

  return (
    <div className={styles.contactCard}>
      <div className={styles.priceRow}>
        <div className={styles.price}>{listing.qiymət.toLocaleString()} ₼</div>
        {qiymetUsd ? <div className={styles.priceUsd}>≈ {qiymetUsd.toLocaleString()} $</div> : null}
      </div>
      <div className={styles.featureRow}>
        {listing.kredit && <span className={styles.feature}>Kredit</span>}
        {listing.barter && <span className={styles.feature}>Barter</span>}
      </div>

      <div className={styles.cardDivider} />

      <div className={styles.sellerHeader}>
        {logoUrl && <img src={logoUrl} alt={sellerName} className={styles.logo} />}
        <div>
          {contactName && <p className={styles.sellerName}>{contactName}</p>}
          <span className={styles.sellerTypeBadge}>Diler / Salon</span>
        </div>
      </div>

      {listing.şəhər && <p className={styles.sellerMeta}>{listing.şəhər}</p>}
      {listing.satıcıÜzvlükTarixi && (
        <p className={styles.sellerMeta}>
          Satıcı {memberSince(listing.satıcıÜzvlükTarixi)} tarixindən AutoPulse-da
        </p>
      )}
      {typeof activeListingCount === 'number' && (
        <p className={styles.sellerMeta}>Elan sayı: {activeListingCount}</p>
      )}
      {workTimes && <p className={styles.sellerMeta}>{workTimes}</p>}
      {address && <p className={styles.sellerMeta}>{address}</p>}

      {listing.satıcıZəng && (
        <button className={styles.btnCall} onClick={() => setPhoneRevealed(true)}>
          📞 {phoneRevealed ? listing.satıcıZəng : `Nömrəni göstər · ${maskedPhone}`}
        </button>
      )}
      <button className={styles.btnMessage}>💬 Mesaj yaz</button>

      {sellerName && (
        <Link to={`/magazalar/${sellerName}`} className={styles.shopLink}>
          Mağazaya bax →
        </Link>
      )}

      {isOwner && (
        <>
          <div className={styles.cardDivider} />
          <div className={styles.promoGrid}>
            <button className={styles.promoTile} onClick={onPromoteClick}>
              <span className={styles.promoIcon}>↑</span>
              <span>İrəli çək</span>
              <span className={styles.promoPrice}>3 AZN</span>
            </button>
            <button className={styles.promoTile} onClick={onPromoteClick}>
              <span className={styles.promoIcon}>♦</span>
              <span>VIP</span>
              <span className={styles.promoPrice}>5 AZN</span>
            </button>
            <button className={styles.promoTile} onClick={onPromoteClick}>
              <span className={styles.promoIcon}>♛</span>
              <span>Premium</span>
              <span className={styles.promoPrice}>7 AZN</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `BusinessSellerCard.module.css`-i yaz**

`IndividualSellerCard.module.css`-dəki bütün ortaq sinifləri (`.contactCard`, `.price`, `.featureRow`, `.feature`, `.cardDivider`, `.sellerTypeBadge`, `.sellerName`, `.sellerMeta`, `.btnCall`, `.btnMessage`, `.promoGrid`, `.promoTile`, `.promoIcon`, `.promoPrice`) köçür, üstünə yeni sinifləri əlavə et:

```css
.priceRow {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.priceUsd {
  font-size: 14px;
  color: var(--text-secondary);
}

.sellerHeader {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.logo {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  border: 1px solid var(--border);
}

.shopLink {
  display: block;
  text-align: center;
  margin-top: var(--space-2);
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
}

.shopLink:hover {
  text-decoration: underline;
}
```

- [ ] **Step 3: `npx tsc -b --noEmit` işə sal**

```bash
npx tsc -b --noEmit 2>&1 | head -40
```

Gözlənilən: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/BusinessSellerCard.tsx src/components/BusinessSellerCard.module.css
git commit -m "feat(frontend): add BusinessSellerCard component for real shop listings"
```

---

## Task 12: `RealListingDetail.tsx`-i iki komponentə uyğunlaşdır

**Files:**
- Modify: `src/pages/RealListingDetail.tsx`
- Modify: `src/pages/RealListingDetail.module.css`

**Interfaces:**
- Consumes: Task 9-un `ApiListing` yeni sahələri, Task 10/11-in `IndividualSellerCard`/`BusinessSellerCard`.
- Produces: real elan detalı səhifəsi `source`-a görə düzgün kartı göstərir.

- [ ] **Step 1: Import-ları yenilə**

```typescript
import IndividualSellerCard from '../components/IndividualSellerCard';
import BusinessSellerCard from '../components/BusinessSellerCard';
```

(`InteractiveGallery`/`ListingDetailTabs`/`PromoteModal` importları qalır.)

- [ ] **Step 2a: `apiListingToMockShape`-in saxta üzvlük-tarixi baqqını düzəlt**

Hazırkı `RealListingDetail.tsx`-də `apiListingToMockShape` `satıcıÜzvlükTarixi: new Date().toISOString()` yazır — yəni hər dəfə "bu gün" göstərilir, real deyil. Task 9-un `ApiListing.sellerCreatedAt`-ı artıq real dəyəri daşıyır — bunu istifadə et:

```typescript
satıcıAd: d.satıcıAd ?? l.sellerName,
satıcıZəng: d.satıcıZəng ?? '',
satıcıÜzvlükTarixi: l.sellerCreatedAt,
tarix: new Date().toISOString(),
```

(`tarix` sahəsinə toxunma — bu, `ListingDetailTabs`-ın "Yeniləndi" göstəricisi üçündür, ayrıca bir konsepdir, real backend-də uyğun sahə yoxdur, bu planın miqyasında deyil.)

- [ ] **Step 2b: Əlavə olaraq ham `ApiListing`-in özünü də state-də saxla**

Mövcud `listing` state-i (`Listing` tipi) qalır, üstünə `apiListing: ApiListing | null` state-i əlavə et ki, `BusinessSellerCard`-ın tələb etdiyi əlavə sahələr (`sellerContactName`, `sellerWorkTimes`, s.) əlçatan olsun:

```typescript
const [apiListing, setApiListing] = useState<ApiListing | null>(null);
```

`useEffect`-in `setListing(apiListingToMockShape(detail));` sətrindən sonra: `setApiListing(detail);`. `handlePromote`-un `if (detail) setListing(apiListingToMockShape(detail));` sətrindən sonra: `if (detail) setApiListing(detail);`.

- [ ] **Step 3: `source`, `sourceKind` dəyişənini hesabla**

`if (loading) return ...` sətrindən əvvəl:

```typescript
const sourceKind = id?.split('-')[0] as 'shop' | 'user' | undefined;
```

- [ ] **Step 4: `contactCard`-ın bütün JSX-ini iki komponent çağırışı ilə əvəz et**

Mövcud `<div className={styles.contactCard}>...</div>` blokunu (price-dan promoteError-a qədər) belə əvəz et:

```tsx
{sourceKind === 'shop' ? (
  <BusinessSellerCard
    listing={listing}
    sellerName={sellerName}
    logoUrl={apiListing?.sellerLogoUrl}
    contactName={apiListing?.sellerContactName}
    workTimes={apiListing?.sellerWorkTimes}
    address={apiListing?.sellerAddress}
    activeListingCount={apiListing?.sellerActiveListingCount}
    qiymetUsd={apiListing?.qiymetUsd}
    isOwner={isOwner}
    onPromoteClick={() => setPromoteOpen(true)}
  />
) : (
  <IndividualSellerCard
    listing={listing}
    isOwner={isOwner}
    onPromoteClick={() => setPromoteOpen(true)}
  />
)}
{promoteError && <p className={styles.promoteError}>{promoteError}</p>}
```

- [ ] **Step 5: `RealListingDetail.module.css`-dən köçürülmüş, artıq istifadə olunmayan sinifləri sil**

`.contactCard`, `.price`, `.featureRow`, `.feature`, `.cardDivider`, `.sellerRow`, `.sellerTypeBadge`, `.sellerName`, `.btnCall`, `.btnMessage`, `.promoGrid`, `.promoTile`, `.promoIcon`, `.promoPrice`, `.promoteError` siniflərini `RealListingDetail.module.css`-dən sil (bunlar indi `IndividualSellerCard.module.css`/`BusinessSellerCard.module.css`-də yaşayır) — YALNIZ `.promoteError` qalır (Step 4-də hələ istifadə olunur, kartın xaricində).

- [ ] **Step 6: `npx tsc -b --noEmit` və `npm run build`**

```bash
npx tsc -b --noEmit && npm run build
```

Gözlənilən: PASS.

- [ ] **Step 7: Korrupsiya scan**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/RealListingDetail.tsx src/pages/RealListingDetail.module.css src/components/IndividualSellerCard.tsx src/components/IndividualSellerCard.module.css src/components/BusinessSellerCard.tsx src/components/BusinessSellerCard.module.css
```

Gözlənilən: boş.

- [ ] **Step 8: Commit**

```bash
git add src/pages/RealListingDetail.tsx src/pages/RealListingDetail.module.css
git commit -m "feat(frontend): RealListingDetail renders IndividualSellerCard/BusinessSellerCard by source"
```

---

## Task 13: Backend+frontend deploy + tam canlı doğrulama

**Files:** (kod dəyişikliyi yoxdur — yalnız deploy + manual doğrulama)

**Interfaces:**
- Consumes: bütün əvvəlki task-ların dəyişiklikləri.

- [ ] **Step 1: Backend-i yenidən deploy et (Task 12-nin `sellerLogoUrl` dəyişikliyi üçün)**

```bash
rsync -avz --exclude='.git' --exclude='avtopulse-backend/server' \
  -e "ssh -i ~/.ssh/youtube-remote-webrtc_ed25519" \
  avtopulse-backend/ root@157.180.73.79:/opt/avtopulse-backend/

ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "export PATH=\$PATH:/usr/local/go/bin && cd /opt/avtopulse-backend && go build -o avtopulse-backend ./cmd/server"

ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "chown youtube-remote:youtube-remote /opt/avtopulse-backend/avtopulse-backend && systemctl restart avtopulse-backend && sleep 2 && systemctl status avtopulse-backend --no-pager | head -8"
```

- [ ] **Step 2: Frontend-i deploy et**

```bash
git push origin main
bash deploy/deploy.sh
```

- [ ] **Step 3: `shop-7` (avto444) elanının BusinessSellerCard ilə düzgün göründüyünü doğrula**

```bash
curl -s https://autopulse.157.180.73.79.sslip.io/api/listings/shop/7 | python3 -m json.tool
```

Gözlənilən: `sellerLogoUrl`, `sellerContactName`, `sellerWorkTimes`, `sellerAddress`, `sellerActiveListingCount`, `qiymetUsd`, `sellerCreatedAt` hamısı doğru dəyərlərlə görünür.

Brauzerdə `/elan/shop-7` aç, `BusinessSellerCard`-ın loqo, əlaqə şəxsi, ünvan, iş saatları, elan sayı, AZN+USD qiymət, "Mağazaya bax" linkini düzgün göstərdiyini yoxla.

- [ ] **Step 4: Real bir istifadəçi elanının `IndividualSellerCard` ilə düzgün göründüyünü doğrula**

`GET /api/listings` ilə aktiv bir `source: "user"` elanı tap, `/elan/user-{id}` aç, kartın Ad Soyad, Şəxsi badge, şəhər, üzvlük tarixi, telefon (varsa), "Mesaj yaz" düzgün göstərdiyini yoxla.

- [ ] **Step 5: Hər iki kartda promote-un yalnız sahibə göründüyünü, sahib olmayanda görünmədiyini doğrula**

Sahib kimi giriş edib öz elanına bax — promote kartı görünməli. Çıxış edib (və ya fərqli sessiyada) eyni elanı aç — promote kartı görünməməli.

- [ ] **Step 6: Mövcud (yeni sahələr toxunulmamış) real elanların xəta vermədən göründüyünü doğrula**

Yeni field-lər əlavə edilməyən köhnə bir elanı (`/elan/shop-1` və ya bənzəri) aç — boş `sellerAddress`/`sellerWorkTimes`/`qiymetUsd: 0` ilə komponentin sınmadan, sadəcə həmin sahələri gizlədərək (yaxud `0`-ı göstərməyərək) render etdiyini təsdiqlə.

- [ ] **Step 7: Nəticəni istifadəçiyə raportla**

Test edilən elanların linklərini paylaş, hər addımın gözlənilən nəticəyə uyğun olduğunu qeyd et, "Mesaj yaz"-ın hələ funksionalsız olduğunu (ayrıca spec gözlədiyini) xatırlat.
