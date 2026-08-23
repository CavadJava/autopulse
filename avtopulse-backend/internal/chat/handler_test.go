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

func TestShopListConversations_Success(t *testing.T) {
	repo := newFakeRepo()
	repo.conversations[1] = &Conversation{ID: 1, Source: "shop", ListingID: 7, BuyerUserID: 10, SellerType: "shop", SellerID: 1}

	shopSessions := &fakeShopSessions{tokenToShop: map[string]int64{"tok": 1}}
	h := NewShopHandler(repo, shopSessions)

	req := httptest.NewRequest(http.MethodGet, "/conversations", nil)
	req.AddCookie(&http.Cookie{Name: "shop_session", Value: "tok"})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}
	var convs []Conversation
	json.NewDecoder(rec.Body).Decode(&convs)
	if len(convs) != 1 {
		t.Fatalf("expected 1 conversation, got %d", len(convs))
	}
}

func TestShopSendMessage_ForbiddenForWrongShop(t *testing.T) {
	repo := newFakeRepo()
	repo.conversations[1] = &Conversation{ID: 1, Source: "shop", ListingID: 7, BuyerUserID: 10, SellerType: "shop", SellerID: 1}

	shopSessions := &fakeShopSessions{tokenToShop: map[string]int64{"tok-other": 2}}
	h := NewShopHandler(repo, shopSessions)

	req := httptest.NewRequest(http.MethodPost, "/conversations/1/messages", strings.NewReader(`{"body":"hi"}`))
	req.AddCookie(&http.Cookie{Name: "shop_session", Value: "tok-other"})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}
