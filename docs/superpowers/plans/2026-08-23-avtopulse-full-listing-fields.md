# AutoPulse — Tam Elan Sahələri (JSON-Əsaslı Genişlənmə) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for this project) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real elanlar (`shop_products`/`user_products`) mock `ListingDetail.tsx`-in göstərdiyi bütün 30+ sahəni (mühərrik, ötürücü, rəng, vəziyyət, kredit/barter, 4 şəkil kateqoriyası, satıcı əlaqə, təchizat, baxış sayı) dəstəkləsin, `RealListingDetail.tsx` bu tam görünüşü göstərsin.

**Architecture:** Mövcud sadə sütunlar (marka/model/il/qiymət/yürüş/yanacaq/ban/title/details/status) olduğu kimi qalır. Bütün YENİ ~20 sahə `details_json JSONB` sütununda, struktursuz şəkildə saxlanılır — Go tərəfində sahə-sahə parse edilmədən, `json.RawMessage` kimi şəffaf ötürülür (bir istisna: `satıcıAd`/`satıcıZəng` backend tərəfindən yaradılış zamanı server-side doldurulur/əvəz olunur). Şəkillər `kind` sütunu ilə 4 kateqoriyaya bölünür. `view_count` hər detal-görüntüləmədə artır.

**Tech Stack:** Go/chi/pgx (backend), React/TypeScript (frontend), Postgres JSONB.

## Global Constraints

- Mövcud 9 sadə sütun (marka/model/il/qiymet/yurus/yanacaq/ban/title/details/status) DƏYİŞMİR — yalnız əlavə sütunlar gəlir.
- `details_json JSONB NOT NULL DEFAULT '{}'`, `view_count INT NOT NULL DEFAULT 0` — həm `shop_products`, həm `user_products`-a.
- `shop_product_images`/`user_products_images`-ə `kind TEXT NOT NULL DEFAULT 'exterior' CHECK (kind IN ('exterior', 'interior', 'features', 'doors'))`.
- Mağaza elanı: `satıcıAd` = mağaza adı, `satıcıZəng` = həmişə `""` (mağaza telefon göstərmir). İstifadəçi elanı: `satıcıAd` = `user.Name`, `satıcıZəng` = `user.Phone`. Bu iki sahə HƏMİŞƏ server tərəfində `CreateProduct`-da doldurulur/əvəz olunur — istifadəçinin göndərdiyi `details.satıcıAd`/`satıcıZəng` dəyərləri diqqətə alınmır.
- Mövcud 12+ real mağaza məhsuluna və mock-9-a (mock sistem) toxunulmur — bu, tamamilə ayrı, paralel sistemdir.
- Geriyə uyğunluq: `details_json` boş (`{}`) olan köhnə sətirlər (mövcud 12+ məhsul) frontend-də xəta vermədən, sadəcə həmin sahələri boş/defolt göstərməlidir.
- Deploy axını dəyişməz: backend = rsync + `go build` + `systemctl restart avtopulse-backend`; frontend = `git push origin main` + `bash deploy/deploy.sh`.

---

## Task 1: DB migrasiyası — `details_json`, `view_count`, `kind`

**Files:**
- Create: `avtopulse-backend/migrations/0008_full_listing_fields.sql`

**Interfaces:**
- Produces: hər iki cədvəldə `details_json JSONB`, `view_count INT` sütunları; hər iki şəkil cədvəlində `kind TEXT` sütunu — bütün sonrakı Go dəyişikliklər bu sütunlardan asılıdır.

- [ ] **Step 1: Migrasiya faylını yaz**

```sql
ALTER TABLE avto444.shop_products ADD COLUMN details_json JSONB NOT NULL DEFAULT '{}';
ALTER TABLE avto444.shop_products ADD COLUMN view_count INT NOT NULL DEFAULT 0;

ALTER TABLE avto444.user_products ADD COLUMN details_json JSONB NOT NULL DEFAULT '{}';
ALTER TABLE avto444.user_products ADD COLUMN view_count INT NOT NULL DEFAULT 0;

ALTER TABLE avto444.shop_product_images
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'exterior' CHECK (kind IN ('exterior', 'interior', 'features', 'doors'));

ALTER TABLE avto444.user_products_images
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'exterior' CHECK (kind IN ('exterior', 'interior', 'features', 'doors'));
```

- [ ] **Step 2: Serverdə tətbiq et**

Bu layihədə migrasiya runner yoxdur (`ls avtopulse-backend/migrations/` göstərir ki, `NNNN_*.sql` sıralı fayllardır, əl ilə `psql` ilə tətbiq olunur — əvvəlki `0001`-`0007` üçün necə edilibsə). Serverə rsync edib canlı Postgres-ə tətbiq et:

```bash
scp avtopulse-backend/migrations/0008_full_listing_fields.sql <server>:/tmp/
ssh <server> "psql \$AVTOPULSE_DB_URL -f /tmp/0008_full_listing_fields.sql"
```

(Server bağlantı təfərrüatları üçün `my-servers` cache-inə bax — `server-157.180.73.79.md`.)

- [ ] **Step 3: Doğrula**

```bash
ssh <server> "psql \$AVTOPULSE_DB_URL -c \"\\d avto444.shop_products\" -c \"\\d avto444.user_products\""
```

Gözlənilən: hər iki cədvəldə `details_json` (jsonb) və `view_count` (integer) sütunları görünür.

- [ ] **Step 4: Commit**

```bash
git add avtopulse-backend/migrations/0008_full_listing_fields.sql
git commit -m "feat(backend): add details_json/view_count/kind columns for full listing fields"
```

---

## Task 2: Go struct genişlənməsi — `shop.Product`/`user.Product`-a `DetailsJSON`/`ViewCount`

**Files:**
- Modify: `avtopulse-backend/internal/shop/model.go`
- Modify: `avtopulse-backend/internal/user/model.go`

**Interfaces:**
- Consumes: Task 1-in `details_json`/`view_count`/`kind` sütunları.
- Produces: `Product.DetailsJSON json.RawMessage`, `Product.ViewCount int`, `ProductImage.Kind string` — Task 3/4-ün repository dəyişiklikləri bunları scan edəcək.

- [ ] **Step 1: `shop/model.go`-a sahələr əlavə et**

`avtopulse-backend/internal/shop/model.go`-da `ProductImage` və `Product` struct-larını belə genişləndir:

```go
type ProductImage struct {
	ID       int64  `json:"id"`
	MinioURL string `json:"minioUrl"`
	S3URL    string `json:"s3Url"`
	Sira     int    `json:"sira"`
	Kind     string `json:"kind"`
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
	Status  string `json:"status"`

	DetailsJSON json.RawMessage `json:"details"`
	ViewCount   int             `json:"viewCount"`

	Images []ProductImage `json:"images"`
}

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

	DetailsJSON json.RawMessage `json:"details"`
}
```

`ProductWithShopName` dəyişmir (embeds `Product`, avtomatik yeni sahələri alır). Faylın başına `"encoding/json"` importunu əlavə et.

- [ ] **Step 2: `user/model.go`-a eyni sahələri əlavə et**

```go
type ProductImage struct {
	ID       int64  `json:"id"`
	MinioURL string `json:"minioUrl"`
	S3URL    string `json:"s3Url"`
	Sira     int    `json:"sira"`
	Kind     string `json:"kind"`
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

	DetailsJSON json.RawMessage `json:"details"`
	ViewCount   int             `json:"viewCount"`

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

	DetailsJSON json.RawMessage `json:"details"`
}
```

Faylın başına `"encoding/json"` importunu əlavə et.

- [ ] **Step 3: Kompilyasiyanı yoxla (gözlənilən: repository/handler fayllarında xəta, sonrakı tasklarda düzələcək)**

```bash
cd avtopulse-backend && go build ./... 2>&1 | head -40
```

Gözlənilən: `internal/shop` və `internal/user` paketlərində `Scan`/literal init xətaları (repository hələ yeni sütunları oxumur/yazmır) — bu normaldır, Task 3/4 düzəldəcək. Faylın özü sintaktik cəhətdən düzgün olmalıdır (`go vet ./internal/shop/... ./internal/user/...` sətir-səviyyəli sintaksis xətası verməməlidir).

- [ ] **Step 4: Commit**

```bash
git add avtopulse-backend/internal/shop/model.go avtopulse-backend/internal/user/model.go
git commit -m "feat(backend): add DetailsJSON/ViewCount/Kind fields to shop and user models"
```

---

## Task 3: `shop` repository — JSONB, `kind`, `view_count` dəstəyi

**Files:**
- Modify: `avtopulse-backend/internal/shop/repository.go`
- Test: `avtopulse-backend/internal/shop/repository_pg_test.go`

**Interfaces:**
- Consumes: Task 2-nin `Product.DetailsJSON`/`ViewCount`, `ProductImage.Kind` sahələri.
- Produces: `Repository` interfeysinə yeni metod `IncrementViewCount(ctx, productID int64) error`; `AddProductImage` imzası `kind string` parametri alır; `ListProducts`/`ListAllProducts`/`ListActiveProducts`/`CreateProduct`/`UpdateProduct` `details_json`/`view_count` oxuyub-yazır. Task 5 (`listings` handler) `IncrementViewCount`-dan istifadə edəcək.

- [ ] **Step 1: `listProductImages`-i `kind` oxuyacaq şəkildə dəyiş**

```go
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
```

- [ ] **Step 2: `AddProductImage`-ə `kind` parametri əlavə et (həm interfeys, həm implementasiya)**

`Repository` interfeysində:

```go
AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int, kind string) (*ProductImage, error)
```

İmplementasiya:

```go
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
```

- [ ] **Step 3: `ListProducts`/`ListAllProducts`/`ListActiveProducts`-a `details_json`/`view_count` sütunlarını əlavə et**

Hər üç funksiyada `SELECT`-ə `, details_json, view_count` əlavə et, `Scan`-a `&p.DetailsJSON, &p.ViewCount` əlavə et. Nümunə (`ListProducts`):

```go
func (r *pgRepository) ListProducts(ctx context.Context, shopID int64, onlyStatus string) ([]Product, error) {
	query := `SELECT id, name, title, COALESCE(details, ''),
	                 COALESCE(marka, ''), COALESCE(model, ''), COALESCE(il, 0),
	                 COALESCE(qiymet, 0), COALESCE(yurus, 0), COALESCE(yanacaq, ''), COALESCE(ban, ''), status,
	                 details_json, view_count
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
			&p.DetailsJSON, &p.ViewCount); err != nil {
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

Eyni `, details_json, view_count` + `&p.DetailsJSON, &p.ViewCount` dəyişikliyini `ListAllProducts` (SELECT-in sonuna) və `ListActiveProducts`-da (`sp.details_json, sp.view_count` — cədvəl alias-ı `sp` olduğuna görə) et.

- [ ] **Step 4: `CreateProduct`-ı `details_json`-u yazacaq və `satıcıAd`-ı server-side dolduracaq şəkildə dəyiş**

```go
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
		`INSERT INTO avto444.shop_products (name, title, details, marka, model, il, qiymet, yurus, yanacaq, ban, shop_id, details_json)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		 RETURNING id`,
		input.Name, input.Title, input.Details, input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, shopID, detailsJSON,
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
		Status:  "saytda",
		DetailsJSON: detailsJSON,
		Images:  []ProductImage{},
	}, nil
}
```

Faylın başına `"encoding/json"` importunu əlavə et (əgər Task 2-də model.go-ya əlavə etmisənsə, bu, repository.go-nun öz importudur — ayrı fayl).

- [ ] **Step 5: `UpdateProduct`-a `details_json` yazma əlavə et — `satıcıAd`/`satıcıZəng` DƏYİŞMİR (yalnız yaradılışda təyin olunur)**

```go
func (r *pgRepository) UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error) {
	var status string
	err := r.pool.QueryRow(ctx,
		`UPDATE avto444.shop_products
		 SET name = $1, title = $2, details = $3, marka = $4, model = $5, il = $6, qiymet = $7, yurus = $8, yanacaq = $9, ban = $10,
		     details_json = details_json || $11::jsonb
		 WHERE id = $12
		 RETURNING status`,
		input.Name, input.Title, input.Details, input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban,
		nonSellerFields(input.DetailsJSON), productID,
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
```

- [ ] **Step 6: `IncrementViewCount` metodunu interfeysə və implementasiyaya əlavə et**

`Repository` interfeysinə:

```go
IncrementViewCount(ctx context.Context, productID int64) error
```

İmplementasiya:

```go
func (r *pgRepository) IncrementViewCount(ctx context.Context, productID int64) error {
	_, err := r.pool.Exec(ctx, `UPDATE avto444.shop_products SET view_count = view_count + 1 WHERE id = $1`, productID)
	return err
}
```

- [ ] **Step 7: `repository_pg_test.go`-da mövcud testlərin `AddProductImage` çağırışlarını yeni imzaya uyğunlaşdır**

`grep -n "AddProductImage" avtopulse-backend/internal/shop/repository_pg_test.go` ilə tap, hər çağırışın sonuna `"exterior"` arqumenti əlavə et (mövcud testlərin niyyəti pozulmur, sadəcə yeni parametr default dəyərlə doldurulur).

- [ ] **Step 8: Testləri işə sal**

```bash
cd avtopulse-backend && go test ./internal/shop/... -v
```

Gözlənilən: PASS (əgər real Postgres bağlantısı lazımdırsa və mövcud deyilsə, bu testlər `SKIP` edə bilər — mövcud davranışla eynidir).

- [ ] **Step 9: Commit**

```bash
git add avtopulse-backend/internal/shop/repository.go avtopulse-backend/internal/shop/repository_pg_test.go
git commit -m "feat(backend): shop repository reads/writes details_json, kind, view_count"
```

---

## Task 4: `user` repository — eyni JSONB/`kind`/`view_count` dəstəyi

**Files:**
- Modify: `avtopulse-backend/internal/user/repository.go`

**Interfaces:**
- Consumes: Task 2-nin `user.Product.DetailsJSON`/`ViewCount`, `ProductImage.Kind`.
- Produces: `Repository.AddProductImage` yeni imza (`kind string` parametri), yeni `IncrementViewCount(ctx, productID int64) error` metodu — Task 5 bunları istifadə edəcək. `CreateProduct` `satıcıAd`=`user.Name`, `satıcıZəng`=`user.Phone` server-side doldurur.

- [ ] **Step 1: `listProductImages`-i `kind` oxuyacaq şəkildə dəyiş**

```go
func (r *pgRepository) listProductImages(ctx context.Context, productID int64) ([]ProductImage, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, minio_url, COALESCE(s3_url, ''), sira, kind FROM avto444.user_products_images WHERE user_product_id = $1 ORDER BY sira, id`,
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
```

- [ ] **Step 2: `AddProductImage`-ə `kind` parametri əlavə et**

Interfeysdə:

```go
AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int, kind string) (*ProductImage, error)
```

İmplementasiya:

```go
func (r *pgRepository) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int, kind string) (*ProductImage, error) {
	var id int64
	err := r.pool.QueryRow(ctx,
		`INSERT INTO avto444.user_products_images (user_product_id, minio_url, s3_url, sira, kind) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		productID, minioURL, s3URL, sira, kind,
	).Scan(&id)
	if err != nil {
		return nil, err
	}
	return &ProductImage{ID: id, MinioURL: minioURL, S3URL: s3URL, Sira: sira, Kind: kind}, nil
}
```

- [ ] **Step 3: `ListMyProducts`/`ListPendingProducts`/`ListActiveProducts`-a `details_json, view_count` əlavə et**

Hər üçündə `SELECT`-ə `, details_json, view_count` əlavə et, uyğun `Scan`-a `&p.DetailsJSON, &p.ViewCount` əlavə et — Task 3 Step 3-dəki nümunə ilə eyni forma.

- [ ] **Step 4: `CreateProduct`-ı `satıcıAd`=`user.Name`, `satıcıZəng`=`user.Phone` dolduracaq şəkildə dəyiş**

```go
func (r *pgRepository) CreateProduct(ctx context.Context, userID int64, input CreateProductInput) (*Product, error) {
	var u User
	err := r.pool.QueryRow(ctx, `SELECT id, name, phone FROM avto444.user WHERE id = $1`, userID).Scan(&u.ID, &u.Name, &u.Phone)
	if err != nil {
		return nil, err
	}

	details := map[string]any{}
	if len(input.DetailsJSON) > 0 {
		if err := json.Unmarshal(input.DetailsJSON, &details); err != nil {
			return nil, err
		}
	}
	details["satıcıAd"] = u.Name
	details["satıcıZəng"] = u.Phone
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		return nil, err
	}

	var id int64
	err = r.pool.QueryRow(ctx,
		`INSERT INTO avto444.user_products (user_id, marka, model, il, qiymet, yurus, yanacaq, ban, title, details, status, details_json)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'gozlemede', $11)
		 RETURNING id`,
		userID, input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, input.Title, input.Details, detailsJSON,
	).Scan(&id)
	if err != nil {
		return nil, err
	}

	return &Product{
		ID: id, UserID: userID, Marka: input.Marka, Model: input.Model, Il: input.Il,
		Qiymet: input.Qiymet, Yurus: input.Yurus, Yanacaq: input.Yanacaq, Ban: input.Ban,
		Title: input.Title, Details: input.Details, Status: "gozlemede",
		DetailsJSON: detailsJSON, Images: []ProductImage{},
	}, nil
}
```

- [ ] **Step 5: `UpdateProduct`-a `details_json` merge əlavə et (satıcı sahələri toxunulmaz qalır)**

Task 3 Step 5-dəki `nonSellerFields` helper-ini `user/repository.go`-ya da (eyni adla, ayrı paket olduğu üçün ayrıca) əlavə et, `UPDATE` sorğusuna `details_json = details_json || $N::jsonb` əlavə et:

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
	err = r.pool.QueryRow(ctx,
		`UPDATE avto444.user_products
		 SET marka = $1, model = $2, il = $3, qiymet = $4, yurus = $5, yanacaq = $6, ban = $7, title = $8, details = $9, status = $10, updated_at = now(),
		     details_json = details_json || $11::jsonb
		 WHERE id = $12
		 RETURNING user_id`,
		input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, input.Title, input.Details, newStatus,
		nonSellerFields(input.DetailsJSON), productID,
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
```

- [ ] **Step 6: `IncrementViewCount`-u interfeysə/implementasiyaya əlavə et**

```go
IncrementViewCount(ctx context.Context, productID int64) error
```

```go
func (r *pgRepository) IncrementViewCount(ctx context.Context, productID int64) error {
	_, err := r.pool.Exec(ctx, `UPDATE avto444.user_products SET view_count = view_count + 1 WHERE id = $1`, productID)
	return err
}
```

`"encoding/json"` importunu faylın başına əlavə et.

- [ ] **Step 7: `go build` ilə kompilyasiyanı doğrula**

```bash
cd avtopulse-backend && go build ./internal/user/...
```

Gözlənilən: PASS (handler.go hələ köhnə `AddProductImage` imzası ilə çağırdığı üçün Task 6-da düzələcək — bu addımda YALNIZ `internal/user` paketinin özünü build et, tam `./...` yox).

- [ ] **Step 8: Commit**

```bash
git add avtopulse-backend/internal/user/repository.go
git commit -m "feat(backend): user repository reads/writes details_json, kind, view_count"
```

---

## Task 5: `listings` handler — `details`/`viewCount`/`kind` public API-də, `view_count++`

**Files:**
- Modify: `avtopulse-backend/internal/listings/model.go`
- Modify: `avtopulse-backend/internal/listings/handler.go`
- Modify: `avtopulse-backend/internal/listings/handler_test.go`

**Interfaces:**
- Consumes: Task 3/4-ün `Product.DetailsJSON`/`ViewCount`, `ProductImage.Kind`, `Repository.IncrementViewCount`.
- Produces: `PublicListing.Details json.RawMessage`, `.ViewCount int`, `ImageOut.Kind string` — Task 8-in frontend `ApiListing` tipi bunları güdəcək.

- [ ] **Step 1: `model.go`-ya sahələr əlavə et**

```go
package listings

import "encoding/json"

type ImageOut struct {
	MinioURL string `json:"minioUrl"`
	S3URL    string `json:"s3Url"`
	Sira     int    `json:"sira"`
	Kind     string `json:"kind"`
}

type PublicListing struct {
	Source     string          `json:"source"` // "shop" or "user"
	ID         int64           `json:"id"`
	Marka      string          `json:"marka"`
	Model      string          `json:"model"`
	Il         int             `json:"il"`
	Qiymet     int             `json:"qiymet"`
	Yurus      int             `json:"yurus"`
	Yanacaq    string          `json:"yanacaq"`
	Ban        string          `json:"ban"`
	Title      string          `json:"title"`
	Details    string          `json:"details"`
	Images     []ImageOut      `json:"images"`
	SellerType string          `json:"sellerType"` // "diler" or "şəxsi"
	SellerName string          `json:"sellerName"` // shop name, or "" for user listings
	DetailsJSON json.RawMessage `json:"detailsJson"`
	ViewCount  int             `json:"viewCount"`
}
```

(`Details string` — mövcud sadə `details` sahəsi qalır, yeni `detailsJson` ad toqquşmasının qarşısını alır.)

- [ ] **Step 2: `toImageOut`-u `kind` ötürəcək şəkildə dəyiş**

```go
func toImageOut(minioURL, s3URL string, sira int, kind string) ImageOut {
	return ImageOut{MinioURL: minioURL, S3URL: s3URL, Sira: sira, Kind: kind}
}
```

Handler-də bütün 4 çağırış yerini (`PublicListings` içindəki 2, `PublicListingDetail` içindəki 2) `toImageOut(img.MinioURL, img.S3URL, img.Sira, img.Kind)` şəklinə yenilə, `PublicListing{...}` literal-larına `DetailsJSON: p.DetailsJSON, ViewCount: p.ViewCount` əlavə et.

- [ ] **Step 3: `PublicListingDetail`-də tapılan elan üçün `IncrementViewCount` çağır**

`PublicListingDetail`-in shop qolunda, `writeJSON` çağırmadan ƏVVƏL:

```go
_ = h.shopRepo.IncrementViewCount(req.Context(), p.ID)
```

(xəta udulur — baxış sayğacının uğursuz artımı elanın göstərilməsini bloklamamalıdır); user qolunda eyni şəkildə `h.userRepo.IncrementViewCount(req.Context(), p.ID)`.

- [ ] **Step 4: `handler_test.go`-dakı `fakeShopRepo`/`fakeUserRepo`-ya yeni interfeys metodlarını əlavə et**

```go
func (f *fakeShopRepo) IncrementViewCount(ctx context.Context, productID int64) error { return nil }
```

və eyni şəkildə `fakeUserRepo`-ya, həmçinin hər iki fake-in `AddProductImage` metodunun imzasına `kind string` parametri əlavə et (indi 6 parametrli).

- [ ] **Step 5: Testləri işə sal**

```bash
cd avtopulse-backend && go test ./internal/listings/... -v
```

Gözlənilən: PASS, bütün mövcud 7 test keçir (`TestPublicListings_MergesShopAndUser`, `TestPublicListingDetail_ShopSource_Found`, və s.).

- [ ] **Step 6: Commit**

```bash
git add avtopulse-backend/internal/listings/
git commit -m "feat(backend): expose detailsJson/viewCount/kind on public listings API, increment view_count on detail fetch"
```

---

## Task 6: `auth`/`user` handler-ləri — `details` body sahəsi, `kind` form sahəsi

**Files:**
- Modify: `avtopulse-backend/internal/auth/handler.go`
- Modify: `avtopulse-backend/internal/user/handler.go`

**Interfaces:**
- Consumes: Task 3/4-ün yeni `CreateProductInput.DetailsJSON`, `AddProductImage(..., kind string)` imzaları.
- Produces: `POST/PUT /me/products` body-si `details: {...}` sahəsini qəbul edir; `POST /me/products/{id}/images` `kind` form sahəsini qəbul edir (yoxdursa default `"exterior"`) — Task 9-un frontend upload kodu bunu göndərəcək.

- [ ] **Step 1: `auth/handler.go`-da `createProductRequest`-ə `DetailsJson json.RawMessage` əlavə et**

Mövcud `createProductRequest` (aşağıda) artıq `Details string` sahəsini `json:"details"` ilə tutur (sadə mətn təsviri) — YENİ JSON obyekt sahəsi ayrı ad daşımalıdır, `json:"detailsJson"` açarı ilə (bu, wire-üzərində sabit ad — Task 8/9/10-da frontend eyni `detailsJson` açarından istifadə edir):

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

	DetailsJson json.RawMessage `json:"detailsJson"`
}
```

`"encoding/json"` importunu faylın başına əlavə et (yoxdursa).

- [ ] **Step 2: `CreateProduct`/`UpdateProduct`-da `shop.CreateProductInput{}`-a `DetailsJSON: body.DetailsJson` ötür**

```go
product, err := h.shopRepo.CreateProduct(req.Context(), shopID, shop.CreateProductInput{
	Name: body.Name, Title: body.Title, Details: body.Details,
	Marka: body.Marka, Model: body.Model, Il: body.Il,
	Qiymet: body.Qiymet, Yurus: body.Yurus, Yanacaq: body.Yanacaq, Ban: body.Ban,
	DetailsJSON: body.DetailsJson,
})
```

Eyni `DetailsJSON: body.DetailsJson` sətrini `UpdateProduct`-un `shop.CreateProductInput{}` literalına da əlavə et.

- [ ] **Step 3: `UploadProductImages`-ə `kind` form sahəsini oxu**

```go
kind := req.FormValue("kind")
if kind == "" {
	kind = "exterior"
}
```

`ParseMultipartForm`-dan sonra, `files := ...` sətrindən əvvəl əlavə et. `AddProductImage` çağırışını yenilə:

```go
img, err := h.shopRepo.AddProductImage(req.Context(), productID, minioURL, s3URL, i, kind)
```

- [ ] **Step 4: Eyni 3 dəyişikliyi `user/handler.go`-da tətbiq et**

`user/handler.go`-nun öz `createProductRequest`-i eyni forma daşıyır (`Details string` `json:"details"` artıq mövcuddur) — eyni qaydayla `DetailsJson json.RawMessage `json:"detailsJson"`` əlavə et, `CreateProduct`/`UpdateProduct`-da `user.CreateProductInput{..., DetailsJSON: body.DetailsJson}`, `UploadProductImages`-də `kind` form sahəsi + `h.repo.AddProductImage(req.Context(), productID, minioURL, s3URL, i, kind)`.

- [ ] **Step 5: Tam backend build et**

```bash
cd avtopulse-backend && go build ./...
```

Gözlənilən: PASS — bütün paketlər (shop, user, auth, listings) kompilyasiya olunur.

- [ ] **Step 6: Bütün backend testlərini işə sal**

```bash
cd avtopulse-backend && go test ./...
```

Gözlənilən: PASS.

- [ ] **Step 7: Commit**

```bash
git add avtopulse-backend/internal/auth/handler.go avtopulse-backend/internal/user/handler.go
git commit -m "feat(backend): accept details JSON body and image kind form field on create/update endpoints"
```

---

## Task 7: Backend deploy + canlı doğrulama

**Files:** (kod dəyişikliyi yoxdur — yalnız deploy)

**Interfaces:**
- Consumes: Task 1-6-nın bütün dəyişiklikləri.
- Produces: canlı serverdə işlək yeni API — Task 8/9/10 (frontend) bu canlı API-yə qarşı test olunacaq.

- [ ] **Step 1: Backend-i serverə rsync et və qur**

Mövcud işlək axın (əvvəlki fazalardan): `rsync` + serverdə `go build` + `systemctl restart avtopulse-backend`. Dəqiq komandalar üçün `my-servers/` cache-indəki AutoPulse server qeydinə bax.

- [ ] **Step 2: Mövcud 12+ real elanın hələ düzgün göründüyünü doğrula (geriyə uyğunluq)**

```bash
curl -s https://autopulse.157.180.73.79.sslip.io/api/listings | head -c 2000
```

Gözlənilən: 200, bütün mövcud elanlar görünür, `detailsJson: {}` (boş, defolt) mövcud sətirlər üçün, xəta yoxdur.

- [ ] **Step 3: Yeni `POST /me/products` ilə `details` göndərərək test elanı yarat**

```bash
curl -s -X POST https://autopulse.157.180.73.79.sslip.io/api/auth/me/products \
  -H "Content-Type: application/json" -b "<shop session cookie>" \
  -d '{"name":"test-details","title":"Test","marka":"Test","model":"Test","il":2024,"qiymet":10000,"detailsJson":{"rəng":"Ağ","ötürücü":"Ön"}}'
```

Gözlənilən: 201, cavabda `satıcıAd` avto444-un öz adı ilə doldurulmuş görünür (istifadəçinin göndərmədiyi sahə server tərəfindən əlavə olunub).

- [ ] **Step 4: Test elanını sil (canlı datanı çirkləndirməmək üçün)**

Yaradılan test elanının ID-sini tap və `DELETE`/`legv_edilib` statusuna keçir (mövcud `DeleteProduct` endpoint-i ilə) — canlı sistemə əlavə "zibil" elan qalmasın.

- [ ] **Step 5: `GET /api/listings/{source}/{id}`-i iki dəfə çağırıb `viewCount`-un artdığını doğrula**

```bash
curl -s https://autopulse.157.180.73.79.sslip.io/api/listings/shop/15 | grep viewCount
curl -s https://autopulse.157.180.73.79.sslip.io/api/listings/shop/15 | grep viewCount
```

Gözlənilən: ikinci çağırışda `viewCount` birinci ilə müqayisədə +1.

---

## Task 8: Frontend `ApiListing` tipi — `details`/`viewCount`/`kind` sahələri

**Files:**
- Modify: `src/api/listings.ts`

**Interfaces:**
- Consumes: Task 5-in `PublicListing.DetailsJSON`/`ViewCount`, `ImageOut.Kind` JSON çıxışı.
- Produces: `ApiListing.details: Record<string, unknown>`, `.viewCount: number`, `ApiListingImage.kind: string` — Task 10-un `RealListingDetail.tsx`-i bunlardan istifadə edəcək.

- [ ] **Step 1: `ApiListingImage`/`ApiListing` interfeyslərini genişləndir**

```typescript
export interface ApiListingImage {
  minioUrl: string;
  s3Url: string;
  sira: number;
  kind: 'exterior' | 'interior' | 'features' | 'doors';
}

// Shape of the JSON details blob a real listing may carry — every field is
// optional since older rows (pre-migration) store an empty `{}`.
export interface ApiListingDetails {
  şəhər?: string;
  ötürücü?: string;
  mühərrik?: string;
  rəng?: string;
  vəziyyət?: 'Yeni' | 'İşlənmiş';
  kredit?: boolean;
  barter?: boolean;
  həcm?: number;
  güc?: number;
  sürətlərQutusu?: number;
  yerlərSayı?: number;
  bazarÜçünYığılıb?: string;
  vuruğuVar?: boolean;
  rənglənib?: boolean;
  qəzalı?: boolean;
  təchizat?: string[];
  satıcıAd?: string;
  satıcıZəng?: string;
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
  detailsJson: ApiListingDetails;
  viewCount: number;
}
```

- [ ] **Step 2: `npx tsc -b --noEmit` işə sal**

```bash
cd /Users/frontend/workspace/me-github/autopulse && npx tsc -b --noEmit 2>&1 | head -40
```

Gözlənilən: `RealListingCard.tsx`/`RealListingDetail.tsx` hələ köhnə tipdən istifadə etdiyi üçün xəta yoxdur (yeni sahələr əlavədir, mövcud kod pozulmur).

- [ ] **Step 3: Commit**

```bash
git add src/api/listings.ts
git commit -m "feat(frontend): extend ApiListing type with detailsJson, viewCount, image kind"
```

---

## Task 9: `NewListing.tsx` — tam `details` obyektini backend-ə göndər

**Files:**
- Modify: `src/pages/NewListing.tsx`
- Modify: `src/api/auth.ts` (əgər `CreateListingInput` tipi burada təyin olunubsa)

**Interfaces:**
- Consumes: Task 8-in `ApiListingDetails` tipi, Task 6-nın `details`/`kind` qəbul edən endpoint-ləri.
- Produces: `formStateToCreateListingInput` bütün 20+ sahəni `details` obyektinə yığır; `uploadListingImages` çağırışları hər 4 tab üçün öz `kind`-i ilə göndərilir.

- [ ] **Step 1: `src/api/auth.ts`-də `CreateListingInput`-a `detailsJson` sahəsi əlavə et**

`grep -n "export interface CreateListingInput" src/api/auth.ts` ilə tap, struct-a əlavə et (bu, backend-in `createProductRequest.DetailsJson` sahəsinin `json:"detailsJson"` açarına uyğundur — Task 6 Step 1/4-də təyin olundu):

```typescript
detailsJson?: Record<string, unknown>;
```

`CreateListingInput`-u backend-ə göndərən `fetch` çağırışının (`createListing`/`updateUserListing`) body-ni `JSON.stringify`-a verdiyi yerə toxunmağa ehtiyac yoxdur — obyekt olduğu kimi serialasiya olunur, açar adı avtomatik `detailsJson` çıxır.

- [ ] **Step 2: `NewListing.tsx`-də `formStateToCreateListingInput`-u genişləndir**

```typescript
function formStateToCreateListingInput(form: NewListingFormState): CreateListingInput {
  return {
    marka: form.marka,
    model: form.model,
    il: form.il ?? 0,
    qiymet: parseInt(form.qiymət) || 0,
    yurus: parseInt(form.yürüş) || 0,
    yanacaq: form.mühərrikNövü === 'Elektro' ? 'Elektrik' : form.mühərrikNövü,
    ban: form.ban,
    title: `${form.marka} ${form.model}, ${form.il ?? ''}`.trim(),
    details: form.əlavəMəlumat,
    detailsJson: { // wire key: matches createProductRequest.DetailsJson `json:"detailsJson"` (Task 6)
      şəhər: form.şəhər,
      ötürücü: form.ötürücü,
      mühərrik: form.modifikasiya,
      rəng: form.rəng ?? undefined,
      vəziyyət: form.qəzalı ? 'İşlənmiş' : 'Yeni',
      kredit: form.kreditlə,
      barter: form.barterMümkündür,
      sürətlərQutusu: form.sürətlərQutusu ? SÜRƏT_QUTUSU_LIST.indexOf(form.sürətlərQutusu) + 1 : undefined,
      yerlərSayı: form.yerlərSayı ?? undefined,
      bazarÜçünYığılıb: form.bazarÜçünYığılıb,
      vuruğuVar: form.vuruğuVar,
      rənglənib: form.rənglənib,
      qəzalı: form.qəzalı,
      təchizat: form.təchizat,
    },
  };
}
```

(`sürətlərQutusu`-nun say kimi saxlanılması `Listing.sürətlərQutusu: number` tipinə uyğunluq üçündür — `SÜRƏT_QUTUSU_LIST.indexOf` faylda artıq mövcud sabitdən istifadə edir.)

- [ ] **Step 3: `listingToFormState`-i geriyə parse edəcək şəkildə genişləndir**

```typescript
function listingToFormState(listing: UserListingApi): NewListingFormState {
  const d = listing.detailsJson ?? {};
  return {
    kateqoriya: 'Minik',
    marka: listing.marka,
    model: listing.model,
    il: listing.il,
    ban: listing.ban,
    nəsil: 'Cari nəsil',
    mühərrikNövü: listing.yanacaq === 'Elektrik' ? 'Elektro' : listing.yanacaq,
    ötürücü: d.ötürücü ?? '',
    sürətlərQutusu: '',
    modifikasiya: d.mühərrik ?? '',
    yerlərSayı: d.yerlərSayı ?? null,
    rəng: d.rəng ?? null,
    bazarÜçünYığılıb: d.bazarÜçünYığılıb ?? '',
    yürüş: String(listing.yurus),
    yürüşVahidi: 'km',
    şəkillər: toListingPhotos(listing.images.map((img) => img.minioUrl), 'ext'),
    interyerŞəkillər: [],
    təchizatŞəkillər: [],
    qapılarŞəkillər: [],
    təchizat: d.təchizat ?? [],
    vuruğuVar: d.vuruğuVar ?? false,
    rənglənib: d.rənglənib ?? false,
    qəzalı: d.qəzalı ?? false,
    vinKod: '',
    əlavəMəlumat: listing.details,
    şəhər: d.şəhər ?? '',
    qiymət: String(listing.qiymet),
    valyuta: 'AZN',
    kreditlə: d.kredit ?? false,
    barterMümkündür: d.barter ?? false,
    ad: '',
    email: '',
    telefon: '',
  };
}
```

Bu addım üçün `UserListingApi` tipinə (`src/api/auth.ts`) da `detailsJson?: ApiListingDetails` sahəsi əlavə et.

- [ ] **Step 4: Şəkil upload-ları 4 kateqoriyalı `kind` ilə göndərəcək şəkildə `uploadListingImages`-i genişləndir**

`src/api/auth.ts`-də `uploadListingImages(id, files)` funksiyasını tap, `kind` parametri əlavə et:

```typescript
export async function uploadListingImages(id: number, files: File[], kind: 'exterior' | 'interior' | 'features' | 'doors' = 'exterior') {
  const form = new FormData();
  files.forEach((f) => form.append('images', f));
  form.append('kind', kind);
  // ...mövcud fetch çağırışı dəyişmir, sadəcə form-a kind əlavə olunur
}
```

`NewListing.tsx`-in `handleSubmit`-ində, hazırda yalnız `form.şəkillər` (exterior) yüklənir — bunu 4 tab-ın hamısını yükləyəcək şəkildə genişləndir:

```typescript
const uploadJobs: [ListingPhoto[], 'exterior' | 'interior' | 'features' | 'doors'][] = [
  [form.şəkillər, 'exterior'],
  [form.interyerŞəkillər, 'interior'],
  [form.təchizatŞəkillər, 'features'],
  [form.qapılarŞəkillər, 'doors'],
];

for (const [photos, kind] of uploadJobs) {
  const newFiles = onlyNewFiles(photos);
  if (newFiles.length === 0) continue;
  try {
    await uploadListingImages(listingId, newFiles, kind);
  } catch {
    setLoadError((prev) => prev ?? `Elan yadda saxlanıldı, amma ${kind} şəkilləri yüklənmədi.`);
  }
}
```

(`isLastStep`/`handleSubmit`-in create/edit hər iki qolunda mövcud tək-kateqoriyalı upload çağırışını bu dövrə ilə əvəz et; `listingId` — mövcud kodda `created.id`/`updated.id` dəyişənidir.)

- [ ] **Step 5: `npx tsc -b --noEmit` və `npm run build` işə sal**

```bash
cd /Users/frontend/workspace/me-github/autopulse && npx tsc -b --noEmit && npm run build
```

Gözlənilən: hər iki komanda PASS.

- [ ] **Step 6: Korrupsiya scan (layihə qaydası)**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/NewListing.tsx src/api/auth.ts src/api/listings.ts
```

Gözlənilən: nəticə boş.

- [ ] **Step 7: Commit**

```bash
git add src/pages/NewListing.tsx src/api/auth.ts
git commit -m "feat(frontend): NewListing wizard sends full details JSON and per-category image kind"
```

---

## Task 10: `RealListingDetail.tsx` — `ListingDetail.tsx`-in tam görünüşünə köçürülmə

**Files:**
- Modify: `src/pages/RealListingDetail.tsx`
- Modify: `src/pages/RealListingDetail.module.css`

**Interfaces:**
- Consumes: Task 8-in `ApiListing.detailsJson`/`viewCount`, `ApiListingImage.kind`; mövcud `src/components/InteractiveGallery.tsx`, `src/components/ListingDetailTabs.tsx` (mock sistemdən, silinməyib).
- Produces: real elan detalı mock-un zəngin görünüşünü göstərir — `InteractiveGallery`/`ListingDetailTabs` `Listing` tipi gözlədiyi üçün, real `ApiListing`-i həmin tipə map edən adapter funksiyası əlavə olunur (mock komponentlərinin özü dəyişmir).

- [ ] **Step 1: `apiListingToMockShape` adapter funksiyasını yaz**

`InteractiveGallery`/`ListingDetailTabs` `Listing` tipini gözləyir (bax `src/types/index.ts`). Real `ApiListing`-i bu şəklə çevirən, `RealListingDetail.tsx`-in başına bir funksiya əlavə et:

```typescript
import type { Listing } from '../types';

function apiListingToMockShape(l: ApiListing): Listing {
  const d = l.detailsJson ?? {};
  return {
    id: `${l.source}-${l.id}`,
    marka: l.marka,
    model: l.model,
    il: l.il,
    qiymət: l.qiymet,
    şəhər: d.şəhər ?? '',
    yürüş: l.yurus,
    yanacaq: (l.yanacaq as Listing['yanacaq']) || 'Benzin',
    ban: l.ban,
    ötürücü: d.ötürücü ?? '',
    mühərrik: d.mühərrik ?? '',
    rəng: d.rəng ?? '',
    vəziyyət: d.vəziyyət ?? 'İşlənmiş',
    kredit: d.kredit ?? false,
    barter: d.barter ?? false,
    təsvir: l.details,
    şəkillər: l.images.filter((i) => i.kind === 'exterior').map((i) => i.minioUrl || i.s3Url),
    interyerŞəkillər: l.images.filter((i) => i.kind === 'interior').map((i) => i.minioUrl || i.s3Url),
    təchizatŞəkillər: l.images.filter((i) => i.kind === 'features').map((i) => i.minioUrl || i.s3Url),
    qapılarŞəkillər: l.images.filter((i) => i.kind === 'doors').map((i) => i.minioUrl || i.s3Url),
    satıcıAd: d.satıcıAd ?? l.sellerName,
    satıcıZəng: d.satıcıZəng ?? '',
    satıcıÜzvlükTarixi: new Date().toISOString(),
    tarix: new Date().toISOString(),
    baxışSayı: l.viewCount,
    vipTier: 'standart',
    həcm: d.həcm ?? 0,
    güc: d.güc ?? 0,
    sürətlərQutusu: d.sürətlərQutusu ?? 0,
    satıcıTipi: l.sellerType,
    yerlərSayı: d.yerlərSayı ?? 0,
    bazarÜçünYığılıb: d.bazarÜçünYığılıb ?? '',
    vuruğuVar: d.vuruğuVar ?? false,
    rənglənib: d.rənglənib ?? false,
    qəzalı: d.qəzalı ?? false,
    təchizat: d.təchizat ?? [],
  };
}
```

Real elanlarda `exterior`-a düşməyən köhnə (Task 1-dən əvvəl yaradılmış, `kind` sütunu defolt `'exterior'` olan) şəkillər hələ də `şəkillər`-ə düşür — geriyə uyğunluq qorunur.

- [ ] **Step 2: `RealListingDetail`-in JSX-ini `ListingDetail.tsx`-in strukturuna uyğun yenidən yaz**

```tsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getRealListingById } from '../api/listings';
import type { ApiListing } from '../api/listings';
import type { Listing } from '../types';
import InteractiveGallery from '../components/InteractiveGallery';
import ListingDetailTabs from '../components/ListingDetailTabs';
import styles from './RealListingDetail.module.css';

// ... apiListingToMockShape burada (Step 1) ...

export default function RealListingDetail() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [sellerName, setSellerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [phoneRevealed, setPhoneRevealed] = useState(false);

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
          setListing(apiListingToMockShape(detail));
          setSellerName(detail.sellerName);
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

  const maskedPhone = listing.satıcıZəng
    ? listing.satıcıZəng.replace(/(\+994\d{2})\d{3}(\d{2})(\d{2})/, '$1 XXX $2 $3')
    : '';

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to="/elanlar">{listing.marka || 'Elanlar'}</Link>
        {listing.model && (
          <>
            <span className={styles.breadcrumbSep}>·</span>
            <span className={styles.breadcrumbCurrent}>{listing.model}</span>
          </>
        )}
      </div>

      <div className={styles.container}>
        <div className={styles.main}>
          <InteractiveGallery listing={listing} />

          <h1 className={styles.title}>
            {listing.marka} {listing.model}
          </h1>
          <p className={styles.meta}>
            {listing.il} · {listing.şəhər} · {listing.yürüş.toLocaleString()} km
          </p>
          <p className={styles.subMeta}>👁 {listing.baxışSayı.toLocaleString()} baxış</p>

          <ListingDetailTabs listing={listing} similar={[]} />
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.contactCard}>
            <div className={styles.price}>{listing.qiymət.toLocaleString()} ₼</div>
            <div className={styles.featureRow}>
              {listing.kredit && <span className={styles.feature}>Kredit</span>}
              {listing.barter && <span className={styles.feature}>Barter</span>}
            </div>

            <div className={styles.cardDivider} />

            <div className={styles.sellerRow}>
              <span className={styles.sellerTypeBadge}>
                {listing.satıcıTipi === 'diler' ? 'Diler / Salon' : 'Şəxsi'}
              </span>
              {sellerName && (
                <Link to={`/magazalar/${sellerName}`} className={styles.sellerName}>
                  {sellerName} →
                </Link>
              )}
            </div>

            {listing.satıcıAd && !sellerName && (
              <p className={styles.sellerName}>{listing.satıcıAd}</p>
            )}

            {listing.satıcıZəng && (
              <button className={styles.btnCall} onClick={() => setPhoneRevealed(true)}>
                📞 {phoneRevealed ? listing.satıcıZəng : `Nömrəni göstər · ${maskedPhone}`}
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
```

Qeyd: `sellerName` (mağaza adı → link) yalnız `sellerType === 'diler'` üçün doludur (`sellerName` boşdursa link göstərilmir); `listing.satıcıAd`/`satıcıZəng` istifadəçi elanları üçün `detailsJson`-dan gəlir və "Zəng et" düyməsi yalnız `satıcıZəng` doluysa görünür.

- [ ] **Step 3: `RealListingDetail.module.css`-ə çatışmayan sinifləri əlavə et**

`ListingDetail.module.css`-dəki `.featureRow`, `.feature`, `.sellerTypeBadge`, `.btnCall`, `.cardDivider` siniflərini `RealListingDetail.module.css`-də olmayanları köçür (mövcud `.sellerName`, `.contactCard`, `.price` artıq var). `ListingDetail.module.css`-i `Read` edib eyni dəyərləri (rənglər, padding) köçür ki, iki səhifə arasında vizual fərq olmasın.

- [ ] **Step 4: `RealListingCard.tsx`-in şəkil seçimini `kind === 'exterior'`-a üstünlük verəcək şəkildə yenilə (kart görünüşündə interyer şəkli çıxmasın)**

```typescript
const image = listing.images.find((img) => img.kind === 'exterior') ?? listing.images[0];
```

- [ ] **Step 5: `npx tsc -b --noEmit` və `npm run build`**

```bash
cd /Users/frontend/workspace/me-github/autopulse && npx tsc -b --noEmit && npm run build
```

Gözlənilən: PASS.

- [ ] **Step 6: Korrupsiya scan**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/RealListingDetail.tsx src/pages/RealListingDetail.module.css src/components/RealListingCard.tsx
```

Gözlənilən: boş.

- [ ] **Step 7: Commit**

```bash
git add src/pages/RealListingDetail.tsx src/pages/RealListingDetail.module.css src/components/RealListingCard.tsx
git commit -m "feat(frontend): RealListingDetail shows full gallery-tabs-contact view matching mock ListingDetail"
```

---

## Task 11: Frontend deploy + tam canlı doğrulama

**Files:** (kod dəyişikliyi yoxdur — yalnız deploy + manual doğrulama)

**Interfaces:**
- Consumes: Task 7-10-un bütün dəyişiklikləri.

- [ ] **Step 1: Deploy et**

```bash
git push origin main
bash deploy/deploy.sh
```

- [ ] **Step 2: Mövcud real elanın (Task 7 dəyişməmiş datası) hələ düzgün göründüyünü doğrula**

`https://autopulse.157.180.73.79.sslip.io/elan/shop-15` (Mercedes C200, avto444) aç, öncəki sadə görünüşün əvəzinə indi tam (qalereya/tab/sidebar) görünüş göstərdiyini, boş `detailsJson` sahələrinin xəta vermədən (boş/defolt) göstərildiyini yoxla.

- [ ] **Step 3: Yeni bir real elan yarat, bütün 6 addımı doldur, bütün 4 kateqoriyaya şəkil yüklə**

`/elan-ver`-dən keç, hər addımda tələb olunan sahələri (rəng, ötürücü, yerlərin sayı, təchizat, şəhər, s.) doldur, Exterior/Interior/Key features/Doors tab-larının hamısına şəkil əlavə et, təsdiqlə.

- [ ] **Step 4: Yaradılan elanın detalını aç, bütün sahələrin göründüyünü doğrula**

Gözlənilən: mühərrik/ötürücü/rəng/vəziyyət/təchizat spesifikasiya cədvəlində görünür, 4 qalereya kateqoriyası düzgün ayrılıb, baxış sayı səhifəni yenidən açdıqca artır, satıcı əlaqə kartında (istifadəçi elanıdırsa) ad+telefon görünür.

- [ ] **Step 5: Mağaza elanı üçün eyni yoxlamanı təkrarla — "Zəng et" düyməsinin görünmədiyini (mağaza telefon göstərmir), mağaza adının linkli göründüyünü təsdiqlə**

- [ ] **Step 6: Nəticəni istifadəçiyə raportla**

Yaradılan test elanlarının linklərini paylaş, hər addımın gözlənilən nəticəyə uyğun olduğunu qeyd et.
