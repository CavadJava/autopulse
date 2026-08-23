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
