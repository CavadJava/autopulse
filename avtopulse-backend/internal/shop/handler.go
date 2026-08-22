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

	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		shops, err := repo.ListShops(req.Context())
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, shops)
	})

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
