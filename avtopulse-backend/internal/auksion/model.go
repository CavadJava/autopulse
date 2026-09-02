package auksion

import (
	"errors"
	"time"
)

var ErrNotFound = errors.New("auksion: listing not found")
var ErrAuctionEnded = errors.New("auksion: auction has ended")

// BidTooLowError carries the minimum amount that would have been accepted,
// so the handler can report it back to the client (mirrors the shape of
// user.ErrInsufficientBalance's 402 response in internal/user/handler.go).
type BidTooLowError struct {
	Minimum float64
}

func (e *BidTooLowError) Error() string {
	return "auksion: bid too low"
}

type Listing struct {
	ID          int64    `json:"id"`
	Make        string   `json:"make"`
	Model       string   `json:"model"`
	Year        int      `json:"year"`
	Description string   `json:"description"`
	Images      []string `json:"images"`
	StartingBid float64  `json:"startingBid"`
	CurrentBid  *float64 `json:"currentBid,omitempty"`
	BidCount    int      `json:"bidCount"`
	// MinNextBid is computed server-side on every read: StartingBid if no
	// bid has been placed yet, otherwise CurrentBid + minIncrement. The
	// frontend must never re-derive this itself — it just displays it.
	MinNextBid float64   `json:"minNextBid"`
	EndTime    time.Time `json:"endTime"`
	// Status is always computed from EndTime vs. now() on read, never taken
	// directly from the DB column — see migration 0015's note.
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type Bid struct {
	ID           int64     `json:"id"`
	ListingID    int64     `json:"listingId"`
	BidderUserID int64     `json:"bidderUserId"`
	Amount       float64   `json:"amount"`
	CreatedAt    time.Time `json:"createdAt"`
}

type NewListingInput struct {
	Make        string
	Model       string
	Year        int
	Description string
	Images      []string
	StartingBid float64
	EndTime     time.Time
}
