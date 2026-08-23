package adminnotify

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/CavadJava/avtopulse-backend/internal/auth"
	"github.com/CavadJava/avtopulse-backend/internal/user"
	"github.com/go-chi/chi/v5"
)

type adminNotifyHandlers struct {
	repo Repository
}

// NewAdminHandler mounts the admin-facing routes: preview a filter's
// recipient count, send a new bulk notification, list past sends with
// sent/read counts. requireAdmin gates every route behind the existing
// admin_session cookie check from internal/admin.
func NewAdminHandler(repo Repository, requireAdmin func(http.HandlerFunc) http.HandlerFunc) http.Handler {
	h := &adminNotifyHandlers{repo: repo}
	r := chi.NewRouter()
	r.Post("/preview", requireAdmin(h.Preview))
	r.Post("/", requireAdmin(h.Send))
	r.Get("/sent", requireAdmin(h.ListSent))
	return r
}

type sendRequest struct {
	Title   string  `json:"title"`
	Body    string  `json:"body"`
	Filters Filters `json:"filters"`
}

func (h *adminNotifyHandlers) Preview(w http.ResponseWriter, req *http.Request) {
	var body sendRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	count, err := h.repo.PreviewRecipients(req.Context(), body.Filters)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"recipientCount": count})
}

func (h *adminNotifyHandlers) Send(w http.ResponseWriter, req *http.Request) {
	var body sendRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if body.Title == "" || body.Body == "" {
		http.Error(w, "title and body are required", http.StatusBadRequest)
		return
	}
	n, count, err := h.repo.CreateAndSend(req.Context(), body.Title, body.Body, body.Filters)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": n.ID, "recipientCount": count})
}

func (h *adminNotifyHandlers) ListSent(w http.ResponseWriter, req *http.Request) {
	list, err := h.repo.ListSent(req.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// --- user-facing ---

type userNotifyHandlers struct {
	repo     Repository
	sessions user.SessionStore
}

func requireUserSessionLocal(req *http.Request, sessions user.SessionStore) (int64, error) {
	cookie, err := req.Cookie("user_session")
	if err != nil {
		return 0, err
	}
	return sessions.Lookup(req.Context(), cookie.Value)
}

func NewUserHandler(repo Repository, sessions user.SessionStore) http.Handler {
	h := &userNotifyHandlers{repo: repo, sessions: sessions}
	r := chi.NewRouter()
	r.Get("/", h.List)
	r.Get("/unread-count", h.UnreadCount)
	r.Post("/{id}/read", h.MarkRead)
	return r
}

func (h *userNotifyHandlers) List(w http.ResponseWriter, req *http.Request) {
	userID, err := requireUserSessionLocal(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	list, err := h.repo.ListForRecipient(req.Context(), "user", userID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *userNotifyHandlers) UnreadCount(w http.ResponseWriter, req *http.Request) {
	userID, err := requireUserSessionLocal(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	count, err := h.repo.CountUnread(req.Context(), "user", userID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"unreadCount": count})
}

func (h *userNotifyHandlers) MarkRead(w http.ResponseWriter, req *http.Request) {
	userID, err := requireUserSessionLocal(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := h.repo.MarkRead(req.Context(), "user", userID, id); err != nil {
		if err == ErrNotFound {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- shop-facing ---

type shopNotifyHandlers struct {
	repo     Repository
	sessions auth.SessionStore
}

func requireShopSessionLocal(req *http.Request, sessions auth.SessionStore) (int64, error) {
	cookie, err := req.Cookie("shop_session")
	if err != nil {
		return 0, err
	}
	return sessions.Lookup(req.Context(), cookie.Value)
}

func NewShopHandler(repo Repository, sessions auth.SessionStore) http.Handler {
	h := &shopNotifyHandlers{repo: repo, sessions: sessions}
	r := chi.NewRouter()
	r.Get("/", h.List)
	r.Get("/unread-count", h.UnreadCount)
	r.Post("/{id}/read", h.MarkRead)
	return r
}

func (h *shopNotifyHandlers) List(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireShopSessionLocal(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	list, err := h.repo.ListForRecipient(req.Context(), "shop", shopID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *shopNotifyHandlers) UnreadCount(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireShopSessionLocal(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	count, err := h.repo.CountUnread(req.Context(), "shop", shopID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"unreadCount": count})
}

func (h *shopNotifyHandlers) MarkRead(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireShopSessionLocal(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := h.repo.MarkRead(req.Context(), "shop", shopID, id); err != nil {
		if err == ErrNotFound {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
