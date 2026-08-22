package user

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
)

type fakeUserRepo struct {
	products map[int64]Product
	nextID   int64
}

func newFakeUserRepo() *fakeUserRepo {
	return &fakeUserRepo{products: map[int64]Product{}, nextID: 100}
}

func (f *fakeUserRepo) FindOrCreateByPhone(ctx context.Context, phone string) (*User, error) {
	return &User{ID: 1, Phone: phone}, nil
}

func (f *fakeUserRepo) ListMyProducts(ctx context.Context, userID int64) ([]Product, error) {
	out := []Product{}
	for _, p := range f.products {
		if p.UserID == userID {
			out = append(out, p)
		}
	}
	return out, nil
}

func (f *fakeUserRepo) CreateProduct(ctx context.Context, userID int64, input CreateProductInput) (*Product, error) {
	id := f.nextID
	f.nextID++
	p := Product{ID: id, UserID: userID, Marka: input.Marka, Title: input.Title, Status: "gozlemede", Images: []ProductImage{}}
	f.products[id] = p
	return &p, nil
}

func (f *fakeUserRepo) UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error) {
	p, ok := f.products[productID]
	if !ok {
		return nil, ErrNotFound
	}
	p.Title = input.Title
	f.products[productID] = p
	return &p, nil
}

func (f *fakeUserRepo) DeleteProduct(ctx context.Context, productID int64) error {
	p, ok := f.products[productID]
	if !ok {
		return ErrNotFound
	}
	p.Status = "legv_edilib"
	f.products[productID] = p
	return nil
}

func (f *fakeUserRepo) GetProductUserID(ctx context.Context, productID int64) (int64, error) {
	p, ok := f.products[productID]
	if !ok {
		return 0, ErrNotFound
	}
	return p.UserID, nil
}

func (f *fakeUserRepo) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int) (*ProductImage, error) {
	return &ProductImage{ID: int64(sira + 1), MinioURL: minioURL, S3URL: s3URL, Sira: sira}, nil
}

type fakeStorageClient struct{}

func (f *fakeStorageClient) Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, error) {
	return "http://fake-storage/" + path, nil
}

func (f *fakeStorageClient) UploadDual(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, string, error) {
	return "http://fake-storage/" + path, "http://fake-s3/" + path, nil
}

type fakeSessionStore struct {
	tokenToUser map[string]int64
	deleteFails bool
}

func newFakeSessionStore() *fakeSessionStore {
	return &fakeSessionStore{tokenToUser: map[string]int64{}}
}

func (f *fakeSessionStore) Create(ctx context.Context, userID int64) (string, error) {
	token := "test-token"
	f.tokenToUser[token] = userID
	return token, nil
}

func (f *fakeSessionStore) Lookup(ctx context.Context, token string) (int64, error) {
	id, ok := f.tokenToUser[token]
	if !ok {
		return 0, ErrSessionNotFound
	}
	return id, nil
}

func (f *fakeSessionStore) Delete(ctx context.Context, token string) error {
	if f.deleteFails {
		return errors.New("delete failed")
	}
	delete(f.tokenToUser, token)
	return nil
}

func TestVerifyOTP_CorrectCode_SetsCookie(t *testing.T) {
	h := NewHandler(newFakeUserRepo(), newFakeSessionStore(), &fakeStorageClient{})
	body, _ := json.Marshal(otpVerifyBody{Phone: "0501234567", Code: "1234"})
	req := httptest.NewRequest(http.MethodPost, "/otp/verify", bytes.NewReader(body))
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
		t.Fatal("expected user_session cookie to be set")
	}
}

func TestVerifyOTP_WrongCode_Unauthorized(t *testing.T) {
	h := NewHandler(newFakeUserRepo(), newFakeSessionStore(), &fakeStorageClient{})
	body, _ := json.Marshal(otpVerifyBody{Phone: "0501234567", Code: "0000"})
	req := httptest.NewRequest(http.MethodPost, "/otp/verify", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestMeProducts_NoCookie(t *testing.T) {
	h := NewHandler(newFakeUserRepo(), newFakeSessionStore(), &fakeStorageClient{})
	req := httptest.NewRequest(http.MethodGet, "/me/products", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestCreateProduct_Success(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(newFakeUserRepo(), sessions, &fakeStorageClient{})
	body, _ := json.Marshal(createProductRequest{Marka: "Toyota", Title: "Camry"})
	req := httptest.NewRequest(http.MethodPost, "/me/products", bytes.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d, body: %s", rec.Code, rec.Body.String())
	}
	var got Product
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if got.Status != "gozlemede" {
		t.Fatalf("expected new listing to start as gozlemede, got %q", got.Status)
	}
}

func TestUpdateProduct_WrongUser(t *testing.T) {
	repo := newFakeUserRepo()
	repo.products[100] = Product{ID: 100, UserID: 1, Status: "saytda"}

	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 999) // a user that doesn't own product 100

	h := NewHandler(repo, sessions, &fakeStorageClient{})
	body, _ := json.Marshal(createProductRequest{Title: "x"})
	req := httptest.NewRequest(http.MethodPut, "/me/products/100", bytes.NewReader(body))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteProduct_Success(t *testing.T) {
	repo := newFakeUserRepo()
	repo.products[100] = Product{ID: 100, UserID: 1, Status: "saytda"}

	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(repo, sessions, &fakeStorageClient{})
	req := httptest.NewRequest(http.MethodDelete, "/me/products/100", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
	if repo.products[100].Status != "legv_edilib" {
		t.Fatalf("expected status legv_edilib after delete, got %q", repo.products[100].Status)
	}
}

func TestUploadProductImages_Success(t *testing.T) {
	repo := newFakeUserRepo()
	repo.products[100] = Product{ID: 100, UserID: 1, Status: "saytda"}

	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(repo, sessions, &fakeStorageClient{})

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("images", "test.jpg")
	fw.Write([]byte("fake image bytes"))
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/me/products/100/images", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
	var got []ProductImage
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(got) != 1 || got[0].MinioURL == "" || got[0].S3URL == "" {
		t.Fatalf("unexpected result: %+v", got)
	}
}
