package listings

import (
	"context"
	"encoding/json"
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

func TestPublicListings_UserListing_HidesIdentity(t *testing.T) {
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

	var out []PublicListing
	if err := json.NewDecoder(rec.Body).Decode(&out); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}

	var found bool
	for _, item := range out {
		if item.Source == "user" && item.ID == 5 {
			found = true
			if item.SellerName != "" {
				t.Fatalf("expected empty SellerName for user listing, got %q", item.SellerName)
			}
			if item.SellerType != "şəxsi" {
				t.Fatalf("expected SellerType 'şəxsi' for user listing, got %q", item.SellerType)
			}
		}
	}
	if !found {
		t.Fatalf("expected to find user listing with id 5 in response, got: %+v", out)
	}
}

func TestPublicListingDetail_ShopSource_ExposesShopIdentity(t *testing.T) {
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

	var out PublicListing
	if err := json.NewDecoder(rec.Body).Decode(&out); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}

	if out.SellerName != "avto444" {
		t.Fatalf("expected SellerName 'avto444', got %q", out.SellerName)
	}
	if out.SellerType != "diler" {
		t.Fatalf("expected SellerType 'diler', got %q", out.SellerType)
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
