package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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

func (f *fakeShopRepo) ListProducts(ctx context.Context, shopID int64) ([]shop.Product, error) {
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
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore())
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
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore())
	body, _ := json.Marshal(loginRequest{Name: "avto444", Password: "wrong-password"})
	req := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestMeProducts_NoCookie(t *testing.T) {
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore())
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

	h := NewHandler(newFakeShopRepo(), sessions)
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

	h := NewHandler(newFakeShopRepo(), sessions)
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

	h := NewHandler(newFakeShopRepo(), sessions)
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

func TestLogin_PasswordHashNotFound_ReturnsUnauthorized(t *testing.T) {
	repo := newFakeShopRepo()
	repo.passwordHashNotFnd = true

	h := NewHandler(repo, newFakeSessionStore())
	body, _ := json.Marshal(loginRequest{Name: "avto444", Password: "correct-password"})
	req := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 when GetPasswordHash returns ErrNotFound, got %d, body: %s", rec.Code, rec.Body.String())
	}
}
