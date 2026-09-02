package auksion

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// TestListing_MarshalsToCamelCaseJSON pins the wire format so the frontend's
// camelCase expectations can't silently regress — same pattern as
// internal/parts's TestJob_MarshalsToCamelCaseJSON.
func TestListing_MarshalsToCamelCaseJSON(t *testing.T) {
	bid := 15100.0
	l := Listing{
		ID: 1, Make: "Tesla", Model: "Model 3", Year: 2022,
		Images:      []string{"https://example.com/1.jpg"},
		StartingBid: 15000, CurrentBid: &bid, BidCount: 3, MinNextBid: 15200,
		EndTime: time.Now(), Status: "live", CreatedAt: time.Now(),
	}

	b, err := json.Marshal(l)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	s := string(b)

	for _, key := range []string{
		`"id"`, `"make"`, `"model"`, `"year"`, `"startingBid"`, `"currentBid"`,
		`"bidCount"`, `"minNextBid"`, `"endTime"`, `"status"`, `"createdAt"`,
	} {
		if !strings.Contains(s, key) {
			t.Fatalf("expected JSON to contain camelCase key %s, got: %s", key, s)
		}
	}
	for _, key := range []string{`"ID"`, `"StartingBid"`, `"CurrentBid"`, `"MinNextBid"`} {
		if strings.Contains(s, key) {
			t.Fatalf("expected JSON NOT to contain PascalCase key %s, got: %s", key, s)
		}
	}
}

func TestListing_OmitsCurrentBidWhenNil(t *testing.T) {
	l := Listing{ID: 1, Make: "Tesla", Model: "Model 3", Year: 2022, StartingBid: 15000, MinNextBid: 15000}

	b, err := json.Marshal(l)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if strings.Contains(string(b), `"currentBid"`) {
		t.Fatalf("expected currentBid to be omitted when nil, got: %s", string(b))
	}
}
