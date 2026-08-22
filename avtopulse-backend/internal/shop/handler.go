package shop

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

func NewHandler(repo Repository) http.Handler {
	r := chi.NewRouter()

	// ListShops godoc
	// @Summary      List all shops
	// @Description  Returns a lightweight summary of every shop (id, name, title).
	// @Tags         shops
	// @Produce      json
	// @Success      200  {array}  ShopSummary
	// @Failure      500  {string} string "internal error"
	// @Router       / [get]
	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		shops, err := repo.ListShops(req.Context())
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, shops)
	})

	// GetShopByName godoc
	// @Summary      Get a shop by its name
	// @Description  Returns full shop details for the given name (the shop's slug).
	// @Tags         shops
	// @Produce      json
	// @Param        name  path      string  true  "Shop name/slug"
	// @Success      200   {object}  Shop
	// @Failure      404   {string}  string  "shop not found"
	// @Failure      500   {string}  string  "internal error"
	// @Router       /by-name/{name} [get]
	r.Get("/by-name/{name}", func(w http.ResponseWriter, req *http.Request) {
		name := chi.URLParam(req, "name")
		s, err := repo.GetShopByName(req.Context(), name)
		if errors.Is(err, ErrNotFound) {
			http.Error(w, "shop not found", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, s)
	})

	// ListProducts godoc
	// @Summary      List a shop's products
	// @Description  Returns all products belonging to the given shop id.
	// @Tags         shops
	// @Produce      json
	// @Param        shopId  path      int  true  "Shop id"
	// @Success      200     {array}   Product
	// @Failure      400     {string}  string  "invalid shopId"
	// @Failure      404     {string}  string  "shop not found"
	// @Failure      500     {string}  string  "internal error"
	// @Router       /{shopId}/products [get]
	r.Get("/{shopId}/products", func(w http.ResponseWriter, req *http.Request) {
		idStr := chi.URLParam(req, "shopId")
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			http.Error(w, "invalid shopId", http.StatusBadRequest)
			return
		}

		if _, err := repo.GetShopByID(req.Context(), id); errors.Is(err, ErrNotFound) {
			http.Error(w, "shop not found", http.StatusNotFound)
			return
		} else if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		products, err := repo.ListProducts(req.Context(), id)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, products)
	})

	return r
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
