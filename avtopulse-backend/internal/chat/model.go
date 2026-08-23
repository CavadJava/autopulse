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

// StartConversationInput's SellerType/SellerID are always filled in
// server-side by the handler, from the listing's real owner — never taken
// from the caller's request body.
type StartConversationInput struct {
	Source     string `json:"source"`
	ListingID  int64  `json:"listingId"`
	SellerType string `json:"sellerType"`
	SellerID   int64  `json:"sellerId"`
}
