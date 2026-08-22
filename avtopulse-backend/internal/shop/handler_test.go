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

func (f *fakeRepo) GetShopByID(ctx context.Context, id int64) (*Shop, error) {
	s, ok := f.byID[id]
	if !ok {
		return nil, ErrNotFound
	}
	return s, nil
}

func (f *fakeRepo) ListProducts(ctx context.Context, shopID int64) ([]Product, error) {
	return f.products[shopID], nil
}

func (f *fakeRepo) GetPasswordHash(ctx context.Context, shopID int64) (string, error) {
	s, ok := f.byID[shopID]
	if !ok {
		return "", ErrNotFound
	}
	return f.passwordHashes[s.Name], nil
}

func newFakeRepo() *fakeRepo {
	s := &Shop{ID: 1, Name: "avto444", Title: "Avto 444"}
	hash, _ := bcrypt.GenerateFromPassword([]byte("test-pass"), 4)
	return &fakeRepo{
		shops:  []ShopSummary{{ID: 1, Name: "avto444", Title: "Avto 444"}},
		byName: map[string]*Shop{"avto444": s},
		byID:   map[int64]*Shop{1: s},
		products: map[int64][]Product{
			1: {{ID: 10, Name: "bmw-320i", Title: "BMW 320i, 2020"}},
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
