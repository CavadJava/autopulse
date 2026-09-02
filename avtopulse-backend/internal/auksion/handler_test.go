package auksion

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fakeRepo struct {
	listings   []Listing
	byID       map[int64]*Listing
	bids       []Bid
	placeBidFn func(ctx context.Context, listingID, bidderUserID int64, amount float64) (*Listing, error)
	created    *Listing
}

func (f *fakeRepo) ListLive(ctx context.Context) ([]Listing, error) { return f.listings, nil }
func (f *fakeRepo) GetByID(ctx context.Context, id int64) (*Listing, error) {
	l, ok := f.byID[id]
	if !ok {
		return nil, ErrNotFound
	}
	return l, nil
}
func (f *fakeRepo) ListBids(ctx context.Context, listingID int64, limit int) ([]Bid, error) {
	return f.bids, nil
}
func (f *fakeRepo) PlaceBid(ctx context.Context, listingID, bidderUserID int64, amount float64) (*Listing, error) {
	return f.placeBidFn(ctx, listingID, bidderUserID, amount)
}
func (f *fakeRepo) CreateListing(ctx context.Context, input NewListingInput) (*Listing, error) {
	l := &Listing{ID: 1, Make: input.Make, Model: input.Model, StartingBid: input.StartingBid, MinNextBid: input.StartingBid, Status: "live"}
	f.created = l
	return l, nil
}

func alwaysAuthorized(req *http.Request) (int64, error)   { return 42, nil }
func alwaysUnauthorized(req *http.Request) (int64, error) { return 0, errors.New("unauthorized") }
func alwaysAdmin(next http.HandlerFunc) http.HandlerFunc  { return next }

func TestHandler_ListListings(t *testing.T) {
	repo := &fakeRepo{listings: []Listing{{ID: 1, Make: "Tesla", Model: "Model 3", Status: "live"}}}
	h := NewHandler(repo, alwaysAuthorized, alwaysAdmin)

	req := httptest.NewRequest(http.MethodGet, "/listings", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got []Listing
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("bad JSON response: %v", err)
	}
	if len(got) != 1 || got[0].Make != "Tesla" {
		t.Fatalf("unexpected listings: %+v", got)
	}
}

func TestHandler_GetListing_NotFound(t *testing.T) {
	repo := &fakeRepo{byID: map[int64]*Listing{}}
	h := NewHandler(repo, alwaysAuthorized, alwaysAdmin)

	req := httptest.NewRequest(http.MethodGet, "/listings/999", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestHandler_PlaceBid_RequiresAuth(t *testing.T) {
	repo := &fakeRepo{}
	h := NewHandler(repo, alwaysUnauthorized, alwaysAdmin)

	req := httptest.NewRequest(http.MethodPost, "/listings/1/bids", strings.NewReader(`{"amount":100}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestHandler_PlaceBid_TooLow(t *testing.T) {
	repo := &fakeRepo{
		placeBidFn: func(ctx context.Context, listingID, bidderUserID int64, amount float64) (*Listing, error) {
			return nil, &BidTooLowError{Minimum: 15100}
		},
	}
	h := NewHandler(repo, alwaysAuthorized, alwaysAdmin)

	req := httptest.NewRequest(http.MethodPost, "/listings/1/bids", strings.NewReader(`{"amount":15000}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
	var body map[string]any
	json.Unmarshal(rec.Body.Bytes(), &body)
	if body["minimum"] != 15100.0 {
		t.Fatalf("expected minimum=15100, got %+v", body)
	}
}

func TestHandler_PlaceBid_AuctionEnded(t *testing.T) {
	repo := &fakeRepo{
		placeBidFn: func(ctx context.Context, listingID, bidderUserID int64, amount float64) (*Listing, error) {
			return nil, ErrAuctionEnded
		},
	}
	h := NewHandler(repo, alwaysAuthorized, alwaysAdmin)

	req := httptest.NewRequest(http.MethodPost, "/listings/1/bids", strings.NewReader(`{"amount":15000}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", rec.Code)
	}
}

func TestHandler_PlaceBid_Success(t *testing.T) {
	bid := 15000.0
	repo := &fakeRepo{
		placeBidFn: func(ctx context.Context, listingID, bidderUserID int64, amount float64) (*Listing, error) {
			return &Listing{ID: listingID, CurrentBid: &bid, BidCount: 1, MinNextBid: 15100, Status: "live"}, nil
		},
	}
	h := NewHandler(repo, alwaysAuthorized, alwaysAdmin)

	req := httptest.NewRequest(http.MethodPost, "/listings/1/bids", strings.NewReader(`{"amount":15000}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestHandler_CreateListing_RequiresAdmin(t *testing.T) {
	repo := &fakeRepo{}
	rejectAdmin := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
		}
	}
	h := NewHandler(repo, alwaysAuthorized, rejectAdmin)

	req := httptest.NewRequest(http.MethodPost, "/admin/listings", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestHandler_CreateListing_Success(t *testing.T) {
	repo := &fakeRepo{}
	h := NewHandler(repo, alwaysAuthorized, alwaysAdmin)

	body := `{"make":"Tesla","model":"Model 3","year":2022,"startingBid":15000,"endTime":"` +
		time.Now().Add(1*time.Hour).Format(time.RFC3339) + `"}`
	req := httptest.NewRequest(http.MethodPost, "/admin/listings", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if repo.created == nil || repo.created.Make != "Tesla" {
		t.Fatalf("expected CreateListing to be called with make=Tesla, got %+v", repo.created)
	}
}
