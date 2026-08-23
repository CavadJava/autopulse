package adminnotify

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeRepo struct {
	previewCount int
	sendCount    int
	sentList     []NotificationSummary
	listForUser  []UserNotification
	unread       int
	markReadErr  error
}

func (f *fakeRepo) PreviewRecipients(ctx context.Context, filters Filters) (int, error) {
	return f.previewCount, nil
}
func (f *fakeRepo) CreateAndSend(ctx context.Context, title, body string, filters Filters) (*Notification, int, error) {
	return &Notification{ID: 1, Title: title, Body: body}, f.sendCount, nil
}
func (f *fakeRepo) ListSent(ctx context.Context) ([]NotificationSummary, error) {
	return f.sentList, nil
}
func (f *fakeRepo) ListForRecipient(ctx context.Context, recipientType string, recipientID int64) ([]UserNotification, error) {
	return f.listForUser, nil
}
func (f *fakeRepo) CountUnread(ctx context.Context, recipientType string, recipientID int64) (int, error) {
	return f.unread, nil
}
func (f *fakeRepo) MarkRead(ctx context.Context, recipientType string, recipientID, notificationID int64) error {
	return f.markReadErr
}

func passThroughAdmin(next http.HandlerFunc) http.HandlerFunc { return next }

func TestAdminHandler_Preview_ReturnsRecipientCount(t *testing.T) {
	repo := &fakeRepo{previewCount: 42}
	h := NewAdminHandler(repo, passThroughAdmin)

	req := httptest.NewRequest(http.MethodPost, "/preview", strings.NewReader(`{"title":"t","body":"b","filters":{}}`))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var out map[string]int
	json.NewDecoder(w.Body).Decode(&out)
	if out["recipientCount"] != 42 {
		t.Fatalf("recipientCount = %d, want 42", out["recipientCount"])
	}
}

func TestAdminHandler_Send_RejectsEmptyTitle(t *testing.T) {
	repo := &fakeRepo{}
	h := NewAdminHandler(repo, passThroughAdmin)

	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"title":"","body":"b","filters":{}}`))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for empty title", w.Code)
	}
}

func TestUserHandler_List_UnauthorizedWithoutCookie(t *testing.T) {
	h := NewUserHandler(&fakeRepo{}, nil)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 without user_session cookie", w.Code)
	}
}

func TestShopHandler_UnreadCount_UnauthorizedWithoutCookie(t *testing.T) {
	h := NewShopHandler(&fakeRepo{}, nil)
	req := httptest.NewRequest(http.MethodGet, "/unread-count", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 without shop_session cookie", w.Code)
	}
}
