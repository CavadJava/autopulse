package auth

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
)

const cookieName = "shop_session"

type loginRequest struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

type loginResponse struct {
	Shop shop.ShopSummary `json:"shop"`
}

func NewHandler(shopRepo shop.Repository, sessions SessionStore) http.Handler {
	r := chi.NewRouter()

	// Login godoc
	// @Summary      Shop owner login
	// @Description  Authenticates a shop by name+password and sets an HttpOnly shop_session cookie on success.
	// @Tags         auth
	// @Accept       json
	// @Produce      json
	// @Param        body  body      loginRequest  true  "Shop name and password"
	// @Success      200   {object}  loginResponse
	// @Failure      400   {string}  string  "invalid request body"
	// @Failure      401   {string}  string  "invalid name or password"
	// @Failure      500   {string}  string  "internal error"
	// @Router       /login [post]
	r.Post("/login", func(w http.ResponseWriter, req *http.Request) {
		var body loginRequest
		if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		s, err := shopRepo.GetShopByName(req.Context(), body.Name)
		if errors.Is(err, shop.ErrNotFound) {
			http.Error(w, "invalid name or password", http.StatusUnauthorized)
			return
		}
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		hash, err := shopRepo.GetPasswordHash(req.Context(), s.ID)
		if errors.Is(err, shop.ErrNotFound) {
			http.Error(w, "invalid name or password", http.StatusUnauthorized)
			return
		}
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)); err != nil {
			http.Error(w, "invalid name or password", http.StatusUnauthorized)
			return
		}

		token, err := sessions.Create(req.Context(), s.ID)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name:     cookieName,
			Value:    token,
			Path:     "/",
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   7 * 24 * 60 * 60,
		})

		writeJSON(w, http.StatusOK, loginResponse{
			Shop: shop.ShopSummary{ID: s.ID, Name: s.Name, Title: s.Title},
		})
	})

	// MeProducts godoc
	// @Summary      List the logged-in shop's own products
	// @Description  Requires a valid shop_session cookie (set by /login).
	// @Tags         auth
	// @Produce      json
	// @Success      200  {array}   shop.Product
	// @Failure      401  {string}  string  "unauthorized"
	// @Failure      500  {string}  string  "internal error"
	// @Router       /me/products [get]
	r.Get("/me/products", func(w http.ResponseWriter, req *http.Request) {
		shopID, err := requireSession(req, sessions)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		products, err := shopRepo.ListProducts(req.Context(), shopID)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, products)
	})

	// Logout godoc
	// @Summary      Log out the current shop session
	// @Description  Deletes the server-side session and clears the shop_session cookie. Returns 500 (and leaves the cookie/session intact) if server-side deletion fails.
	// @Tags         auth
	// @Success      200  {string}  string  "ok"
	// @Failure      500  {string}  string  "internal error"
	// @Router       /logout [post]
	r.Post("/logout", func(w http.ResponseWriter, req *http.Request) {
		cookie, err := req.Cookie(cookieName)
		if err == nil {
			if delErr := sessions.Delete(req.Context(), cookie.Value); delErr != nil {
				log.Printf("auth: failed to delete session: %v", delErr)
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
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
	})

	return r
}

func requireSession(req *http.Request, sessions SessionStore) (int64, error) {
	cookie, err := req.Cookie(cookieName)
	if err != nil {
		return 0, ErrSessionNotFound
	}
	return sessions.Lookup(req.Context(), cookie.Value)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
