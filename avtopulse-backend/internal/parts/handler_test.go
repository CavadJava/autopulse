package parts

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fakeHandlerRepo struct {
	sellers []Seller
	parts   []Part
	total   int
}

func (f *fakeHandlerRepo) ListSellers(ctx context.Context) ([]Seller, error) { return f.sellers, nil }
func (f *fakeHandlerRepo) GetOrCreateSeller(ctx context.Context, name string) (*Seller, error) {
	return &Seller{ID: 1, Name: name}, nil
}
func (f *fakeHandlerRepo) InsertParts(ctx context.Context, newParts []NewPart) error { return nil }
func (f *fakeHandlerRepo) DeleteSellerParts(ctx context.Context, sellerID int64) error {
	return nil
}
func (f *fakeHandlerRepo) ListParts(ctx context.Context, filter PartFilter) ([]Part, int, error) {
	return f.parts, f.total, nil
}

func alwaysAuthorized(req *http.Request) (int64, error)   { return 99, nil }
func alwaysUnauthorized(req *http.Request) (int64, error) { return 0, errUnauthorizedTest }

var errUnauthorizedTest = fmtErrorfTest("unauthorized")

func fmtErrorfTest(s string) error { return &testErr{s} }

type testErr struct{ s string }

func (e *testErr) Error() string { return e.s }

func TestHandler_ListSellers(t *testing.T) {
	repo := &fakeHandlerRepo{sellers: []Seller{{ID: 1, Name: "Seller A"}}}
	h := NewHandler(repo, NewJobRunner(repo, &fakeStorageClient{}), alwaysAuthorized)

	req := httptest.NewRequest(http.MethodGet, "/sellers", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got []Seller
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("bad JSON response: %v", err)
	}
	if len(got) != 1 || got[0].Name != "Seller A" {
		t.Fatalf("unexpected sellers: %+v", got)
	}
}

func TestHandler_ListParts_WithModelFilter(t *testing.T) {
	repo := &fakeHandlerRepo{
		parts: []Part{{ID: 1, Model: "model3", SellerName: "Seller A"}},
		total: 1,
	}
	h := NewHandler(repo, NewJobRunner(repo, &fakeStorageClient{}), alwaysAuthorized)

	req := httptest.NewRequest(http.MethodGet, "/?model=model3", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body struct {
		Parts []Part `json:"parts"`
		Total int    `json:"total"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("bad JSON response: %v", err)
	}
	if body.Total != 1 || len(body.Parts) != 1 || body.Parts[0].Model != "model3" {
		t.Fatalf("unexpected response: %+v", body)
	}
}

func TestHandler_Upload_RequiresAuth(t *testing.T) {
	repo := &fakeHandlerRepo{}
	h := NewHandler(repo, NewJobRunner(repo, &fakeStorageClient{}), alwaysUnauthorized)

	req := httptest.NewRequest(http.MethodPost, "/upload", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

// TestJob_MarshalsToCamelCaseJSON pins the wire format of Job so the
// frontend's camelCase UploadJob expectations can't silently regress —
// see final-review finding: Job previously had no json struct tags and
// serialized as PascalCase, which the frontend could never parse.
func TestJob_MarshalsToCamelCaseJSON(t *testing.T) {
	job := Job{
		ID:        "job-123",
		Status:    JobProcessing,
		Processed: 5,
		Total:     10,
		CreatedAt: time.Now(),
	}

	b, err := json.Marshal(job)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	s := string(b)

	for _, key := range []string{`"id"`, `"status"`, `"processed"`, `"total"`, `"createdAt"`} {
		if !strings.Contains(s, key) {
			t.Fatalf("expected JSON to contain camelCase key %s, got: %s", key, s)
		}
	}
	for _, key := range []string{`"ID"`, `"Status"`, `"Processed"`, `"Total"`, `"CreatedAt"`} {
		if strings.Contains(s, key) {
			t.Fatalf("expected JSON NOT to contain PascalCase key %s, got: %s", key, s)
		}
	}
}

func TestHandler_UploadStatus_UnknownJob(t *testing.T) {
	repo := &fakeHandlerRepo{}
	h := NewHandler(repo, NewJobRunner(repo, &fakeStorageClient{}), alwaysAuthorized)

	req := httptest.NewRequest(http.MethodGet, "/upload/does-not-exist/status", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
