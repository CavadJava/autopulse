package shop

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

type fakeRepo struct {
	shops          []ShopSummary
	byName         map[string]*Shop
	byID           map[int64]*Shop
	products       map[int64][]Product
	passwordHashes map[string]string
}

func (f *fakeRepo) ListShops(ctx context.Context) ([]ShopSummary, error) { return f.shops, nil }

func (f *fakeRepo) GetShopByName(ctx context.Context, name string) (*Shop, error) {
	s, ok := f.byName[name]
	if !ok {
		return nil, ErrNotFound
	}
	return s, nil
}

func (f *fakeRepo) GetShopByEmail(ctx context.Context, email string) (*Shop, error) {
	for _, s := range f.byName {
		if s.Email == email {
			return s, nil
		}
	}
	return nil, ErrNotFound
}

func (f *fakeRepo) CreateShop(ctx context.Context, input CreateShopInput) (*Shop, error) {
	if _, exists := f.byName[input.Name]; exists {
		return nil, ErrDuplicate
	}
	for _, s := range f.byName {
		if s.Email == input.Email {
			return nil, ErrDuplicate
		}
	}
	s := &Shop{ID: int64(len(f.byName) + 1), Name: input.Name, Title: input.Title, Email: input.Email}
	f.byName[input.Name] = s
	if f.byID == nil {
		f.byID = map[int64]*Shop{}
	}
	f.byID[s.ID] = s
	return s, nil
}

func (f *fakeRepo) GetShopByID(ctx context.Context, id int64) (*Shop, error) {
	s, ok := f.byID[id]
	if !ok {
		return nil, ErrNotFound
	}
	return s, nil
}

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

func (f *fakeRepo) GetPasswordHash(ctx context.Context, shopID int64) (string, error) {
	s, ok := f.byID[shopID]
	if !ok {
		return "", ErrNotFound
	}
	return f.passwordHashes[s.Name], nil
}

func (f *fakeRepo) CreateProduct(ctx context.Context, shopID int64, input CreateProductInput) (*Product, error) {
	p := &Product{
		ID: int64(len(f.products[shopID]) + 100), Name: input.Name, Title: input.Title, Details: input.Details,
		Marka: input.Marka, Model: input.Model, Il: input.Il, Qiymet: input.Qiymet, Yurus: input.Yurus, Yanacaq: input.Yanacaq, Ban: input.Ban,
		Status: "saytda",
		Images: []ProductImage{},
	}
	f.products[shopID] = append(f.products[shopID], *p)
	return p, nil
}

func (f *fakeRepo) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int) (*ProductImage, error) {
	return &ProductImage{ID: int64(sira + 1), MinioURL: minioURL, S3URL: s3URL, Sira: sira}, nil
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

func (f *fakeRepo) UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error) {
	for shopID, products := range f.products {
		for i, p := range products {
			if p.ID == productID {
				updated := Product{
					ID: productID, Name: input.Name, Title: input.Title, Details: input.Details,
					Marka: input.Marka, Model: input.Model, Il: input.Il, Qiymet: input.Qiymet,
					Yurus: input.Yurus, Yanacaq: input.Yanacaq, Ban: input.Ban, Status: p.Status, Images: p.Images,
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

func (f *fakeRepo) GetImageProductID(ctx context.Context, imageID int64) (int64, error) {
	return 1, nil
}

func (f *fakeRepo) DeleteProductImage(ctx context.Context, imageID int64) error {
	return nil
}

func (f *fakeRepo) ListAllProducts(ctx context.Context) ([]Product, error) {
	out := []Product{}
	for _, products := range f.products {
		out = append(out, products...)
	}
	return out, nil
}

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

func newFakeRepo() *fakeRepo {
	s := &Shop{ID: 1, Name: "avto444", Title: "Avto 444"}
	hash, _ := bcrypt.GenerateFromPassword([]byte("test-pass"), 4)
	return &fakeRepo{
		shops:  []ShopSummary{{ID: 1, Name: "avto444", Title: "Avto 444"}},
		byName: map[string]*Shop{"avto444": s},
		byID:   map[int64]*Shop{1: s},
		products: map[int64][]Product{
			1: {{ID: 10, Name: "bmw-320i", Title: "BMW 320i, 2020", Status: "saytda"}},
		},
		passwordHashes: map[string]string{"avto444": string(hash)},
	}
}

func TestListShops(t *testing.T) {
	h := NewHandler(newFakeRepo())
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got []ShopSummary
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(got) != 1 || got[0].Name != "avto444" {
		t.Fatalf("unexpected body: %+v", got)
	}
}

func TestListShops_EmptyIsJSONArrayNotNull(t *testing.T) {
	h := NewHandler(&fakeRepo{shops: []ShopSummary{}})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	body := rec.Body.String()
	if body != "[]\n" && body != "[]" {
		t.Fatalf("expected JSON array `[]` for empty shop list, got %q", body)
	}
}

func TestGetShopByName_EmptyDetailsAndWorkTimes(t *testing.T) {
	s := &Shop{ID: 2, Name: "empty-fields-shop", Title: "Empty Fields Shop", Details: "", WorkTimes: ""}
	repo := &fakeRepo{
		byName: map[string]*Shop{"empty-fields-shop": s},
		byID:   map[int64]*Shop{2: s},
	}
	h := NewHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/by-name/empty-fields-shop", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got Shop
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if got.Details != "" || got.WorkTimes != "" {
		t.Fatalf("expected empty Details/WorkTimes, got %+v", got)
	}
}

func TestListProducts_EmptyDetails(t *testing.T) {
	repo := &fakeRepo{
		byID: map[int64]*Shop{1: {ID: 1, Name: "avto444"}},
		products: map[int64][]Product{
			1: {{ID: 20, Name: "no-details-product", Title: "No Details", Details: "", Status: "saytda"}},
		},
	}
	h := NewHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/1/products", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got []Product
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(got) != 1 || got[0].Details != "" {
		t.Fatalf("unexpected body: %+v", got)
	}
}

func TestGetShopByName_Found(t *testing.T) {
	h := NewHandler(newFakeRepo())
	req := httptest.NewRequest(http.MethodGet, "/by-name/avto444", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestGetShopByName_NotFound(t *testing.T) {
	h := NewHandler(newFakeRepo())
	req := httptest.NewRequest(http.MethodGet, "/by-name/does-not-exist", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestListProducts_Found(t *testing.T) {
	h := NewHandler(newFakeRepo())
	req := httptest.NewRequest(http.MethodGet, "/1/products", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got []Product
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(got) != 1 || got[0].Name != "bmw-320i" {
		t.Fatalf("unexpected body: %+v", got)
	}
}

func TestListProducts_ShopNotFound(t *testing.T) {
	h := NewHandler(newFakeRepo())
	req := httptest.NewRequest(http.MethodGet, "/999/products", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
