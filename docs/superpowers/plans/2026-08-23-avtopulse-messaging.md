# Real Messaging (Chat) Sistemi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fərdi istifadəçilər real elan (mağaza və ya istifadəçi) üzərindən sual yaza bilsin, satıcı (mağaza və ya fərdi istifadəçi) cavab versin — polling-əsaslı, elan-scoped konuşmalar, unread sayğacı ilə.

**Architecture:** Yeni `internal/chat` Go paketi, `conversations`/`messages` cədvəlləri. Handler-lər hər iki mövcud auth middleware-ə (`auth.SessionStore`/`user.SessionStore`) ayrıca mount olunur — chat paketi hər ikisini import edir, birinci parametr kimi qəbul edir (paylaşılan interfeys yoxdur, hər ikisi struktur baxımından eynidir). Frontend-də yeni `/kabinet/mesajlarim` və `/magazam/mesajlar` səhifələri, 4 saniyəlik polling.

**Tech Stack:** Go/chi/pgx (backend), React/TypeScript (frontend).

## Global Constraints

- Yalnız fərdi istifadəçilər (`avto444.user`) konuşma başlada bilər (alıcı rolu) — mağazalar YALNIZ satıcı ola bilər.
- Konuşma açarı: `(source, listing_id, buyer_user_id)` UNIQUE — eyni alıcı+elan ikinci dəfə "Mesaj yaz" desə, mövcud konuşma tapılır, yenisi yaradılmır.
- `seller_type`/`seller_id` HƏMİŞƏ server-side, elanın özündən təyin olunur — istifadəçi bunları göndərə bilməz.
- Mülkiyyət yoxlaması: bir konuşmanın mesajlarını yalnız o konuşmanın iki tərəfindən biri (`buyer_user_id` və ya `seller_id`+`seller_type` uyğun sessiya) görə bilər/yaza bilər.
- `is_read`: `GET .../messages` çağırışı, çağıranın GÖNDƏRMƏDİYİ bütün mesajları oxunmuş edir.
- WebSocket, fayl əlavəsi, push bildiriş, mağaza-mağazaya chat — bu planın xaricindədir.
- Deploy axını dəyişməz: backend = rsync + `go build` serverdə + `systemctl restart avtopulse-backend` (migrasiya avtomatik tətbiq olunur); frontend = `git push origin main` + `bash deploy/deploy.sh`.

---

## Task 1: DB migrasiyası — `conversations`, `messages`

**Files:**
- Create: `avtopulse-backend/migrations/0011_messaging.sql`

**Interfaces:**
- Produces: `avto444.conversations`, `avto444.messages` cədvəlləri — Task 2-nin Go modelləri bunlardan asılıdır.

- [ ] **Step 1: Migrasiya faylını yaz**

```sql
CREATE TABLE avto444.conversations (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL CHECK (source IN ('shop', 'user')),
  listing_id    BIGINT NOT NULL,
  buyer_user_id BIGINT NOT NULL REFERENCES avto444.user(id),
  seller_type   TEXT NOT NULL CHECK (seller_type IN ('shop', 'user')),
  seller_id     BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, listing_id, buyer_user_id)
);

CREATE TABLE avto444.messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES avto444.conversations(id),
  sender_type     TEXT NOT NULL CHECK (sender_type IN ('shop', 'user')),
  sender_id       BIGINT NOT NULL,
  body            TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_id_idx ON avto444.messages (conversation_id, created_at);
```

- [ ] **Step 2: Commit**

```bash
git add avtopulse-backend/migrations/0011_messaging.sql
git commit -m "feat(backend): add conversations and messages tables for chat"
```

(Server-side tətbiqi Task 6-da, backend deploy-un bir hissəsi kimi — rsync+restart kifayətdir, backend-in öz migrasiya runner-i avtomatik tətbiq edəcək.)

---

## Task 2: `internal/chat` paketi — modellər və repository

**Files:**
- Create: `avtopulse-backend/internal/chat/model.go`
- Create: `avtopulse-backend/internal/chat/repository.go`
- Create: `avtopulse-backend/internal/chat/repository_test.go`

**Interfaces:**
- Consumes: Task 1-in `conversations`/`messages` cədvəlləri.
- Produces: `Repository` interfeysi (`FindOrCreateConversation`, `ListConversationsAsBuyer`, `ListConversationsAsSeller`, `GetConversation`, `ListMessages`, `SendMessage`, `CountUnreadAsBuyer`, `CountUnreadAsSeller`) — Task 3-ün handler-ləri bunu istifadə edəcək.

- [ ] **Step 1: `model.go`-nu yaz**

```go
package chat

import "time"

type Conversation struct {
	ID          int64     `json:"id"`
	Source      string    `json:"source"`
	ListingID   int64     `json:"listingId"`
	BuyerUserID int64     `json:"buyerUserId"`
	SellerType  string    `json:"sellerType"`
	SellerID    int64     `json:"sellerId"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Message struct {
	ID             int64     `json:"id"`
	ConversationID int64     `json:"conversationId"`
	SenderType     string    `json:"senderType"`
	SenderID       int64     `json:"senderId"`
	Body           string    `json:"body"`
	IsRead         bool      `json:"isRead"`
	CreatedAt      time.Time `json:"createdAt"`
}

type StartConversationInput struct {
	Source     string `json:"source"`
	ListingID  int64  `json:"listingId"`
	SellerType string `json:"sellerType"`
	SellerID   int64  `json:"sellerId"`
}
```

(`StartConversationInput`-un `SellerType`/`SellerID`-si handler tərəfindən server-side doldurulur — istifadəçinin göndərdiyi body-dən DEYİL, bax Task 3.)

- [ ] **Step 2: `repository.go`-nu yaz**

```go
package chat

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("chat: not found")
var ErrForbidden = errors.New("chat: forbidden")

type Repository interface {
	FindOrCreateConversation(ctx context.Context, input StartConversationInput, buyerUserID int64) (*Conversation, error)
	GetConversation(ctx context.Context, id int64) (*Conversation, error)
	ListConversationsAsBuyer(ctx context.Context, buyerUserID int64) ([]Conversation, error)
	ListConversationsAsSeller(ctx context.Context, sellerType string, sellerID int64) ([]Conversation, error)
	ListMessages(ctx context.Context, conversationID int64) ([]Message, error)
	SendMessage(ctx context.Context, conversationID int64, senderType string, senderID int64, body string) (*Message, error)
	MarkRead(ctx context.Context, conversationID int64, readerType string, readerID int64) error
	CountUnreadAsBuyer(ctx context.Context, buyerUserID int64) (int, error)
	CountUnreadAsSeller(ctx context.Context, sellerType string, sellerID int64) (int, error)
}

type pgRepository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &pgRepository{pool: pool}
}

func (r *pgRepository) FindOrCreateConversation(ctx context.Context, input StartConversationInput, buyerUserID int64) (*Conversation, error) {
	var c Conversation
	err := r.pool.QueryRow(ctx,
		`SELECT id, source, listing_id, buyer_user_id, seller_type, seller_id, created_at
		 FROM avto444.conversations WHERE source = $1 AND listing_id = $2 AND buyer_user_id = $3`,
		input.Source, input.ListingID, buyerUserID,
	).Scan(&c.ID, &c.Source, &c.ListingID, &c.BuyerUserID, &c.SellerType, &c.SellerID, &c.CreatedAt)
	if err == nil {
		return &c, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	err = r.pool.QueryRow(ctx,
		`INSERT INTO avto444.conversations (source, listing_id, buyer_user_id, seller_type, seller_id)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, created_at`,
		input.Source, input.ListingID, buyerUserID, input.SellerType, input.SellerID,
	).Scan(&c.ID, &c.CreatedAt)
	if err != nil {
		return nil, err
	}
	c.Source = input.Source
	c.ListingID = input.ListingID
	c.BuyerUserID = buyerUserID
	c.SellerType = input.SellerType
	c.SellerID = input.SellerID
	return &c, nil
}

func (r *pgRepository) GetConversation(ctx context.Context, id int64) (*Conversation, error) {
	var c Conversation
	err := r.pool.QueryRow(ctx,
		`SELECT id, source, listing_id, buyer_user_id, seller_type, seller_id, created_at
		 FROM avto444.conversations WHERE id = $1`,
		id,
	).Scan(&c.ID, &c.Source, &c.ListingID, &c.BuyerUserID, &c.SellerType, &c.SellerID, &c.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *pgRepository) ListConversationsAsBuyer(ctx context.Context, buyerUserID int64) ([]Conversation, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, source, listing_id, buyer_user_id, seller_type, seller_id, created_at
		 FROM avto444.conversations WHERE buyer_user_id = $1 ORDER BY id DESC`,
		buyerUserID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Conversation{}
	for rows.Next() {
		var c Conversation
		if err := rows.Scan(&c.ID, &c.Source, &c.ListingID, &c.BuyerUserID, &c.SellerType, &c.SellerID, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *pgRepository) ListConversationsAsSeller(ctx context.Context, sellerType string, sellerID int64) ([]Conversation, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, source, listing_id, buyer_user_id, seller_type, seller_id, created_at
		 FROM avto444.conversations WHERE seller_type = $1 AND seller_id = $2 ORDER BY id DESC`,
		sellerType, sellerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Conversation{}
	for rows.Next() {
		var c Conversation
		if err := rows.Scan(&c.ID, &c.Source, &c.ListingID, &c.BuyerUserID, &c.SellerType, &c.SellerID, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *pgRepository) ListMessages(ctx context.Context, conversationID int64) ([]Message, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, conversation_id, sender_type, sender_id, body, is_read, created_at
		 FROM avto444.messages WHERE conversation_id = $1 ORDER BY id`,
		conversationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderType, &m.SenderID, &m.Body, &m.IsRead, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *pgRepository) SendMessage(ctx context.Context, conversationID int64, senderType string, senderID int64, body string) (*Message, error) {
	var m Message
	err := r.pool.QueryRow(ctx,
		`INSERT INTO avto444.messages (conversation_id, sender_type, sender_id, body)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, conversation_id, sender_type, sender_id, body, is_read, created_at`,
		conversationID, senderType, senderID, body,
	).Scan(&m.ID, &m.ConversationID, &m.SenderType, &m.SenderID, &m.Body, &m.IsRead, &m.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// MarkRead marks every message in the conversation NOT sent by (readerType,
// readerID) as read — i.e. "the messages the other side sent, which I've
// now seen".
func (r *pgRepository) MarkRead(ctx context.Context, conversationID int64, readerType string, readerID int64) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE avto444.messages SET is_read = true
		 WHERE conversation_id = $1 AND NOT (sender_type = $2 AND sender_id = $3) AND is_read = false`,
		conversationID, readerType, readerID,
	)
	return err
}

func (r *pgRepository) CountUnreadAsBuyer(ctx context.Context, buyerUserID int64) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM avto444.messages m
		 JOIN avto444.conversations c ON c.id = m.conversation_id
		 WHERE c.buyer_user_id = $1 AND m.is_read = false AND NOT (m.sender_type = 'user' AND m.sender_id = $1)`,
		buyerUserID,
	).Scan(&count)
	return count, err
}

func (r *pgRepository) CountUnreadAsSeller(ctx context.Context, sellerType string, sellerID int64) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM avto444.messages m
		 JOIN avto444.conversations c ON c.id = m.conversation_id
		 WHERE c.seller_type = $1 AND c.seller_id = $2 AND m.is_read = false
		       AND NOT (m.sender_type = $1 AND m.sender_id = $2)`,
		sellerType, sellerID,
	).Scan(&count)
	return count, err
}
```

- [ ] **Step 3: `repository_test.go`-da fake-lərin ehtiyacı olmadığını qeyd et (bu paket real DB inteqrasiya testi ilə yoxlanacaq, Task 4-də)**

Bu addımda ayrıca test yazmağa ehtiyac yoxdur — `Repository`-nin özü Task 4-də `handler_test.go`-nun fake-i ilə test olunacaq. Boş fayl yaratmaq əvəzinə, bu step-i keç.

- [ ] **Step 4: `go build` işə sal**

```bash
cd avtopulse-backend && go build ./internal/chat/... 2>&1
```

Gözlənilən: PASS.

- [ ] **Step 5: Commit**

```bash
git add avtopulse-backend/internal/chat/model.go avtopulse-backend/internal/chat/repository.go
git commit -m "feat(backend): add chat package model and repository"
```

---

## Task 3: `chat` handler-ləri — hər iki auth üçün

**Files:**
- Create: `avtopulse-backend/internal/chat/handler.go`
- Create: `avtopulse-backend/internal/chat/handler_test.go`

**Interfaces:**
- Consumes: Task 2-nin `chat.Repository`; `shop.Repository.GetProductShopID`/`ListActiveProducts` (elan-sahiblik yoxlaması üçün); `user.Repository.GetProductUserID`; `auth.SessionStore`/`user.SessionStore` (hər ikisi ayrıca).
- Produces: `NewUserHandler`/`NewShopHandler` — hər biri fərqli auth middleware ilə mount olunan iki ayrı `http.Handler`, Task 5-in `main.go`-su bunları quraşdıracaq.

- [ ] **Step 1: Handler struct-larını və konuşma-başlatma məntiqini yaz**

Bu paket iki ayrı `NewHandler`-ə malikdir (biri `user_session`, biri `shop_session` üçün) — çünki `auth.SessionStore`/`user.SessionStore` fərqli tiplərdir və `requireSession` hər paketin öz daxili funksiyasıdır. `chat` paketi öz `requireSession`-larını yazır:

```go
package chat

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/CavadJava/avtopulse-backend/internal/auth"
	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"github.com/CavadJava/avtopulse-backend/internal/user"
	"github.com/go-chi/chi/v5"
)

type userChatHandlers struct {
	repo     Repository
	shopRepo shop.Repository
	userRepo user.Repository
	sessions user.SessionStore
}

type shopChatHandlers struct {
	repo     Repository
	shopRepo shop.Repository
	userRepo user.Repository
	sessions auth.SessionStore
}

func requireUserSession(req *http.Request, sessions user.SessionStore) (int64, error) {
	cookie, err := req.Cookie("user_session")
	if err != nil {
		return 0, err
	}
	return sessions.Lookup(req.Context(), cookie.Value)
}

func requireShopSession(req *http.Request, sessions auth.SessionStore) (int64, error) {
	cookie, err := req.Cookie("shop_session")
	if err != nil {
		return 0, err
	}
	return sessions.Lookup(req.Context(), cookie.Value)
}
```

- [ ] **Step 2: `NewUserHandler`-i yaz — fərdi istifadəçi tərəfinin bütün endpoint-ləri**

```go
func NewUserHandler(repo Repository, shopRepo shop.Repository, userRepo user.Repository, sessions user.SessionStore) http.Handler {
	h := &userChatHandlers{repo: repo, shopRepo: shopRepo, userRepo: userRepo, sessions: sessions}
	r := chi.NewRouter()

	r.Post("/conversations", h.StartConversation)
	r.Get("/conversations", h.ListConversations)
	r.Get("/conversations/{id}/messages", h.ListMessages)
	r.Post("/conversations/{id}/messages", h.SendMessage)
	r.Get("/conversations/unread-count", h.UnreadCount)

	return r
}

// StartConversation godoc
// @Summary      Start (or find existing) a conversation about a listing
// @Description  Requires a valid user_session cookie. seller info is derived server-side from the listing.
// @Tags         chat
// @Accept       json
// @Produce      json
// @Param        body  body  startConversationRequest  true  "source and listingId"
// @Success      200   {object}  Conversation
// @Failure      400   {string}  string  "invalid request body or listing not found"
// @Failure      401   {string}  string  "unauthorized"
// @Failure      500   {string}  string  "internal error"
// @Router       /conversations [post]
func (h *userChatHandlers) StartConversation(w http.ResponseWriter, req *http.Request) {
	buyerUserID, err := requireUserSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var body startConversationRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Source != "shop" && body.Source != "user" {
		http.Error(w, "invalid source", http.StatusBadRequest)
		return
	}

	// Server-side: find the listing's real owner — never trust a client-supplied sellerId.
	var sellerType string
	var sellerID int64
	if body.Source == "shop" {
		id, err := h.shopRepo.GetProductShopID(req.Context(), body.ListingID)
		if errors.Is(err, shop.ErrNotFound) {
			http.Error(w, "listing not found", http.StatusBadRequest)
			return
		}
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		sellerType, sellerID = "shop", id
	} else {
		id, err := h.userRepo.GetProductUserID(req.Context(), body.ListingID)
		if errors.Is(err, user.ErrNotFound) {
			http.Error(w, "listing not found", http.StatusBadRequest)
			return
		}
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		sellerType, sellerID = "user", id
	}

	// A user can't message themselves about their own listing.
	if sellerType == "user" && sellerID == buyerUserID {
		http.Error(w, "cannot message yourself", http.StatusBadRequest)
		return
	}

	conv, err := h.repo.FindOrCreateConversation(req.Context(), StartConversationInput{
		Source: body.Source, ListingID: body.ListingID, SellerType: sellerType, SellerID: sellerID,
	}, buyerUserID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, conv)
}

type startConversationRequest struct {
	Source    string `json:"source"`
	ListingID int64  `json:"listingId"`
}
```

- [ ] **Step 3: `ListConversations`/`ListMessages`/`SendMessage`/`UnreadCount`-u (istifadəçi tərəfi) yaz**

```go
// ListConversations godoc
// @Summary      List the logged-in user's conversations (as buyer and as seller of their own listings)
// @Tags         chat
// @Produce      json
// @Success      200  {array}   Conversation
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /conversations [get]
func (h *userChatHandlers) ListConversations(w http.ResponseWriter, req *http.Request) {
	userID, err := requireUserSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	asBuyer, err := h.repo.ListConversationsAsBuyer(req.Context(), userID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	asSeller, err := h.repo.ListConversationsAsSeller(req.Context(), "user", userID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, append(asBuyer, asSeller...))
}

func (h *userChatHandlers) conversationParticipant(req *http.Request, userID int64) (*Conversation, bool) {
	convID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		return nil, false
	}
	conv, err := h.repo.GetConversation(req.Context(), convID)
	if err != nil {
		return nil, false
	}
	isParticipant := conv.BuyerUserID == userID || (conv.SellerType == "user" && conv.SellerID == userID)
	return conv, isParticipant
}

// ListMessages godoc
// @Summary      List messages in a conversation, marking the other side's messages as read
// @Tags         chat
// @Produce      json
// @Param        id  path  int  true  "Conversation id"
// @Success      200  {array}   Message
// @Failure      401  {string}  string  "unauthorized"
// @Failure      403  {string}  string  "forbidden"
// @Failure      404  {string}  string  "conversation not found"
// @Failure      500  {string}  string  "internal error"
// @Router       /conversations/{id}/messages [get]
func (h *userChatHandlers) ListMessages(w http.ResponseWriter, req *http.Request) {
	userID, err := requireUserSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	conv, ok := h.conversationParticipant(req, userID)
	if conv == nil {
		http.Error(w, "conversation not found", http.StatusNotFound)
		return
	}
	if !ok {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	if err := h.repo.MarkRead(req.Context(), conv.ID, "user", userID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	messages, err := h.repo.ListMessages(req.Context(), conv.ID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, messages)
}

type sendMessageRequest struct {
	Body string `json:"body"`
}

// SendMessage godoc
// @Summary      Send a message in a conversation
// @Tags         chat
// @Accept       json
// @Produce      json
// @Param        id    path  int                 true  "Conversation id"
// @Param        body  body  sendMessageRequest  true  "Message body"
// @Success      201   {object}  Message
// @Failure      400   {string}  string  "invalid request body"
// @Failure      401   {string}  string  "unauthorized"
// @Failure      403   {string}  string  "forbidden"
// @Failure      404   {string}  string  "conversation not found"
// @Failure      500   {string}  string  "internal error"
// @Router       /conversations/{id}/messages [post]
func (h *userChatHandlers) SendMessage(w http.ResponseWriter, req *http.Request) {
	userID, err := requireUserSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	conv, ok := h.conversationParticipant(req, userID)
	if conv == nil {
		http.Error(w, "conversation not found", http.StatusNotFound)
		return
	}
	if !ok {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var body sendMessageRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Body == "" {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	msg, err := h.repo.SendMessage(req.Context(), conv.ID, "user", userID, body.Body)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, msg)
}

// UnreadCount godoc
// @Summary      Count unread messages across all the user's conversations
// @Tags         chat
// @Produce      json
// @Success      200  {object}  map[string]int
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /conversations/unread-count [get]
func (h *userChatHandlers) UnreadCount(w http.ResponseWriter, req *http.Request) {
	userID, err := requireUserSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	buyerCount, err := h.repo.CountUnreadAsBuyer(req.Context(), userID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	sellerCount, err := h.repo.CountUnreadAsSeller(req.Context(), "user", userID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"unreadCount": buyerCount + sellerCount})
}
```

- [ ] **Step 4: `NewShopHandler`-i yaz — mağaza tərəfi (yalnız satıcı rolu)**

```go
func NewShopHandler(repo Repository, sessions auth.SessionStore) http.Handler {
	h := &shopChatHandlers{repo: repo, sessions: sessions}
	r := chi.NewRouter()

	r.Get("/conversations", h.ListConversations)
	r.Get("/conversations/{id}/messages", h.ListMessages)
	r.Post("/conversations/{id}/messages", h.SendMessage)
	r.Get("/conversations/unread-count", h.UnreadCount)

	return r
}

func (h *shopChatHandlers) ListConversations(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireShopSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conversations, err := h.repo.ListConversationsAsSeller(req.Context(), "shop", shopID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, conversations)
}

func (h *shopChatHandlers) conversationParticipant(req *http.Request, shopID int64) (*Conversation, bool) {
	convID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		return nil, false
	}
	conv, err := h.repo.GetConversation(req.Context(), convID)
	if err != nil {
		return nil, false
	}
	return conv, conv.SellerType == "shop" && conv.SellerID == shopID
}

func (h *shopChatHandlers) ListMessages(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireShopSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conv, ok := h.conversationParticipant(req, shopID)
	if conv == nil {
		http.Error(w, "conversation not found", http.StatusNotFound)
		return
	}
	if !ok {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if err := h.repo.MarkRead(req.Context(), conv.ID, "shop", shopID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	messages, err := h.repo.ListMessages(req.Context(), conv.ID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, messages)
}

func (h *shopChatHandlers) SendMessage(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireShopSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conv, ok := h.conversationParticipant(req, shopID)
	if conv == nil {
		http.Error(w, "conversation not found", http.StatusNotFound)
		return
	}
	if !ok {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var body sendMessageRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Body == "" {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	msg, err := h.repo.SendMessage(req.Context(), conv.ID, "shop", shopID, body.Body)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, msg)
}

func (h *shopChatHandlers) UnreadCount(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireShopSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	count, err := h.repo.CountUnreadAsSeller(req.Context(), "shop", shopID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"unreadCount": count})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
```

- [ ] **Step 5: `handler_test.go`-nu yaz — fake `Repository`, `shop.Repository`, `user.Repository`, `SessionStore`-larla əsas ssenarilər**

```go
package chat

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"github.com/CavadJava/avtopulse-backend/internal/user"
)

type fakeRepo struct {
	conversations map[int64]*Conversation
	messages      map[int64][]Message
	nextConvID    int64
	nextMsgID     int64
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{conversations: map[int64]*Conversation{}, messages: map[int64][]Message{}, nextConvID: 1, nextMsgID: 1}
}

func (f *fakeRepo) FindOrCreateConversation(ctx context.Context, input StartConversationInput, buyerUserID int64) (*Conversation, error) {
	for _, c := range f.conversations {
		if c.Source == input.Source && c.ListingID == input.ListingID && c.BuyerUserID == buyerUserID {
			return c, nil
		}
	}
	c := &Conversation{ID: f.nextConvID, Source: input.Source, ListingID: input.ListingID, BuyerUserID: buyerUserID, SellerType: input.SellerType, SellerID: input.SellerID, CreatedAt: time.Now()}
	f.conversations[c.ID] = c
	f.nextConvID++
	return c, nil
}

func (f *fakeRepo) GetConversation(ctx context.Context, id int64) (*Conversation, error) {
	c, ok := f.conversations[id]
	if !ok {
		return nil, ErrNotFound
	}
	return c, nil
}

func (f *fakeRepo) ListConversationsAsBuyer(ctx context.Context, buyerUserID int64) ([]Conversation, error) {
	out := []Conversation{}
	for _, c := range f.conversations {
		if c.BuyerUserID == buyerUserID {
			out = append(out, *c)
		}
	}
	return out, nil
}

func (f *fakeRepo) ListConversationsAsSeller(ctx context.Context, sellerType string, sellerID int64) ([]Conversation, error) {
	out := []Conversation{}
	for _, c := range f.conversations {
		if c.SellerType == sellerType && c.SellerID == sellerID {
			out = append(out, *c)
		}
	}
	return out, nil
}

func (f *fakeRepo) ListMessages(ctx context.Context, conversationID int64) ([]Message, error) {
	return f.messages[conversationID], nil
}

func (f *fakeRepo) SendMessage(ctx context.Context, conversationID int64, senderType string, senderID int64, body string) (*Message, error) {
	m := Message{ID: f.nextMsgID, ConversationID: conversationID, SenderType: senderType, SenderID: senderID, Body: body, CreatedAt: time.Now()}
	f.messages[conversationID] = append(f.messages[conversationID], m)
	f.nextMsgID++
	return &m, nil
}

func (f *fakeRepo) MarkRead(ctx context.Context, conversationID int64, readerType string, readerID int64) error {
	msgs := f.messages[conversationID]
	for i := range msgs {
		if !(msgs[i].SenderType == readerType && msgs[i].SenderID == readerID) {
			msgs[i].IsRead = true
		}
	}
	return nil
}

func (f *fakeRepo) CountUnreadAsBuyer(ctx context.Context, buyerUserID int64) (int, error) {
	count := 0
	for _, c := range f.conversations {
		if c.BuyerUserID != buyerUserID {
			continue
		}
		for _, m := range f.messages[c.ID] {
			if !m.IsRead && !(m.SenderType == "user" && m.SenderID == buyerUserID) {
				count++
			}
		}
	}
	return count, nil
}

func (f *fakeRepo) CountUnreadAsSeller(ctx context.Context, sellerType string, sellerID int64) (int, error) {
	count := 0
	for _, c := range f.conversations {
		if c.SellerType != sellerType || c.SellerID != sellerID {
			continue
		}
		for _, m := range f.messages[c.ID] {
			if !m.IsRead && !(m.SenderType == sellerType && m.SenderID == sellerID) {
				count++
			}
		}
	}
	return count, nil
}

type fakeShopRepo struct{ shop.Repository }

func (f *fakeShopRepo) GetProductShopID(ctx context.Context, productID int64) (int64, error) {
	if productID == 99 {
		return 0, shop.ErrNotFound
	}
	return 1, nil // every other product id belongs to shop 1
}

type fakeUserRepo struct{ user.Repository }

func (f *fakeUserRepo) GetProductUserID(ctx context.Context, productID int64) (int64, error) {
	if productID == 99 {
		return 0, user.ErrNotFound
	}
	return 2, nil // every other product id belongs to user 2
}

type fakeUserSessions struct{ tokenToUser map[string]int64 }

func (f *fakeUserSessions) Create(ctx context.Context, userID int64) (string, error) {
	return "", nil
}
func (f *fakeUserSessions) Lookup(ctx context.Context, token string) (int64, error) {
	id, ok := f.tokenToUser[token]
	if !ok {
		return 0, user.ErrSessionNotFound
	}
	return id, nil
}
func (f *fakeUserSessions) Delete(ctx context.Context, token string) error { return nil }

type fakeShopSessions struct{ tokenToShop map[string]int64 }

func (f *fakeShopSessions) Create(ctx context.Context, shopID int64) (string, error) {
	return "", nil
}
func (f *fakeShopSessions) Lookup(ctx context.Context, token string) (int64, error) {
	id, ok := f.tokenToShop[token]
	if !ok {
		return 0, shop.ErrNotFound
	}
	return id, nil
}
func (f *fakeShopSessions) Delete(ctx context.Context, token string) error { return nil }

func TestStartConversation_CreatesThenReuses(t *testing.T) {
	repo := newFakeRepo()
	userSessions := &fakeUserSessions{tokenToUser: map[string]int64{"tok": 10}}
	h := NewUserHandler(repo, &fakeShopRepo{}, &fakeUserRepo{}, userSessions)

	body := strings.NewReader(`{"source":"shop","listingId":7}`)
	req := httptest.NewRequest(http.MethodPost, "/conversations", body)
	req.AddCookie(&http.Cookie{Name: "user_session", Value: "tok"})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
	var conv1 Conversation
	json.NewDecoder(rec.Body).Decode(&conv1)

	// Second call with the same buyer+listing must return the same conversation.
	body2 := strings.NewReader(`{"source":"shop","listingId":7}`)
	req2 := httptest.NewRequest(http.MethodPost, "/conversations", body2)
	req2.AddCookie(&http.Cookie{Name: "user_session", Value: "tok"})
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)

	var conv2 Conversation
	json.NewDecoder(rec2.Body).Decode(&conv2)
	if conv1.ID != conv2.ID {
		t.Fatalf("expected same conversation id, got %d and %d", conv1.ID, conv2.ID)
	}
	if conv2.SellerType != "shop" || conv2.SellerID != 1 {
		t.Fatalf("expected server-derived seller shop/1, got %s/%d", conv2.SellerType, conv2.SellerID)
	}
}

func TestSendMessage_ForbiddenForNonParticipant(t *testing.T) {
	repo := newFakeRepo()
	repo.conversations[1] = &Conversation{ID: 1, Source: "shop", ListingID: 7, BuyerUserID: 10, SellerType: "shop", SellerID: 1}

	userSessions := &fakeUserSessions{tokenToUser: map[string]int64{"tok-outsider": 999}}
	h := NewUserHandler(repo, &fakeShopRepo{}, &fakeUserRepo{}, userSessions)

	req := httptest.NewRequest(http.MethodPost, "/conversations/1/messages", strings.NewReader(`{"body":"hi"}`))
	req.AddCookie(&http.Cookie{Name: "user_session", Value: "tok-outsider"})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestListMessages_MarksOtherSideRead(t *testing.T) {
	repo := newFakeRepo()
	repo.conversations[1] = &Conversation{ID: 1, Source: "shop", ListingID: 7, BuyerUserID: 10, SellerType: "shop", SellerID: 1}
	repo.messages[1] = []Message{{ID: 1, ConversationID: 1, SenderType: "shop", SenderID: 1, Body: "hello", IsRead: false}}

	userSessions := &fakeUserSessions{tokenToUser: map[string]int64{"tok": 10}}
	h := NewUserHandler(repo, &fakeShopRepo{}, &fakeUserRepo{}, userSessions)

	req := httptest.NewRequest(http.MethodGet, "/conversations/1/messages", nil)
	req.AddCookie(&http.Cookie{Name: "user_session", Value: "tok"})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !repo.messages[1][0].IsRead {
		t.Fatalf("expected message to be marked read")
	}
}
```

Qeyd: `fakeShopRepo`/`fakeUserRepo` yalnız çağırılan iki metodu üstələyir (`shop.Repository`/`user.Repository`-ni embed edərək) — bu, əvvəlki fazalarda edildiyi kimi hər metodu manual yazmaqdan qaçınır, çünki `chat` paketinin real çağırdığı yalnız `GetProductShopID`/`GetProductUserID`-dir. Testdə istifadə olunmayan metodlara `nil` interfeys çağırılarsa runtime panic olar — bu, qəbul edilə bilər, çünki testlər yalnız istifadə olunan yolları örtür.

- [ ] **Step 6: Testləri işə sal**

```bash
go test ./internal/chat/... -v
```

Gözlənilən: PASS.

- [ ] **Step 7: Commit**

```bash
git add avtopulse-backend/internal/chat/handler.go avtopulse-backend/internal/chat/handler_test.go
git commit -m "feat(backend): add chat handlers for both user and shop sessions"
```

---

## Task 4: `main.go`-da mount et

**Files:**
- Modify: `avtopulse-backend/cmd/server/main.go`

**Interfaces:**
- Consumes: Task 3-ün `chat.NewUserHandler`/`chat.NewShopHandler`.
- Produces: `/api/users/me/conversations...`, `/api/shops/me/conversations...` — Task 8-in frontend `src/api/chat.ts`-i bunları çağıracaq.

- [ ] **Step 1: `chat.NewRepository`-ni quraşdır, hər iki handler-i yarat**

`shopRepo`/`userRepo`/`sessions`/`userSessions` təyin olunduqdan sonra (`main.go`-nun mövcud sətirlərinin yanına):

```go
chatRepo := chat.NewRepository(pool)
userChatHandler := chat.NewUserHandler(chatRepo, shopRepo, userRepo, userSessions)
shopChatHandler := chat.NewShopHandler(chatRepo, sessions)
```

`"github.com/CavadJava/avtopulse-backend/internal/chat"` importunu əlavə et.

- [ ] **Step 2: Route-ları mount et**

`grep -n "api/users/me/products/{id}/promote\"" avtopulse-backend/cmd/server/main.go` ilə mövcud user-tərəf mount-larının bitdiyi yeri tap, ondan sonra:

```go
r.Post("/api/users/me/conversations", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/users/me", userChatHandler).ServeHTTP(w, req)
})
r.Get("/api/users/me/conversations", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/users/me", userChatHandler).ServeHTTP(w, req)
})
r.Get("/api/users/me/conversations/unread-count", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/users/me", userChatHandler).ServeHTTP(w, req)
})
r.Get("/api/users/me/conversations/{id}/messages", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/users/me", userChatHandler).ServeHTTP(w, req)
})
r.Post("/api/users/me/conversations/{id}/messages", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/users/me", userChatHandler).ServeHTTP(w, req)
})
```

Eyni şəkildə `grep -n "api/shops/me/products/{id}/promote\"" avtopulse-backend/cmd/server/main.go` ilə shop-tərəf mount-larının bitdiyi yeri tap:

```go
r.Get("/api/shops/me/conversations", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/shops/me", shopChatHandler).ServeHTTP(w, req)
})
r.Get("/api/shops/me/conversations/unread-count", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/shops/me", shopChatHandler).ServeHTTP(w, req)
})
r.Get("/api/shops/me/conversations/{id}/messages", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/shops/me", shopChatHandler).ServeHTTP(w, req)
})
r.Post("/api/shops/me/conversations/{id}/messages", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/shops/me", shopChatHandler).ServeHTTP(w, req)
})
```

Qeyd: chi router-in `unread-count` (statik) vs `{id}/messages` (dinamik) route-ları arasında ehtimal olunan konflikt yoxdur — chi statik seqmentlərə dinamik seqmentlərdən üstünlük verir, amma `unread-count` mount sətirini `{id}/messages`-dən ƏVVƏL yazmaq daha aydındır (yuxarıdakı sıra ilə eynidir).

- [ ] **Step 3: `go build` işə sal**

```bash
go build ./... 2>&1
```

Gözlənilən: PASS.

- [ ] **Step 4: Bütün backend testlərini işə sal**

```bash
go test ./... 2>&1
```

Gözlənilən: bütün paketlər PASS.

- [ ] **Step 5: Commit**

```bash
git add avtopulse-backend/cmd/server/main.go
git commit -m "feat(backend): mount chat endpoints for both user and shop sessions"
```

---

## Task 5: Backend deploy + canlı doğrulama

**Files:** (kod dəyişikliyi yoxdur — yalnız deploy)

**Interfaces:**
- Consumes: Task 1-4-ün bütün dəyişiklikləri.
- Produces: canlıda işlək chat API — Task 6-9 (frontend) bu API-yə qarşı test olunacaq.

- [ ] **Step 1: Serverə rsync et, build et, restart et**

```bash
rsync -avz --exclude='.git' --exclude='avtopulse-backend/server' \
  -e "ssh -i ~/.ssh/youtube-remote-webrtc_ed25519" \
  avtopulse-backend/ root@157.180.73.79:/opt/avtopulse-backend/

ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "export PATH=\$PATH:/usr/local/go/bin && cd /opt/avtopulse-backend && go build -o avtopulse-backend ./cmd/server"

ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "chown youtube-remote:youtube-remote /opt/avtopulse-backend/avtopulse-backend && systemctl restart avtopulse-backend"
```

- [ ] **Step 2: Backend-in düzgün başladığını doğrula**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 "sleep 2 && systemctl status avtopulse-backend --no-pager | head -10"
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "PGPASSWORD='z8vsYpTz9GjEwdKSwtYWK2bvTvXUPUs' psql -h localhost -U avtopulse -d avtopulse -c \"SELECT filename FROM public.schema_migrations ORDER BY applied_at DESC LIMIT 1\""
```

Gözlənilən: `Active: active (running)`, son migrasiya `0011_messaging.sql`. Crash-loop varsa `journalctl -u avtopulse-backend -n 20 --no-pager` ilə səbəbi yoxla.

- [ ] **Step 3: Real bir istifadəçi ilə konuşma başlat, cavab ver, doğrula**

```bash
curl -s -c /tmp/user_cookie.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/users/otp/request \
  -H "Content-Type: application/json" -d '{"phone":"+994501112233"}'
curl -s -b /tmp/user_cookie.txt -c /tmp/user_cookie.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/users/otp/verify \
  -H "Content-Type: application/json" -d '{"phone":"+994501112233","code":"1234"}'

curl -s -b /tmp/user_cookie.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/users/me/conversations \
  -H "Content-Type: application/json" -d '{"source":"shop","listingId":7}'
```

Gözlənilən: `200`, cavabda `sellerType: "shop"`, `sellerId` avto444-un real shop ID-si.

- [ ] **Step 4: Mesaj göndər, mağaza tərəfdən görün, cavab ver**

```bash
curl -s -b /tmp/user_cookie.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/users/me/conversations/1/messages \
  -H "Content-Type: application/json" -d '{"body":"Salam, bu maşın hələ satılırmı?"}'

curl -s -c /tmp/shop_cookie.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/login \
  -H "Content-Type: application/json" -d '{"email":"avto444@autopulse.local","password":"avto444pass"}'

curl -s -b /tmp/shop_cookie.txt https://autopulse.157.180.73.79.sslip.io/api/shops/me/conversations
curl -s -b /tmp/shop_cookie.txt https://autopulse.157.180.73.79.sslip.io/api/shops/me/conversations/1/messages
curl -s -b /tmp/shop_cookie.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/me/conversations/1/messages \
  -H "Content-Type: application/json" -d '{"body":"Bəli, satılır."}'
```

Gözlənilən: hər addım `200`/`201`, mağaza istifadəçinin mesajını görür, cavabı göndərir.

- [ ] **Step 5: Unread-count-un düzgün işlədiyini doğrula**

```bash
curl -s -b /tmp/user_cookie.txt https://autopulse.157.180.73.79.sslip.io/api/users/me/conversations/unread-count
```

Gözlənilən: `{"unreadCount":1}` (mağazanın cavabı hələ oxunmayıb).

```bash
curl -s -b /tmp/user_cookie.txt https://autopulse.157.180.73.79.sslip.io/api/users/me/conversations/1/messages
curl -s -b /tmp/user_cookie.txt https://autopulse.157.180.73.79.sslip.io/api/users/me/conversations/unread-count
```

Gözlənilən: ikinci sorğu `{"unreadCount":0}` (mesajlar `ListMessages` çağırışı ilə oxunmuş kimi işarələndi).

- [ ] **Step 6: Test cookie-lərini təmizlə (test datası — konuşma/mesajlar — davam üçün saxlanıla bilər, sonrakı frontend testlərində istifadə olunacaq)**

```bash
rm -f /tmp/user_cookie.txt /tmp/shop_cookie.txt
```

---

## Task 6: `src/api/chat.ts` — frontend API modulu

**Files:**
- Create: `src/api/chat.ts`

**Interfaces:**
- Consumes: Task 5-in canlı endpoint-ləri.
- Produces: `startConversation`, `getMyConversations`, `getShopConversations`, `getMessages`, `getShopMessages`, `sendMessage`, `sendShopMessage`, `getUnreadCount`, `getShopUnreadCount` — Task 7/8/9 bunları istifadə edəcək.

- [ ] **Step 1: Tipləri və istifadəçi-tərəf funksiyalarını yaz**

```typescript
// Real HTTP client for the avtopulse-backend Go service's chat endpoints.
// Two independent sets of functions — one per session type (user_session,
// shop_session) — since the backend mounts chat under both auth middlewares
// separately, mirroring src/api/auth.ts and src/api/shop.ts's own split.

const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

export interface Conversation {
  id: number;
  source: 'shop' | 'user';
  listingId: number;
  buyerUserId: number;
  sellerType: 'shop' | 'user';
  sellerId: number;
  createdAt: string;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderType: 'shop' | 'user';
  senderId: number;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export class ChatUnauthorizedError extends Error {}

export async function startConversation(source: 'shop' | 'user', listingId: number): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/api/users/me/conversations`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, listingId }),
  });
  if (res.status === 401) {
    throw new ChatUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`startConversation failed: ${res.status}`);
  }
  return res.json();
}

export async function getMyConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_BASE}/api/users/me/conversations`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new ChatUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getMyConversations failed: ${res.status}`);
  }
  return res.json();
}

export async function getMessages(conversationId: number): Promise<ChatMessage[]> {
  const res = await fetch(`${API_BASE}/api/users/me/conversations/${conversationId}/messages`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new ChatUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getMessages failed: ${res.status}`);
  }
  return res.json();
}

export async function sendMessage(conversationId: number, body: string): Promise<ChatMessage> {
  const res = await fetch(`${API_BASE}/api/users/me/conversations/${conversationId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (res.status === 401) {
    throw new ChatUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`sendMessage failed: ${res.status}`);
  }
  return res.json();
}

export async function getUnreadCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/users/me/conversations/unread-count`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.unreadCount ?? 0;
}
```

- [ ] **Step 2: Mağaza-tərəf funksiyalarını əlavə et**

```typescript
export async function getShopConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_BASE}/api/shops/me/conversations`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new ChatUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getShopConversations failed: ${res.status}`);
  }
  return res.json();
}

export async function getShopMessages(conversationId: number): Promise<ChatMessage[]> {
  const res = await fetch(`${API_BASE}/api/shops/me/conversations/${conversationId}/messages`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new ChatUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getShopMessages failed: ${res.status}`);
  }
  return res.json();
}

export async function sendShopMessage(conversationId: number, body: string): Promise<ChatMessage> {
  const res = await fetch(`${API_BASE}/api/shops/me/conversations/${conversationId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (res.status === 401) {
    throw new ChatUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`sendShopMessage failed: ${res.status}`);
  }
  return res.json();
}

export async function getShopUnreadCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/shops/me/conversations/unread-count`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.unreadCount ?? 0;
}
```

- [ ] **Step 3: `npx tsc -b --noEmit` işə sal**

```bash
cd /Users/frontend/workspace/me-github/autopulse && npx tsc -b --noEmit 2>&1 | head -40
```

Gözlənilən: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/api/chat.ts
git commit -m "feat(frontend): add chat API client for both user and shop sessions"
```

---

## Task 7: "Mesaj yaz" düymələrini funksional et

**Files:**
- Modify: `src/components/IndividualSellerCard.tsx`
- Modify: `src/components/BusinessSellerCard.tsx`
- Modify: `src/pages/RealListingDetail.tsx`

**Interfaces:**
- Consumes: Task 6-nın `startConversation`.
- Produces: hər iki kartın "Mesaj yaz" düyməsi klikləndikdə real konuşma yaradıb `/kabinet/mesajlarim?c={id}`-ə yönləndirir.

- [ ] **Step 1: `RealListingDetail.tsx`-ə `handleMessageClick` əlavə et**

```typescript
import { useNavigate } from 'react-router-dom';
import { startConversation, ChatUnauthorizedError } from '../api/chat';
```

`RealListingDetail` funksiyasının içinə:

```typescript
const navigate = useNavigate();

const handleMessageClick = async () => {
  if (!id) return;
  const [source, numericIdStr] = id.split('-');
  const numericId = Number(numericIdStr);
  try {
    const conv = await startConversation(source as 'shop' | 'user', numericId);
    navigate(`/kabinet/mesajlarim?c=${conv.id}`);
  } catch (err) {
    if (err instanceof ChatUnauthorizedError) {
      navigate('/giris');
      return;
    }
    setPromoteError('Mesaj başlatarkən xəta baş verdi.');
  }
};
```

(`promoteError` state-i mövcud xəta göstərmə mexanizmini təkrar istifadə edir — ayrıca error state yaratmağa ehtiyac yoxdur, kart komponentinin xaricində eyni yerdə göstərilir.)

- [ ] **Step 2: `IndividualSellerCard`/`BusinessSellerCard`-a `onMessageClick` prop-u əlavə et**

Hər iki komponentin `interface`-inə:

```typescript
onMessageClick: () => void;
```

`<button className={styles.btnMessage}>💬 Mesaj yaz</button>` sətrini:

```tsx
<button className={styles.btnMessage} onClick={onMessageClick}>💬 Mesaj yaz</button>
```

- [ ] **Step 3: `RealListingDetail.tsx`-in JSX-ində hər iki kart çağırışına `onMessageClick={handleMessageClick}` əlavə et**

```tsx
<BusinessSellerCard
  ...
  onMessageClick={handleMessageClick}
/>
```

```tsx
<IndividualSellerCard
  ...
  onMessageClick={handleMessageClick}
/>
```

- [ ] **Step 4: `npx tsc -b --noEmit` işə sal**

```bash
npx tsc -b --noEmit 2>&1 | head -40
```

Gözlənilən: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/IndividualSellerCard.tsx src/components/BusinessSellerCard.tsx src/pages/RealListingDetail.tsx
git commit -m "feat(frontend): wire Mesaj yaz button to start a real conversation"
```

---

## Task 8: `KabinetMesajlarim.tsx` — fərdi istifadəçi chat səhifəsi

**Files:**
- Create: `src/pages/kabinet/KabinetMesajlarim.tsx`
- Create: `src/pages/kabinet/KabinetMesajlarim.module.css`
- Modify: `src/pages/kabinet/KabinetLayout.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 6-nın `getMyConversations`/`getMessages`/`sendMessage`/`getUnreadCount`.
- Produces: `/kabinet/mesajlarim` route-u, funksional chat UI-si, `KabinetLayout`-da unread badge.

- [ ] **Step 1: `KabinetMesajlarim.tsx`-i yaz**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getMyConversations, getMessages, sendMessage, ChatUnauthorizedError } from '../../api/chat';
import type { Conversation, ChatMessage } from '../../api/chat';
import styles from './KabinetMesajlarim.module.css';

const POLL_INTERVAL_MS = 4000;

export default function KabinetMesajlarim() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(
    searchParams.get('c') ? Number(searchParams.get('c')) : null
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadConversations = async () => {
    try {
      const data = await getMyConversations();
      setConversations(data);
    } catch (err) {
      if (err instanceof ChatUnauthorizedError) {
        setError('Kabinetə giriş etməmisiniz.');
      }
    }
  };

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      try {
        const data = await getMessages(selectedId);
        setMessages(data);
      } catch {
        // Polling failure is non-fatal — keep showing the last known messages.
      }
    };

    loadMessages();
    pollRef.current = setInterval(loadMessages, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedId]);

  const selectConversation = (id: number) => {
    setSelectedId(id);
    setSearchParams({ c: String(id) });
  };

  const handleSend = async () => {
    if (!draft.trim() || selectedId === null) return;
    setSending(true);
    try {
      await sendMessage(selectedId, draft.trim());
      setDraft('');
      const data = await getMessages(selectedId);
      setMessages(data);
    } catch {
      setError('Mesaj göndərilərkən xəta baş verdi.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.page}>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.layout}>
        <div className={styles.conversationList}>
          {conversations.length === 0 ? (
            <p className={styles.empty}>Hələ heç bir mesajınız yoxdur.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                className={c.id === selectedId ? styles.conversationItemActive : styles.conversationItem}
                onClick={() => selectConversation(c.id)}
              >
                Elan #{c.listingId} ({c.source === 'shop' ? 'Mağaza' : 'İstifadəçi'})
              </button>
            ))
          )}
        </div>

        <div className={styles.messagePane}>
          {selectedId === null ? (
            <p className={styles.empty}>Bir konuşma seçin.</p>
          ) : (
            <>
              <div className={styles.messages}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={m.senderType === 'user' ? styles.messageMine : styles.messageTheirs}
                  >
                    {m.body}
                  </div>
                ))}
              </div>
              <div className={styles.composer}>
                <input
                  className={styles.input}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Mesajınızı yazın..."
                />
                <button className={styles.sendBtn} onClick={handleSend} disabled={sending || !draft.trim()}>
                  Göndər
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `KabinetMesajlarim.module.css`-i yaz**

```css
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.error {
  color: var(--error);
  font-size: 13px;
}

.layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: var(--space-4);
  min-height: 400px;
}

.conversationList {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-right: 1px solid var(--border);
  padding-right: var(--space-4);
}

.conversationItem,
.conversationItemActive {
  text-align: left;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  font-size: 13px;
}

.conversationItemActive {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.messagePane {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.messages {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  overflow-y: auto;
  max-height: 400px;
  padding: var(--space-2);
}

.messageMine {
  align-self: flex-end;
  background: var(--accent);
  color: var(--bg-primary);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  max-width: 70%;
}

.messageTheirs {
  align-self: flex-start;
  background: var(--bg-elevated);
  color: var(--text-primary);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  max-width: 70%;
}

.composer {
  display: flex;
  gap: var(--space-2);
}

.input {
  flex: 1;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.sendBtn {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--bg-primary);
  font-weight: 600;
}

.empty {
  color: var(--text-secondary);
  font-size: 13px;
  padding: var(--space-4);
}
```

- [ ] **Step 3: `KabinetLayout.tsx`-ə tab və unread badge əlavə et**

```tsx
import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getUnreadCount } from '../../api/chat';
import styles from './KabinetLayout.module.css';

const TABS = [
  { to: '/kabinet', label: 'Şəxsi kabinet', icon: '📊', end: true },
  { to: '/kabinet/elanlarim', label: 'Mənim elanlarım', icon: '📄', end: false },
  { to: '/kabinet/mesajlarim', label: 'Mesajlarım', icon: '💬', end: false },
  { to: '/kabinet/profil', label: 'Profil', icon: '👤', end: false },
  { to: '/kabinet/kartlarim', label: 'Kartlarım', icon: '💳', end: false },
];

export default function KabinetLayout() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const poll = async () => {
      try {
        setUnreadCount(await getUnreadCount());
      } catch {
        // Non-fatal — badge just stays at its last known value.
      }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [user]);

  if (!user) {
    return <Navigate to="/giris" replace />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <nav className={styles.tabs}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}
            >
              <span className={styles.icon}>{tab.icon}</span>
              {tab.label}
              {tab.to === '/kabinet/mesajlarim' && unreadCount > 0 && (
                <span className={styles.badge}>{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `KabinetLayout.module.css`-ə `.badge` sinifini əlavə et**

```css
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 100px;
  background: var(--error);
  color: white;
  font-size: 11px;
  font-weight: 700;
  margin-left: var(--space-2);
}
```

- [ ] **Step 5: `App.tsx`-ə route əlavə et**

```tsx
<Route path="mesajlarim" element={<KabinetMesajlarim />} />
```

(mövcud `<Route path="elanlarim" ...>` sətrinin yanına, `KabinetLayout`-un uşaq route-ları arasında) və faylın başına `import KabinetMesajlarim from './pages/kabinet/KabinetMesajlarim';` əlavə et.

- [ ] **Step 6: `npx tsc -b --noEmit` və `npm run build`**

```bash
npx tsc -b --noEmit && npm run build
```

Gözlənilən: PASS.

- [ ] **Step 7: Korrupsiya scan**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/kabinet/KabinetMesajlarim.tsx src/pages/kabinet/KabinetMesajlarim.module.css src/pages/kabinet/KabinetLayout.tsx
```

Gözlənilən: boş.

- [ ] **Step 8: Commit**

```bash
git add src/pages/kabinet/KabinetMesajlarim.tsx src/pages/kabinet/KabinetMesajlarim.module.css \
        src/pages/kabinet/KabinetLayout.tsx src/pages/kabinet/KabinetLayout.module.css src/App.tsx
git commit -m "feat(frontend): add KabinetMesajlarim chat page with polling and unread badge"
```

---

## Task 9: `MyShopMesajlar.tsx` — mağaza chat səhifəsi

**Files:**
- Create: `src/pages/shop/MyShopMesajlar.tsx`
- Create: `src/pages/shop/MyShopMesajlar.module.css`
- Modify: `src/pages/shop/MyShop.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 6-nın `getShopConversations`/`getShopMessages`/`sendShopMessage`/`getShopUnreadCount`.
- Produces: `/magazam/mesajlar` route-u, `MyShop.tsx`-də unread badge-li keçid linki.

- [ ] **Step 1: `MyShopMesajlar.tsx`-i yaz**

Task 8 Step 1-in eyni strukturu, `getShopConversations`/`getShopMessages`/`sendShopMessage` istifadə edərək, `senderType === 'shop'` mesajları "mənim" kimi göstərərək:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getShopConversations,
  getShopMessages,
  sendShopMessage,
  ChatUnauthorizedError,
} from '../../api/chat';
import type { Conversation, ChatMessage } from '../../api/chat';
import styles from './MyShopMesajlar.module.css';

const POLL_INTERVAL_MS = 4000;

export default function MyShopMesajlar() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(
    searchParams.get('c') ? Number(searchParams.get('c')) : null
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadConversations = async () => {
    try {
      const data = await getShopConversations();
      setConversations(data);
    } catch (err) {
      if (err instanceof ChatUnauthorizedError) {
        navigate('/magaza-giris');
      }
    }
  };

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      setMessages([]);
      return;
    }
    const loadMessages = async () => {
      try {
        const data = await getShopMessages(selectedId);
        setMessages(data);
      } catch {
        // Non-fatal — keep last known messages.
      }
    };
    loadMessages();
    pollRef.current = setInterval(loadMessages, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedId]);

  const selectConversation = (id: number) => {
    setSelectedId(id);
    setSearchParams({ c: String(id) });
  };

  const handleSend = async () => {
    if (!draft.trim() || selectedId === null) return;
    setSending(true);
    try {
      await sendShopMessage(selectedId, draft.trim());
      setDraft('');
      const data = await getShopMessages(selectedId);
      setMessages(data);
    } catch {
      setError('Mesaj göndərilərkən xəta baş verdi.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.page}>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.layout}>
        <div className={styles.conversationList}>
          {conversations.length === 0 ? (
            <p className={styles.empty}>Hələ heç bir mesaj yoxdur.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                className={c.id === selectedId ? styles.conversationItemActive : styles.conversationItem}
                onClick={() => selectConversation(c.id)}
              >
                Elan #{c.listingId} — alıcı #{c.buyerUserId}
              </button>
            ))
          )}
        </div>

        <div className={styles.messagePane}>
          {selectedId === null ? (
            <p className={styles.empty}>Bir konuşma seçin.</p>
          ) : (
            <>
              <div className={styles.messages}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={m.senderType === 'shop' ? styles.messageMine : styles.messageTheirs}
                  >
                    {m.body}
                  </div>
                ))}
              </div>
              <div className={styles.composer}>
                <input
                  className={styles.input}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Mesajınızı yazın..."
                />
                <button className={styles.sendBtn} onClick={handleSend} disabled={sending || !draft.trim()}>
                  Göndər
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `MyShopMesajlar.module.css`-i yaz**

`KabinetMesajlarim.module.css`-in eyni məzmunu (bu, iki səhifə arasında bilərəkdən kiçik, ayrıca CSS faylları saxlanılır — hər səhifə öz stilini müstəqil dəyişə bilsin deyə, `MyShop.module.css`-in mövcud rəng-palette dəyişənlərinə uyğun).

- [ ] **Step 3: `MyShop.tsx`-ə "Mesajlar" keçid linki əlavə et (unread badge ilə)**

`MyShop.tsx`-in header hissəsinə (`handleLogout` düyməsinin yanına):

```tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getShopUnreadCount } from '../../api/chat';
```

Komponentin içinə:

```typescript
const [unreadCount, setUnreadCount] = useState(0);

useEffect(() => {
  const poll = async () => {
    try {
      setUnreadCount(await getShopUnreadCount());
    } catch {
      // Non-fatal.
    }
  };
  poll();
  const interval = setInterval(poll, 4000);
  return () => clearInterval(interval);
}, []);
```

JSX-in `headerRow`-una:

```tsx
<div className={styles.headerRow}>
  <h1 className={styles.title}>Mənim mağazam</h1>
  <Link to="/magazam/mesajlar" className={styles.logoutBtn}>
    💬 Mesajlar {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
  </Link>
  <button className={styles.logoutBtn} onClick={handleLogout}>
    Çıxış
  </button>
</div>
```

`MyShop.module.css`-ə `.badge` sinifini əlavə et (`KabinetLayout.module.css`-dəki `.badge`-in eyni forması).

- [ ] **Step 4: `App.tsx`-ə route əlavə et**

```tsx
<Route path="/magazam/mesajlar" element={<MyShopMesajlar />} />
```

(mövcud `<Route path="/magazam" ...>` sətrinin yanına) və `import MyShopMesajlar from './pages/shop/MyShopMesajlar';` əlavə et.

- [ ] **Step 5: `npx tsc -b --noEmit` və `npm run build`**

```bash
npx tsc -b --noEmit && npm run build
```

Gözlənilən: PASS.

- [ ] **Step 6: Korrupsiya scan**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/shop/MyShopMesajlar.tsx src/pages/shop/MyShopMesajlar.module.css src/pages/shop/MyShop.tsx
```

Gözlənilən: boş.

- [ ] **Step 7: Commit**

```bash
git add src/pages/shop/MyShopMesajlar.tsx src/pages/shop/MyShopMesajlar.module.css \
        src/pages/shop/MyShop.tsx src/pages/shop/MyShop.module.css src/App.tsx
git commit -m "feat(frontend): add MyShopMesajlar chat page with polling and unread badge"
```

---

## Task 10: Frontend deploy + tam canlı doğrulama

**Files:** (kod dəyişikliyi yoxdur — yalnız deploy + manual doğrulama)

**Interfaces:**
- Consumes: Task 6-9-un bütün dəyişiklikləri.

- [ ] **Step 1: Deploy et**

```bash
git push origin main
bash deploy/deploy.sh
```

- [ ] **Step 2: "Mesaj yaz" düyməsinin real konuşma yaratdığını doğrula**

Brauzerdə real bir mağaza elanına (`/elan/shop-7`) gir, fərdi istifadəçi sessiyası ilə "Mesaj yaz" düyməsinə klikləy, `/kabinet/mesajlarim?c={id}`-ə yönləndirildiyini yoxla.

- [ ] **Step 3: Mesajlaşmanı hər iki tərəfdən doğrula**

İstifadəçi tərəfdən bir mesaj yaz, mağaza `/magazam/mesajlar`-a keçib mesajı gördüyünü (bir neçə saniyə gözləyib polling-in işlədiyini) təsdiqlə, cavab ver, istifadəçi tərəfdə cavabın göründüyünü doğrula.

- [ ] **Step 4: Unread badge-in hər iki tərəfdə düzgün işlədiyini doğrula**

Mağaza cavab göndərdikdən sonra istifadəçinin `KabinetLayout`-undakı "Mesajlarım" tab-ında badge-in göründüyünü, konuşmanı açdıqdan sonra badge-in itdiyini təsdiqlə.

- [ ] **Step 5: Real bir istifadəçi elanına da "Mesaj yaz" test et**

`/elan/user-2` (real fərdi istifadəçi elanı) aç, "Mesaj yaz"-a klikləy, konuşmanın düzgün yarandığını, elan sahibinin (fərdi istifadəçi, `/kabinet/mesajlarim`-da özü) mesajı gördüyünü doğrula.

- [ ] **Step 6: Test datasını qeyd et**

Bu addımda yaradılan test konuşmaları/mesajları canlı datada real, izlənilə bilən test nümunələri kimi qalır (silinmə tələb olunmur, adi istifadəçi davranışını təqlid edir) — istifadəçiyə hansı elanlarda test edildiyini bildir.

- [ ] **Step 7: Nəticəni istifadəçiyə raportla**

Test edilən konuşmaların linklərini paylaş, hər addımın gözlənilən nəticəyə uyğun olduğunu qeyd et.
