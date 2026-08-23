package adminnotify

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("adminnotify: not found")

type Repository interface {
	PreviewRecipients(ctx context.Context, f Filters) (int, error)
	CreateAndSend(ctx context.Context, title, body string, f Filters) (*Notification, int, error)
	ListSent(ctx context.Context) ([]NotificationSummary, error)
	ListForRecipient(ctx context.Context, recipientType string, recipientID int64) ([]UserNotification, error)
	CountUnread(ctx context.Context, recipientType string, recipientID int64) (int, error)
	MarkRead(ctx context.Context, recipientType string, recipientID, notificationID int64) error
}

type pgRepository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &pgRepository{pool: pool}
}

// buildRecipientQuery returns the recipient ID list for one side ("user" or
// "shop") matching f, as a full SELECT statement plus its args. tableName is
// "avto444.user" or "avto444.shop"; productsTable is "avto444.user_products"
// or "avto444.shop_products"; fkColumn is "user_id" or "shop_id".
func buildRecipientQuery(side, tableName, productsTable, fkColumn string, f Filters) (string, []any) {
	var where []string
	var args []any
	argN := 0
	next := func(v any) string {
		argN++
		args = append(args, v)
		return "$" + itoa(argN)
	}

	if f.BalanceMin != nil {
		where = append(where, "balans >= "+next(*f.BalanceMin))
	}
	if f.BalanceMax != nil {
		where = append(where, "balans <= "+next(*f.BalanceMax))
	}
	if f.CreatedFrom != nil {
		where = append(where, "created_at >= "+next(*f.CreatedFrom))
	}
	if f.CreatedTo != nil {
		where = append(where, "created_at <= "+next(*f.CreatedTo))
	}
	if f.HasActiveListing != nil {
		sub := "EXISTS (SELECT 1 FROM " + productsTable + " p WHERE p." + fkColumn + " = t.id AND p.status = 'saytda')"
		if *f.HasActiveListing {
			where = append(where, sub)
		} else {
			where = append(where, "NOT "+sub)
		}
	}
	if f.HasNonVipActiveListing != nil {
		sub := "EXISTS (SELECT 1 FROM " + productsTable + " p WHERE p." + fkColumn + " = t.id AND p.status = 'saytda' AND p.vip_tier = 'standart')"
		if *f.HasNonVipActiveListing {
			where = append(where, sub)
		} else {
			where = append(where, "NOT "+sub)
		}
	}

	q := "SELECT t.id FROM " + tableName + " t"
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	return q, args
}

// itoa avoids importing strconv twice across this small file's helpers.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	if neg {
		b = append([]byte{'-'}, b...)
	}
	return string(b)
}

// resolveRecipients returns every (type, id) pair matching f, honoring
// f.RecipientType ("user", "shop", or "" for both).
func (r *pgRepository) resolveRecipients(ctx context.Context, f Filters) ([]RecipientRef, error) {
	var out []RecipientRef

	if f.RecipientType == "" || f.RecipientType == "user" {
		q, args := buildRecipientQuery("user", "avto444.user", "avto444.user_products", "user_id", f)
		rows, err := r.pool.Query(ctx, q, args...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, RecipientRef{Type: "user", ID: id})
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}

	if f.RecipientType == "" || f.RecipientType == "shop" {
		q, args := buildRecipientQuery("shop", "avto444.shop", "avto444.shop_products", "shop_id", f)
		rows, err := r.pool.Query(ctx, q, args...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, RecipientRef{Type: "shop", ID: id})
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}

	return out, nil
}

func (r *pgRepository) PreviewRecipients(ctx context.Context, f Filters) (int, error) {
	refs, err := r.resolveRecipients(ctx, f)
	if err != nil {
		return 0, err
	}
	return len(refs), nil
}

func (r *pgRepository) CreateAndSend(ctx context.Context, title, body string, f Filters) (*Notification, int, error) {
	refs, err := r.resolveRecipients(ctx, f)
	if err != nil {
		return nil, 0, err
	}

	filtersJSON, err := json.Marshal(f)
	if err != nil {
		return nil, 0, err
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(ctx)

	var n Notification
	n.Title = title
	n.Body = body
	n.Filters = f
	err = tx.QueryRow(ctx,
		`INSERT INTO avto444.admin_notifications (title, body, filters)
		 VALUES ($1, $2, $3) RETURNING id, created_at`,
		title, body, filtersJSON,
	).Scan(&n.ID, &n.CreatedAt)
	if err != nil {
		return nil, 0, err
	}

	batch := &pgx.Batch{}
	for _, ref := range refs {
		batch.Queue(
			`INSERT INTO avto444.admin_notification_recipients (notification_id, recipient_type, recipient_id)
			 VALUES ($1, $2, $3)`,
			n.ID, ref.Type, ref.ID,
		)
	}
	if batch.Len() > 0 {
		br := tx.SendBatch(ctx, batch)
		for i := 0; i < batch.Len(); i++ {
			if _, err := br.Exec(); err != nil {
				br.Close()
				return nil, 0, err
			}
		}
		if err := br.Close(); err != nil {
			return nil, 0, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return &n, len(refs), nil
}

func (r *pgRepository) ListSent(ctx context.Context) ([]NotificationSummary, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT n.id, n.title, n.body, n.filters, n.created_at,
		        COUNT(rec.id) AS sent_count,
		        COUNT(rec.id) FILTER (WHERE rec.is_read) AS read_count
		 FROM avto444.admin_notifications n
		 LEFT JOIN avto444.admin_notification_recipients rec ON rec.notification_id = n.id
		 GROUP BY n.id
		 ORDER BY n.id DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []NotificationSummary{}
	for rows.Next() {
		var s NotificationSummary
		var filtersJSON []byte
		if err := rows.Scan(&s.ID, &s.Title, &s.Body, &filtersJSON, &s.CreatedAt, &s.SentCount, &s.ReadCount); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(filtersJSON, &s.Filters)
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *pgRepository) ListForRecipient(ctx context.Context, recipientType string, recipientID int64) ([]UserNotification, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT rec.id, n.id, n.title, n.body, rec.is_read, n.created_at
		 FROM avto444.admin_notification_recipients rec
		 JOIN avto444.admin_notifications n ON n.id = rec.notification_id
		 WHERE rec.recipient_type = $1 AND rec.recipient_id = $2
		 ORDER BY n.id DESC`,
		recipientType, recipientID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []UserNotification{}
	for rows.Next() {
		var u UserNotification
		if err := rows.Scan(&u.ID, &u.NotificationID, &u.Title, &u.Body, &u.IsRead, &u.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (r *pgRepository) CountUnread(ctx context.Context, recipientType string, recipientID int64) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM avto444.admin_notification_recipients
		 WHERE recipient_type = $1 AND recipient_id = $2 AND is_read = false`,
		recipientType, recipientID,
	).Scan(&count)
	return count, err
}

func (r *pgRepository) MarkRead(ctx context.Context, recipientType string, recipientID, notificationID int64) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE avto444.admin_notification_recipients
		 SET is_read = true, read_at = now()
		 WHERE recipient_type = $1 AND recipient_id = $2 AND notification_id = $3`,
		recipientType, recipientID, notificationID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
