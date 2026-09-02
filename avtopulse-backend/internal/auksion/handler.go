package auksion

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

// AuthFunc extracts the authenticated user ID from a request (via the
// user_session cookie) — same shape as internal/parts's AuthFunc, so this
// package doesn't need to import internal/user or internal/auth directly.
type AuthFunc func(req *http.Request) (int64, error)

type auksionHandlers struct {
	repo     Repository
	authFunc AuthFunc
}

func NewHandler(repo Repository, authFunc AuthFunc, requireAdmin func(http.HandlerFunc) http.HandlerFunc) http.Handler {
	h := &auksionHandlers{repo: repo, authFunc: authFunc}
	r := chi.NewRouter()

	r.Get("/listings", h.ListListings)
	r.Get("/listings/{id}", h.GetListing)
	r.Post("/listings/{id}/bids", h.PlaceBid)
	r.Post("/admin/listings", requireAdmin(h.CreateListing))

	return r
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func (h *auksionHandlers) ListListings(w http.ResponseWriter, req *http.Request) {
	listings, err := h.repo.ListLive(req.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, listings)
}

func (h *auksionHandlers) GetListing(w http.ResponseWriter, req *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid listing id", http.StatusBadRequest)
		return
	}

	listing, err := h.repo.GetByID(req.Context(), id)
	if errors.Is(err, ErrNotFound) {
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	bids, err := h.repo.ListBids(req.Context(), id, 20)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"listing": listing,
		"bids":    bids,
	})
}

type placeBidRequest struct {
	Amount float64 `json:"amount"`
}

func (h *auksionHandlers) PlaceBid(w http.ResponseWriter, req *http.Request) {
	userID, err := h.authFunc(req)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid listing id", http.StatusBadRequest)
		return
	}

	var body placeBidRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	listing, err := h.repo.PlaceBid(req.Context(), id, userID, body.Amount)
	if errors.Is(err, ErrNotFound) {
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}
	if errors.Is(err, ErrAuctionEnded) {
		writeJSON(w, http.StatusConflict, map[string]any{"error": "auction_ended"})
		return
	}
	var tooLow *BidTooLowError
	if errors.As(err, &tooLow) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "bid_too_low", "minimum": tooLow.Minimum})
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, listing)
}

type createListingRequest struct {
	Make        string   `json:"make"`
	Model       string   `json:"model"`
	Year        int      `json:"year"`
	Description string   `json:"description"`
	Images      []string `json:"images"`
	StartingBid float64  `json:"startingBid"`
	EndTime     string   `json:"endTime"` // RFC3339
}

func (h *auksionHandlers) CreateListing(w http.ResponseWriter, req *http.Request) {
	var body createListingRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Make == "" || body.Model == "" || body.StartingBid <= 0 {
		http.Error(w, "make, model and a positive startingBid are required", http.StatusBadRequest)
		return
	}
	endTime, err := parseRFC3339(body.EndTime)
	if err != nil {
		http.Error(w, "endTime must be RFC3339", http.StatusBadRequest)
		return
	}

	listing, err := h.repo.CreateListing(req.Context(), NewListingInput{
		Make: body.Make, Model: body.Model, Year: body.Year, Description: body.Description,
		Images: body.Images, StartingBid: body.StartingBid, EndTime: endTime,
	})
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, listing)
}

func parseRFC3339(s string) (time.Time, error) {
	return time.Parse(time.RFC3339, s)
}
