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
func (f *fakeUserRepo) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int, kind string) (*user.ProductImage, error) {
	return nil, nil
}

func (f *fakeUserRepo) IncrementViewCount(ctx context.Context, productID int64) error {
	return nil
}
func (f *fakeUserRepo) PromoteProduct(ctx context.Context, productID int64, tier string, price int) (*user.Product, error) {
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
func (f *fakeUserRepo) ListActiveProducts(ctx context.Context) ([]user.Product, error) {
	return nil, nil
}

type fakeShopRepo struct {
	products map[int64]shop.Product
}

func (f *fakeShopRepo) ListShops(ctx context.Context) ([]shop.ShopSummary, error)     { return nil, nil }
func (f *fakeShopRepo) GetShopByName(ctx context.Context, name string) (*shop.Shop, error) {
	return nil, nil
}
func (f *fakeShopRepo) GetShopByID(ctx context.Context, id int64) (*shop.Shop, error) { return nil, nil }
func (f *fakeShopRepo) GetShopByEmail(ctx context.Context, email string) (*shop.Shop, error) {
	return nil, nil
}
func (f *fakeShopRepo) CreateShop(ctx context.Context, input shop.CreateShopInput) (*shop.Shop, error) {
	return nil, nil
}
func (f *fakeShopRepo) ListProducts(ctx context.Context, shopID int64, onlyStatus string) ([]shop.Product, error) {
	return nil, nil
}
func (f *fakeShopRepo) GetPasswordHash(ctx context.Context, shopID int64) (string, error) {
	return "", nil
}
func (f *fakeShopRepo) CreateProduct(ctx context.Context, shopID int64, input shop.CreateProductInput) (*shop.Product, error) {
	return nil, nil
}
func (f *fakeShopRepo) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int, kind string) (*shop.ProductImage, error) {
	return nil, nil
}

func (f *fakeShopRepo) IncrementViewCount(ctx context.Context, productID int64) error {
	return nil
}
func (f *fakeShopRepo) PromoteProduct(ctx context.Context, productID int64, tier string, price int) (*shop.Product, error) {
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
func (f *fakeShopRepo) ListActiveProducts(ctx context.Context) ([]shop.ProductWithShopName, error) {
	return nil, nil
}
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
