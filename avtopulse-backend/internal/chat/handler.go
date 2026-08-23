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

// NewUserHandler mounts the chat endpoints reachable via a user_session
// cookie: starting a conversation (buyer role), listing/sending messages and
// unread counts across both roles a user can hold (buyer, and seller of
// their own listings).
func NewUserHandler(repo Repository, shopRepo shop.Repository, userRepo user.Repository, sessions user.SessionStore) http.Handler {
	h := &userChatHandlers{repo: repo, shopRepo: shopRepo, userRepo: userRepo, sessions: sessions}
	r := chi.NewRouter()

	r.Post("/conversations", h.StartConversation)
	r.Get("/conversations", h.ListConversations)
	r.Get("/conversations/unread-count", h.UnreadCount)
	r.Get("/conversations/{id}/messages", h.ListMessages)
	r.Post("/conversations/{id}/messages", h.SendMessage)

	return r
}

type startConversationRequest struct {
	Source    string `json:"source"`
	ListingID int64  `json:"listingId"`
}

// StartConversation godoc
// @Summary      Start (or find existing) a conversation about a listing
// @Description  Requires a valid user_session cookie. Seller info is derived server-side from the listing — never trusted from the client.
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

// ListConversations godoc
// @Summary      List the logged-in user's conversations (as buyer and as seller of their own listings)
// @Description  Requires a valid user_session cookie.
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
// @Description  Requires a valid user_session cookie. Caller must be a participant in the conversation.
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
// @Description  Requires a valid user_session cookie. Caller must be a participant in the conversation.
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
// @Description  Requires a valid user_session cookie.
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

// NewShopHandler mounts the chat endpoints reachable via a shop_session
// cookie. A shop can only hold the seller role — it can never start a
// conversation as a buyer.
func NewShopHandler(repo Repository, sessions auth.SessionStore) http.Handler {
	h := &shopChatHandlers{repo: repo, sessions: sessions}
	r := chi.NewRouter()

	r.Get("/conversations", h.ListConversations)
	r.Get("/conversations/unread-count", h.UnreadCount)
	r.Get("/conversations/{id}/messages", h.ListMessages)
	r.Post("/conversations/{id}/messages", h.SendMessage)

	return r
}

// ListConversations godoc
// @Summary      List the logged-in shop's conversations (as seller)
// @Description  Requires a valid shop_session cookie.
// @Tags         chat
// @Produce      json
// @Success      200  {array}   Conversation
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /conversations [get]
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

// ListMessages godoc
// @Summary      List messages in a conversation, marking the buyer's messages as read
// @Description  Requires a valid shop_session cookie. Caller must be the seller of the conversation.
// @Tags         chat
// @Produce      json
// @Param        id  path  int  true  "Conversation id"
// @Success      200  {array}   Message
// @Failure      401  {string}  string  "unauthorized"
// @Failure      403  {string}  string  "forbidden"
// @Failure      404  {string}  string  "conversation not found"
// @Failure      500  {string}  string  "internal error"
// @Router       /conversations/{id}/messages [get]
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

// SendMessage godoc
// @Summary      Send a message in a conversation, as the shop
// @Description  Requires a valid shop_session cookie. Caller must be the seller of the conversation.
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

// UnreadCount godoc
// @Summary      Count unread messages across all the shop's conversations
// @Description  Requires a valid shop_session cookie.
// @Tags         chat
// @Produce      json
// @Success      200  {object}  map[string]int
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /conversations/unread-count [get]
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
