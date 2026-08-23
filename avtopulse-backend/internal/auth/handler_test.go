package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"golang.org/x/crypto/bcrypt"
)

type fakeShopRepo struct {
	byName             map[string]*shop.Shop
	byID               map[int64]*shop.Shop
	hashes             map[int64]string
	passwordHashNotFnd bool
}

func (f *fakeShopRepo) ListShops(ctx context.Context) ([]shop.ShopSummary, error) { return nil, nil }

func (f *fakeShopRepo) GetShopByName(ctx context.Context, name string) (*shop.Shop, error) {
	s, ok := f.byName[name]
	if !ok {
		return nil, shop.ErrNotFound
	}
	return s, nil
}

func (f *fakeShopRepo) GetShopByID(ctx context.Context, id int64) (*shop.Shop, error) {
	s, ok := f.byID[id]
	if !ok {
		return nil, shop.ErrNotFound
	}
	return s, nil
}

func (f *fakeShopRepo) ListProducts(ctx context.Context, shopID int64, onlyStatus string) ([]shop.Product, error) {
	return []shop.Product{{ID: 1, Name: "bmw-320i", Title: "BMW 320i"}}, nil
}

func (f *fakeShopRepo) GetPasswordHash(ctx context.Context, shopID int64) (string, error) {
	if f.passwordHashNotFnd {
		return "", shop.ErrNotFound
	}
	h, ok := f.hashes[shopID]
	if !ok {
		return "", shop.ErrNotFound
	}
	return h, nil
}

func (f *fakeShopRepo) CreateProduct(ctx context.Context, shopID int64, input shop.CreateProductInput) (*shop.Product, error) {
	return &shop.Product{ID: 999, Name: input.Name, Title: input.Title, Marka: input.Marka, Model: input.Model, Il: input.Il, Qiymet: input.Qiymet, Images: []shop.ProductImage{}}, nil
}

func (f *fakeShopRepo) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int) (*shop.ProductImage, error) {
	return &shop.ProductImage{ID: int64(sira + 1), MinioURL: minioURL, S3URL: s3URL, Sira: sira}, nil
}

func (f *fakeShopRepo) GetProductShopID(ctx context.Context, productID int64) (int64, error) {
	return 1, nil
}

func (f *fakeShopRepo) SetShopLogo(ctx context.Context, shopID int64, url string) error {
	return nil
}

func (f *fakeShopRepo) UpdateProduct(ctx context.Context, productID int64, input shop.CreateProductInput) (*shop.Product, error) {
	return &shop.Product{ID: productID, Name: input.Name, Title: input.Title, Marka: input.Marka, Model: input.Model, Il: input.Il, Qiymet: input.Qiymet, Images: []shop.ProductImage{}}, nil
}

func (f *fakeShopRepo) DeleteProduct(ctx context.Context, productID int64) error {
	return nil
}

func (f *fakeShopRepo) RestoreProduct(ctx context.Context, productID int64) error {
	return nil
}

func (f *fakeShopRepo) GetImageProductID(ctx context.Context, imageID int64) (int64, error) {
	return 1, nil
}

func (f *fakeShopRepo) ListAllProducts(ctx context.Context) ([]shop.Product, error) {
	return nil, nil
}

func (f *fakeShopRepo) ListActiveProducts(ctx context.Context) ([]shop.ProductWithShopName, error) {
	return nil, nil
}

func (f *fakeShopRepo) DeleteProductImage(ctx context.Context, imageID int64) error {
	return nil
}

type fakeStorageClient struct{}

func (f *fakeStorageClient) Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, error) {
	return "http://fake-storage/" + path, nil
}

func (f *fakeStorageClient) UploadDual(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, string, error) {
	return "http://fake-storage/" + path, "http://fake-s3/" + path, nil
}

type fakeSessionStore struct {
	tokenToShop map[string]int64
	deleteFails bool
}

func newFakeSessionStore() *fakeSessionStore {
	return &fakeSessionStore{tokenToShop: map[string]int64{}}
}

func (f *fakeSessionStore) Create(ctx context.Context, shopID int64) (string, error) {
	token := "test-token"
	f.tokenToShop[token] = shopID
	return token, nil
}

func (f *fakeSessionStore) Lookup(ctx context.Context, token string) (int64, error) {
	id, ok := f.tokenToShop[token]
	if !ok {
		return 0, ErrSessionNotFound
	}
	return id, nil
}

func (f *fakeSessionStore) Delete(ctx context.Context, token string) error {
	if f.deleteFails {
		return errors.New("delete failed")
	}
	delete(f.tokenToShop, token)
	return nil
}

func newFakeShopRepo() *fakeShopRepo {
	hash, _ := bcrypt.GenerateFromPassword([]byte("correct-password"), 4)
	s := &shop.Shop{ID: 1, Name: "avto444", Title: "Avto 444"}
	return &fakeShopRepo{
		byName: map[string]*shop.Shop{"avto444": s},
		byID:   map[int64]*shop.Shop{1: s},
		hashes: map[int64]string{1: string(hash)},
	}
}

func TestLogin_Success_SetsCookie(t *testing.T) {
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore(), &fakeStorageClient{})
	body, _ := json.Marshal(loginRequest{Name: "avto444", Password: "correct-password"})
	req := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}

	cookies := rec.Result().Cookies()
	var found bool
	for _, c := range cookies {
		if c.Name == cookieName {
			found = true
			if !c.HttpOnly {
				t.Fatal("expected cookie to be HttpOnly")
			}
			if c.SameSite != http.SameSiteLaxMode {
				t.Fatal("expected cookie SameSite=Lax")
			}
		}
	}
	if !found {
		t.Fatal("expected shop_session cookie to be set")
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore(), &fakeStorageClient{})
	body, _ := json.Marshal(loginRequest{Name: "avto444", Password: "wrong-password"})
	req := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestMeProducts_NoCookie(t *testing.T) {
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore(), &fakeStorageClient{})
	req := httptest.NewRequest(http.MethodGet, "/me/products", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestMeProducts_WithValidCookie(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(newFakeShopRepo(), sessions, &fakeStorageClient{})
	req := httptest.NewRequest(http.MethodGet, "/me/products", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestLogout_ClearsSession(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(newFakeShopRepo(), sessions, &fakeStorageClient{})
	req := httptest.NewRequest(http.MethodPost, "/logout", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	if _, err := sessions.Lookup(context.Background(), token); err == nil {
		t.Fatal("expected session to be deleted after logout")
	}
}

func TestLogout_DeleteFails_ReturnsInternalError(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)
	sessions.deleteFails = true

	h := NewHandler(newFakeShopRepo(), sessions, &fakeStorageClient{})
	req := httptest.NewRequest(http.MethodPost, "/logout", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 when session delete fails, got %d", rec.Code)
	}

	for _, c := range rec.Result().Cookies() {
		if c.Name == cookieName {
			t.Fatal("expected cookie not to be cleared when session delete fails")
		}
	}

	if _, err := sessions.Lookup(context.Background(), token); err != nil {
		t.Fatal("expected session to still be valid when delete fails")
	}
}

func TestCreateProduct_Success(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(newFakeShopRepo(), sessions, &fakeStorageClient{})
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
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore(), &fakeStorageClient{})
	body, _ := json.Marshal(createProductRequest{Name: "x", Title: "x"})
	req := httptest.NewRequest(http.MethodPost, "/me/products", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestLogin_PasswordHashNotFound_ReturnsUnauthorized(t *testing.T) {
	repo := newFakeShopRepo()
	repo.passwordHashNotFnd = true

	h := NewHandler(repo, newFakeSessionStore(), &fakeStorageClient{})
	body, _ := json.Marshal(loginRequest{Name: "avto444", Password: "correct-password"})
	req := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 when GetPasswordHash returns ErrNotFound, got %d, body: %s", rec.Code, rec.Body.String())
	}
}

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
	if len(got) != 1 || got[0].MinioURL == "" || got[0].S3URL == "" {
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
	token, _ := sessions.Create(context.Background(), 999) // fakeShopRepo.GetProductShopID always returns 1

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
