package admin

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"github.com/CavadJava/avtopulse-backend/internal/user"
	"github.com/go-chi/chi/v5"
)

const cookieName = "admin_session"
const sessionTTL = 24 * time.Hour

// adminSessions is a tiny in-memory (not DB-backed) session store — the
// superadmin panel is a single internal tool with one fixed account, not a
// multi-user system, so a DB table would be unnecessary weight. Sessions are
// lost on server restart, which is an acceptable trade-off for this small
// internal tool (the admin just logs in again).
type adminSessions struct {
	mu     sync.Mutex
	tokens map[string]time.Time // token -> expiry
}

func newAdminSessions() *adminSessions {
	return &adminSessions{tokens: map[string]time.Time{}}
}

func (s *adminSessions) create() string {
	b := make([]byte, 32)
	rand.Read(b)
	token := hex.EncodeToString(b)
	s.mu.Lock()
	s.tokens[token] = time.Now().Add(sessionTTL)
	s.mu.Unlock()
	return token
}

func (s *adminSessions) valid(token string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	expiry, ok := s.tokens[token]
	if !ok || time.Now().After(expiry) {
		return false
	}
	return true
}

func (s *adminSessions) delete(token string) {
	s.mu.Lock()
	delete(s.tokens, token)
	s.mu.Unlock()
}

type adminHandlers struct {
	userRepo user.Repository
	shopRepo shop.Repository
	username string
	password string
	sessions *adminSessions
}

func NewHandler(userRepo user.Repository, shopRepo shop.Repository, adminUsername, adminPassword string) http.Handler {
	h := &adminHandlers{
		userRepo: userRepo, shopRepo: shopRepo,
		username: adminUsername, password: adminPassword,
		sessions: newAdminSessions(),
	}
	r := chi.NewRouter()

	r.Post("/login", h.Login)
	r.Post("/logout", h.Logout)
	r.Get("/products/pending", h.requireAdmin(h.PendingProducts))
	r.Post("/products/{id}/approve", h.requireAdmin(h.ApproveProduct))
	r.Post("/products/{id}/reject", h.requireAdmin(h.RejectProduct))
	r.Get("/shop-products", h.requireAdmin(h.ListShopProducts))
	r.Post("/shop-products/{id}/cancel", h.requireAdmin(h.CancelShopProduct))

	return r
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Login godoc
// @Summary      Superadmin login
// @Description  Authenticates against a fixed username/password from server configuration (not a DB-backed account). Sets an HttpOnly admin_session cookie on success.
// @Tags         admin
// @Accept       json
// @Produce      json
// @Param        body  body  loginRequest  true  "Admin username and password"
// @Success      200   {string}  string  "ok"
// @Failure      400   {string}  string  "invalid request body"
// @Failure      401   {string}  string  "invalid credentials"
// @Router       /admin/login [post]
func (h *adminHandlers) Login(w http.ResponseWriter, req *http.Request) {
	var body loginRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Username != h.username || body.Password != h.password {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	token := h.sessions.create()
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   24 * 60 * 60,
	})
	w.WriteHeader(http.StatusOK)
}

// Logout godoc
// @Summary      Log out the current superadmin session
// @Tags         admin
// @Success      200  {string}  string  "ok"
// @Router       /admin/logout [post]
func (h *adminHandlers) Logout(w http.ResponseWriter, req *http.Request) {
	cookie, err := req.Cookie(cookieName)
	if err == nil {
		h.sessions.delete(cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusOK)
}

func (h *adminHandlers) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		cookie, err := req.Cookie(cookieName)
		if err != nil || !h.sessions.valid(cookie.Value) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, req)
	}
}

// PendingProducts godoc
// @Summary      List all user listings pending moderation
// @Description  Requires a valid admin_session cookie.
// @Tags         admin
// @Produce      json
// @Success      200  {array}   user.Product
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /admin/products/pending [get]
func (h *adminHandlers) PendingProducts(w http.ResponseWriter, req *http.Request) {
	products, err := h.userRepo.ListPendingProducts(req.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, products)
}

// ApproveProduct godoc
// @Summary      Approve a pending user listing
// @Description  Requires a valid admin_session cookie. Sets the listing's status to saytda.
// @Tags         admin
// @Produce      json
// @Param        id  path  int  true  "Product id"
// @Success      200  {object}  map[string]bool
// @Failure      400  {string}  string  "invalid product id"
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /admin/products/{id}/approve [post]
func (h *adminHandlers) ApproveProduct(w http.ResponseWriter, req *http.Request) {
	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}
	if err := h.userRepo.ApproveProduct(req.Context(), productID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"approved": true})
}

// RejectProduct godoc
// @Summary      Reject a pending user listing
// @Description  Requires a valid admin_session cookie. Sets the listing's status to legv_edilib.
// @Tags         admin
// @Produce      json
// @Param        id  path  int  true  "Product id"
// @Success      200  {object}  map[string]bool
// @Failure      400  {string}  string  "invalid product id"
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /admin/products/{id}/reject [post]
func (h *adminHandlers) RejectProduct(w http.ResponseWriter, req *http.Request) {
	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}
	if err := h.userRepo.RejectProduct(req.Context(), productID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"rejected": true})
}

// ListShopProducts godoc
// @Summary      List every shop product across all shops, any status
// @Description  Requires a valid admin_session cookie. Superadmin oversight — not scoped to any single shop.
// @Tags         admin
// @Produce      json
// @Success      200  {array}   shop.Product
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /admin/shop-products [get]
func (h *adminHandlers) ListShopProducts(w http.ResponseWriter, req *http.Request) {
	products, err := h.shopRepo.ListAllProducts(req.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, products)
}

// CancelShopProduct godoc
// @Summary      Cancel any shop's product (superadmin override)
// @Description  Requires a valid admin_session cookie. Uses the same soft-delete as the shop owner's own "Sil" button — no ownership check, since superadmin acts across all shops.
// @Tags         admin
// @Produce      json
// @Param        id  path  int  true  "Product id"
// @Success      200  {object}  map[string]bool
// @Failure      400  {string}  string  "invalid product id"
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /admin/shop-products/{id}/cancel [post]
func (h *adminHandlers) CancelShopProduct(w http.ResponseWriter, req *http.Request) {
	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}
	if err := h.shopRepo.DeleteProduct(req.Context(), productID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"cancelled": true})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
