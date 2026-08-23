# Admin Toplu Bildiriş Sistemi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin, filtrlərə əsasən (o cümlədən "VIP olmayan aktiv elanı olan" filtri) seçilmiş istifadəçi/mağaza qrupuna toplu in-app bildiriş göndərə bilsin; admin tərəfdə göndərilən/oxunan sayını görsün.

**Architecture:** Tamamilə yeni, təcrid olunmuş `internal/adminnotify` Go paketi (öz repository + handler-i) — mövcud `internal/chat`, `internal/admin`, `internal/user`, `internal/shop` paketlərinin daxili koduna toxunulmur, yalnız `cmd/server/main.go`-da mount sətirləri əlavə olunur. Frontend-də: admin panelinə yeni tab, kabinet/mağaza panelinə `internal/chat`-in unread-badge/polling pattern-inin bilavasitə analoji təkrarı olan yeni "Bildirişlər" səhifəsi.

**Tech Stack:** Go (chi router, pgx/pgxpool), Postgres (`avto444` schema), React + TypeScript (Vite), CSS Modules.

## Global Constraints

- Real push infrastruktur (Web Push API/VAPID/service worker) İSTİFADƏ OLUNMUR — hər şey in-app, mövcud polling pattern ilə.
- `internal/chat`-in `conversations`/`messages` cədvəllərinə heç bir yazı/oxuma əlavəsi edilmir — tamamilə yeni cədvəllər.
- Admin auth mövcud `admin.requireAdmin` middleware pattern-i ilə (username/password + in-memory session, `admin_session` cookie) qorunur — yeni admin auth mexanizmi YARADILMIR.
- User/shop tərəf `user_session`/`shop_session` cookie-lərinin mövcud `requireSession`/`Lookup` mexanizmi ilə işləyir.
- Bütün yeni fayllarda mövcud kod konvensiyaları izlənilir: `writeJSON` helper-i, `ErrNotFound`/`ErrForbidden` tipli error-lar, `credentials: 'include'` + `cache: 'no-store'` frontend fetch pattern-i.
- Migrasiya nömrəsi: son mövcud migrasiya `0011_messaging.sql`-dir → yeni migrasiya `0012_admin_notifications.sql`.
- Backend deploy: rsync + `go build` + `systemctl restart avtopulse-backend` (migrasiyalar backend başlayanda avtomatik tətbiq olunur). Frontend deploy: `git push origin main` + `bash deploy/deploy.sh`.
- Hər commit-dən əvvəl `grep -rn 'Ɛ\|Ɔ'` toxunulan bütün fayllarda — istisnasız.

---

## File Structure

**Backend (yeni):**
- `migrations/0012_admin_notifications.sql` — iki yeni cədvəl.
- `internal/adminnotify/model.go` — `Notification`, `NotificationSummary`, `Filters`, `SendInput` tipləri.
- `internal/adminnotify/repository.go` — `Repository` interfeysi + pg implementasiyası: filtr-əsaslı alıcı sorğusu, fanout yazısı, siyahı/oxuma əməliyyatları.
- `internal/adminnotify/handler.go` — admin-tərəfli handler (`NewAdminHandler`) + user/shop-tərəfli handler-lər (`NewUserHandler`, `NewShopHandler`).
- `internal/adminnotify/repository_test.go`, `internal/adminnotify/handler_test.go`.

**Backend (dəyişdirilən):**
- `cmd/server/main.go` — repository yaradılması + yeni handler-lərin mount edilməsi (mövcud pattern-ə əsasən, `http.StripPrefix` funksiyaları ilə).

**Frontend (yeni):**
- `src/api/adminNotify.ts` — admin-tərəfli HTTP client (filtr preview, göndərmə, siyahı).
- `src/api/notifications.ts` — user/shop-tərəfli HTTP client (siyahı, unread-count, read).
- `src/pages/kabinet/KabinetBildirisler.tsx` + `.module.css`.
- `src/pages/shop/MyShopBildirisler.tsx` + `.module.css`.

**Frontend (dəyişdirilən):**
- `src/App.tsx` — yeni route-lar: `/kabinet/bildirisler` (nested), `/magazam/bildirisler` (standalone).
- `src/pages/kabinet/KabinetLayout.tsx` — yeni tab + unread badge.
- `src/pages/shop/MyShop.tsx` — yeni nav link + unread badge (mövcud mesajlar link pattern-i, sətir ~368).
- `src/pages/AdminDashboard.tsx` + `.module.css` — yeni "Bildirişlər" tab (filtr forması, preview, göndərmə, keçmiş bildirişlərin siyahısı).

---

### Task 1: Migrasiya — `admin_notifications` və `admin_notification_recipients`

**Files:**
- Create: `avtopulse-backend/migrations/0012_admin_notifications.sql`

**Interfaces:**
- Produces: `avto444.admin_notifications(id, title, body, filters jsonb, created_at)`, `avto444.admin_notification_recipients(id, notification_id, recipient_type, recipient_id, is_read, read_at, created_at)` + index `idx_admin_notif_recipients_lookup`.

- [ ] **Step 1: Migrasiya faylını yaz**

```sql
CREATE TABLE avto444.admin_notifications (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  filters     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE avto444.admin_notification_recipients (
  id                BIGSERIAL PRIMARY KEY,
  notification_id   BIGINT NOT NULL REFERENCES avto444.admin_notifications(id),
  recipient_type    TEXT NOT NULL CHECK (recipient_type IN ('user', 'shop')),
  recipient_id      BIGINT NOT NULL,
  is_read           BOOLEAN NOT NULL DEFAULT false,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_notif_recipients_lookup
  ON avto444.admin_notification_recipients (recipient_type, recipient_id, is_read);
```

- [ ] **Step 2: Lokal təsdiq — SQL sintaksisini yoxla**

Run: `cd avtopulse-backend && cat migrations/0012_admin_notifications.sql | psql --version` (yalnız fayl mövcudluğunu və path-i yoxlamaq üçün; real DB-yə tətbiq server başlayanda avtomatik olunur, migration runner artıq mövcuddur — `db.RunMigrations`).

Faylın `migrations/` qovluğunda, ardıcıl nömrələmə ilə (`0012_`) olduğunu təsdiqlə: `ls avtopulse-backend/migrations/ | sort`.

- [ ] **Step 3: Commit**

```bash
cd avtopulse-backend
grep -rn 'Ɛ\|Ɔ' migrations/0012_admin_notifications.sql
git add migrations/0012_admin_notifications.sql
git commit -m "feat(backend): add admin_notifications + admin_notification_recipients migration"
```

---

### Task 2: `internal/adminnotify` — model + repository

**Files:**
- Create: `avtopulse-backend/internal/adminnotify/model.go`
- Create: `avtopulse-backend/internal/adminnotify/repository.go`
- Test: `avtopulse-backend/internal/adminnotify/repository_test.go`

**Interfaces:**
- Consumes: `*pgxpool.Pool` (mövcud `db.Connect`-dən).
- Produces:
  - `type Filters struct { RecipientType string; BalanceMin, BalanceMax *int; CreatedFrom, CreatedTo *time.Time; HasActiveListing *bool; HasNonVipActiveListing *bool }`
  - `type RecipientRef struct { Type string; ID int64 }`
  - `type Notification struct { ID int64; Title, Body string; Filters Filters; CreatedAt time.Time }`
  - `type NotificationSummary struct { Notification; SentCount, ReadCount int }`
  - `type UserNotification struct { ID int64; NotificationID int64; Title, Body string; IsRead bool; CreatedAt time.Time }`
  - `type Repository interface`:
    - `PreviewRecipients(ctx, f Filters) (int, error)`
    - `CreateAndSend(ctx, title, body string, f Filters) (*Notification, int, error)` — `int` = recipient count
    - `ListSent(ctx) ([]NotificationSummary, error)`
    - `ListForRecipient(ctx, recipientType string, recipientID int64) ([]UserNotification, error)`
    - `CountUnread(ctx, recipientType string, recipientID int64) (int, error)`
    - `MarkRead(ctx, recipientType string, recipientID, notificationID int64) error`
  - Later tasks (handler) call all six methods above by these exact names.

- [ ] **Step 1: `model.go` yaz**

```go
package adminnotify

import "time"

type Filters struct {
	RecipientType           string     `json:"recipientType"` // "user", "shop", or "" for both
	BalanceMin              *int       `json:"balanceMin,omitempty"`
	BalanceMax              *int       `json:"balanceMax,omitempty"`
	CreatedFrom             *time.Time `json:"createdFrom,omitempty"`
	CreatedTo               *time.Time `json:"createdTo,omitempty"`
	HasActiveListing        *bool      `json:"hasActiveListing,omitempty"`
	HasNonVipActiveListing  *bool      `json:"hasNonVipActiveListing,omitempty"`
}

type RecipientRef struct {
	Type string
	ID   int64
}

type Notification struct {
	ID        int64     `json:"id"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Filters   Filters   `json:"filters"`
	CreatedAt time.Time `json:"createdAt"`
}

type NotificationSummary struct {
	Notification
	SentCount int `json:"sentCount"`
	ReadCount int `json:"readCount"`
}

type UserNotification struct {
	ID             int64     `json:"id"`
	NotificationID int64     `json:"notificationId"`
	Title          string    `json:"title"`
	Body           string    `json:"body"`
	IsRead         bool      `json:"isRead"`
	CreatedAt      time.Time `json:"createdAt"`
}
```

- [ ] **Step 2: `repository.go` yaz — filtr sorğusu quran helper + interfeys**

```go
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
```

- [ ] **Step 3: Test faylını yaz — `repository_test.go`**

Bu layihədə repository testləri real DB-yə qarşı işləyən inteqrasiya testləridir (bax `internal/chat/handler_test.go`-a nümunə üçün — eyni pattern-i izlə: test DSN-i `AVTOPULSE_TEST_DSN`-dən oxu, DSN yoxdursa `t.Skip`). Aşağıdakı test faylını yarat:

```go
package adminnotify

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/CavadJava/avtopulse-backend/internal/db"
)

func testRepo(t *testing.T) Repository {
	dsn := os.Getenv("AVTOPULSE_TEST_DSN")
	if dsn == "" {
		t.Skip("AVTOPULSE_TEST_DSN not set — skipping DB-backed test")
	}
	pool, err := db.Connect(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	return NewRepository(pool)
}

func TestPreviewRecipients_EmptyFilters_ReturnsNonNegative(t *testing.T) {
	repo := testRepo(t)
	count, err := repo.PreviewRecipients(context.Background(), Filters{})
	if err != nil {
		t.Fatalf("PreviewRecipients: %v", err)
	}
	if count < 0 {
		t.Fatalf("expected non-negative count, got %d", count)
	}
}

func TestPreviewRecipients_RecipientTypeUser_OnlyCountsUsers(t *testing.T) {
	repo := testRepo(t)
	both, err := repo.PreviewRecipients(context.Background(), Filters{})
	if err != nil {
		t.Fatalf("PreviewRecipients(both): %v", err)
	}
	usersOnly, err := repo.PreviewRecipients(context.Background(), Filters{RecipientType: "user"})
	if err != nil {
		t.Fatalf("PreviewRecipients(user): %v", err)
	}
	if usersOnly > both {
		t.Fatalf("users-only count (%d) should never exceed combined count (%d)", usersOnly, both)
	}
}

func TestCreateAndSend_ThenListSent_CountsMatch(t *testing.T) {
	repo := testRepo(t)
	ctx := context.Background()

	expected, err := repo.PreviewRecipients(ctx, Filters{RecipientType: "user"})
	if err != nil {
		t.Fatalf("PreviewRecipients: %v", err)
	}

	n, sent, err := repo.CreateAndSend(ctx, "Test başlıq", "Test mətn", Filters{RecipientType: "user"})
	if err != nil {
		t.Fatalf("CreateAndSend: %v", err)
	}
	if sent != expected {
		t.Fatalf("expected sent=%d, got %d", expected, sent)
	}

	summaries, err := repo.ListSent(ctx)
	if err != nil {
		t.Fatalf("ListSent: %v", err)
	}
	found := false
	for _, s := range summaries {
		if s.ID == n.ID {
			found = true
			if s.SentCount != expected {
				t.Fatalf("summary.SentCount = %d, want %d", s.SentCount, expected)
			}
			if s.ReadCount != 0 {
				t.Fatalf("summary.ReadCount = %d, want 0 (nothing marked read yet)", s.ReadCount)
			}
		}
	}
	if !found {
		t.Fatalf("notification %d not found in ListSent results", n.ID)
	}
}

func TestMarkRead_UpdatesReadCount(t *testing.T) {
	repo := testRepo(t)
	ctx := context.Background()

	// Send to whichever single test user exists first (falls back to skip
	// if there are no users at all — CI/local DB is expected to be seeded).
	refs, err := repo.PreviewRecipients(ctx, Filters{RecipientType: "user"})
	if err != nil {
		t.Fatalf("PreviewRecipients: %v", err)
	}
	if refs == 0 {
		t.Skip("no users in DB to test MarkRead against")
	}

	n, _, err := repo.CreateAndSend(ctx, "Read-test", "body", Filters{RecipientType: "user"})
	if err != nil {
		t.Fatalf("CreateAndSend: %v", err)
	}

	list, err := repo.ListForRecipient(ctx, "user", 1)
	if err != nil {
		t.Fatalf("ListForRecipient: %v", err)
	}
	var targetID int64 = -1
	for _, u := range list {
		if u.NotificationID == n.ID {
			targetID = u.NotificationID
		}
	}
	if targetID == -1 {
		t.Skip("user id=1 was not among this notification's recipients — filter/seed mismatch, not a repository bug")
	}

	before, _ := repo.CountUnread(ctx, "user", 1)
	if err := repo.MarkRead(ctx, "user", 1, n.ID); err != nil {
		t.Fatalf("MarkRead: %v", err)
	}
	after, _ := repo.CountUnread(ctx, "user", 1)
	if after != before-1 {
		t.Fatalf("expected unread count to drop by 1 (from %d), got %d", before, after)
	}
}
```

- [ ] **Step 4: Testləri işə sal**

Run: `cd avtopulse-backend && go build ./... && go vet ./internal/adminnotify/...`
Expected: dərlənmə xətasız keçir. (`AVTOPULSE_TEST_DSN` yoxdursa testlər skip olunacaq — bu qəbul edilir, server-də canlı yoxlama Task 4-də olacaq.)

- [ ] **Step 5: Commit**

```bash
grep -rn 'Ɛ\|Ɔ' internal/adminnotify/
git add internal/adminnotify/model.go internal/adminnotify/repository.go internal/adminnotify/repository_test.go
git commit -m "feat(backend): adminnotify repository — filter-based recipient resolution, fanout send, read tracking"
```

---

### Task 3: `internal/adminnotify` — handler-lər (admin + user + shop)

**Files:**
- Create: `avtopulse-backend/internal/adminnotify/handler.go`
- Test: `avtopulse-backend/internal/adminnotify/handler_test.go`

**Interfaces:**
- Consumes: `Repository` (Task 2-dən — `PreviewRecipients`, `CreateAndSend`, `ListSent`, `ListForRecipient`, `CountUnread`, `MarkRead`), `user.SessionStore.Lookup(ctx, token) (int64, error)`, `auth.SessionStore.Lookup(ctx, token) (int64, error)` (shop tərəfi üçün — `internal/chat/handler.go`-dakı `requireShopSession` ilə eyni tip).
- Produces:
  - `func NewAdminHandler(repo Repository, adminSessionCheck func(*http.Request) bool) http.Handler` — chi router, `requireAdmin`-i çağıran, `/preview` (POST), `` (POST, "" = kök), `/sent` (GET) route-ları.

  Qeyd: admin auth `internal/admin` paketindəki `adminSessions`/`requireAdmin` private olduğu üçün paketdən kənara çıxarıla bilmir. Bunun əvəzinə `main.go`-da closure keçirilir: `adminHandler`-in özü artıq `requireAdmin`-i export etmir, ona görə bu tapşırıq `internal/admin` paketinə bir kiçik əlavə tələb edir (aşağıda Step 0-da).
  - `func NewUserHandler(repo Repository, sessions user.SessionStore) http.Handler` — `/` (GET, siyahı), `/unread-count` (GET), `/{id}/read` (POST).
  - `func NewShopHandler(repo Repository, sessions auth.SessionStore) http.Handler` — eyni üç route, shop_session ilə.

- [ ] **Step 0: `internal/admin`-ə kiçik export əlavəsi**

`internal/admin/handler.go`-da `adminHandlers.requireAdmin` metodunu paketdən kənara çıxarmaq üçün, mövcud strukturu dəyişdirmədən, bir export olunan wrapper əlavə et. `NewHandler` funksiyasının qaytardığı `http.Handler`-in daxilindəki `*adminHandlers`-ə xarici paketdən çatmaq mümkün olmadığı üçün, ən sadə həll: `admin` paketinə export olunan bir kömekçi function əlavə et ki, admin username/password-u yenidən qəbul edib sadə bir middleware qaytarsın (login zamanı yaradılan həmin in-memory sessions map-i `adminHandlers` daxilində qalır, ona görə bu, ayrıca, öz map-inə malik YENİ bir auth check olacaq — admin `/api/admin/login` zamanı `admin_session` cookie-si ARTIQ `internal/admin`-in öz sessions-ında yaranıb; `adminnotify` bu EYNİ cookie-ni sadəcə mövcudluğuna görə yox, `internal/admin`-in payı vasitəsilə etibarlılığını təsdiqləməlidir).

Bunu təmiz etmək üçün, `internal/admin/handler.go`-da bunu əlavə et (mövcud `adminHandlers` strukturunun bir metodudur, `requireAdmin`-in yanına):

```go
// RequireAdminMiddleware exposes this handler's admin-session check to other
// packages (e.g. internal/adminnotify) that need to gate their own routes
// behind the same admin_session cookie, without duplicating the session
// store or the login flow.
func (h *adminHandlers) RequireAdminMiddleware() func(http.HandlerFunc) http.HandlerFunc {
	return h.requireAdmin
}
```

`NewHandler`-in qaytardığı tipi `*adminHandlers`-dən `http.Handler`-ə cast etdiyi üçün, bu metoda çatmaq üçün `NewHandler`-in yanına ikinci bir constructor lazımdır ki, `*adminHandlers`-i özünü qaytarsın:

```go
// NewHandlerWithHooks is like NewHandler but also returns the underlying
// *adminHandlers so callers (main.go) can extract RequireAdminMiddleware()
// for other packages, without exposing adminHandlers itself.
func NewHandlerWithHooks(userRepo user.Repository, shopRepo shop.Repository, adminUsername, adminPassword string) (http.Handler, *adminHandlers) {
	h := &adminHandlers{
		userRepo: userRepo, shopRepo: shopRepo,
		username: adminUsername, password: adminPassword,
		sessions: newAdminSessions(),
	}
	r := chi.NewRouter()
	r.Post("/login", h.Login)
	r.Post("/logout", h.Logout)
	r.Get("/products/pending", h.requireAdmin(h.PendingProducts))
	r.Post("/products/{id}/approve", h.requireAdmin(h.ApproveProduct))
	r.Post("/products/{id}/reject", h.requireAdmin(h.RejectProduct))
	r.Get("/shop-products", h.requireAdmin(h.ListShopProducts))
	r.Post("/shop-products/{id}/cancel", h.requireAdmin(h.CancelShopProduct))
	return r, h
}
```

`main.go`-da `admin.NewHandler(...)` çağırışı `admin.NewHandlerWithHooks(...)` ilə əvəz olunacaq (Task 4-də) — `NewHandler` özü silinmir, geriyə uyğunluq üçün saxlanılır, sadəcə `main.go` yeni constructor-a keçir.

- [ ] **Step 1: `handler.go` yaz**

```go
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
```

- [ ] **Step 2: Handler testini yaz — `handler_test.go`**

```go
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
```

- [ ] **Step 3: Testləri işə sal**

Run: `cd avtopulse-backend && go test ./internal/adminnotify/... -v`
Expected: bütün 4 handler testi PASS (repository testləri `AVTOPULSE_TEST_DSN` yoxdursa SKIP olunacaq — qəbul edilir).

- [ ] **Step 4: Commit**

```bash
grep -rn 'Ɛ\|Ɔ' internal/adminnotify/ internal/admin/handler.go
git add internal/adminnotify/handler.go internal/adminnotify/handler_test.go internal/admin/handler.go
git commit -m "feat(backend): adminnotify handlers (admin send/preview/list, user+shop list/unread/read) + admin auth export"
```

---

### Task 4: `main.go` — mount et

**Files:**
- Modify: `avtopulse-backend/cmd/server/main.go`

**Interfaces:**
- Consumes: `adminnotify.NewRepository(pool)`, `adminnotify.NewAdminHandler(repo, requireAdmin)`, `adminnotify.NewUserHandler(repo, userSessions)`, `adminnotify.NewShopHandler(repo, sessions)`, `admin.NewHandlerWithHooks(...)` (Task 3-dən).

- [ ] **Step 1: Import əlavə et**

`cmd/server/main.go`-un import blokuna əlavə et:

```go
"github.com/CavadJava/avtopulse-backend/internal/adminnotify"
```

- [ ] **Step 2: `admin.NewHandler` çağırışını `NewHandlerWithHooks`-a dəyiş**

Mövcud sətri:
```go
adminHandler := admin.NewHandler(userRepo, shopRepo, adminUsername, adminPassword)
```
bununla əvəz et:
```go
adminHandler, adminHandlerHooks := admin.NewHandlerWithHooks(userRepo, shopRepo, adminUsername, adminPassword)
```

- [ ] **Step 3: Repository yarat + üç handler-i mount et**

`adminHandler`-in bütün mövcud `r.Post("/api/admin/...")` mount sətirlərindən SONRA (fayl sonuna, `addr := ":" + port`-dan əvvəl) əlavə et:

```go
adminNotifyRepo := adminnotify.NewRepository(pool)
adminNotifyAdminHandler := adminnotify.NewAdminHandler(adminNotifyRepo, adminHandlerHooks.RequireAdminMiddleware())
r.Post("/api/admin/notifications/preview", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/admin/notifications", adminNotifyAdminHandler).ServeHTTP(w, req)
})
r.Post("/api/admin/notifications", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/admin/notifications", adminNotifyAdminHandler).ServeHTTP(w, req)
})
r.Get("/api/admin/notifications/sent", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/admin/notifications", adminNotifyAdminHandler).ServeHTTP(w, req)
})

adminNotifyUserHandler := adminnotify.NewUserHandler(adminNotifyRepo, userSessions)
r.Get("/api/users/me/notifications", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/users/me/notifications", adminNotifyUserHandler).ServeHTTP(w, req)
})
r.Get("/api/users/me/notifications/unread-count", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/users/me/notifications", adminNotifyUserHandler).ServeHTTP(w, req)
})
r.Post("/api/users/me/notifications/{id}/read", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/users/me/notifications", adminNotifyUserHandler).ServeHTTP(w, req)
})

adminNotifyShopHandler := adminnotify.NewShopHandler(adminNotifyRepo, sessions)
r.Get("/api/shops/me/notifications", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/shops/me/notifications", adminNotifyShopHandler).ServeHTTP(w, req)
})
r.Get("/api/shops/me/notifications/unread-count", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/shops/me/notifications", adminNotifyShopHandler).ServeHTTP(w, req)
})
r.Post("/api/shops/me/notifications/{id}/read", func(w http.ResponseWriter, req *http.Request) {
	http.StripPrefix("/api/shops/me/notifications", adminNotifyShopHandler).ServeHTTP(w, req)
})
```

Qeyd: `chi.URLParam(req, "id")` `{id}` seqmentinin `StripPrefix`-dən sonra da router-in öz mux-unda qalması ilə işləyir (chi mount pattern-i mövcud kodda artıq belədir, məs. `/api/admin/products/{id}/approve`), ona görə strip-prefix `/api/admin/notifications`-a qədər olmalı, `{id}` daxili handler-in öz chi router-inə buraxılmalıdır — yuxarıdakı kimi.

- [ ] **Step 4: Dərlə**

Run: `cd avtopulse-backend && go build ./...`
Expected: xətasız dərlənmə.

- [ ] **Step 5: Commit**

```bash
grep -rn 'Ɛ\|Ɔ' cmd/server/main.go
git add cmd/server/main.go
git commit -m "feat(backend): mount adminnotify routes (admin send/preview/sent, user+shop list/unread/read)"
```

---

### Task 5: Backend deploy + canlı yoxlama

**Files:** yoxdur (yalnız deploy + curl yoxlaması).

- [ ] **Step 1: Deploy et**

Mövcud backend deploy axını ilə (rsync + `go build` + `systemctl restart avtopulse-backend` server üzərində) dəyişiklikləri canlıya çıxar.

- [ ] **Step 2: Migrasiyanın tətbiq olunduğunu yoxla**

Run (serverdə və ya SSH ilə): `psql "$AVTOPULSE_DSN" -c "\dt avto444.admin_notif*"`
Expected: `avto444.admin_notifications` və `avto444.admin_notification_recipients` cədvəlləri görünür.

- [ ] **Step 3: Admin login edib preview/send/sent endpoint-lərini test et**

```bash
curl -s -c /tmp/admin.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/admin/login \
  -H 'Content-Type: application/json' -d '{"username":"...","password":"..."}'

curl -s -b /tmp/admin.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/admin/notifications/preview \
  -H 'Content-Type: application/json' -d '{"title":"t","body":"b","filters":{"recipientType":"user"}}'
# Expected: {"recipientCount": N}

curl -s -b /tmp/admin.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/admin/notifications \
  -H 'Content-Type: application/json' -d '{"title":"Test bildirişi","body":"Bu test bildirişidir","filters":{"recipientType":"user"}}'
# Expected: {"id": N, "recipientCount": N}

curl -s -b /tmp/admin.txt https://autopulse.157.180.73.79.sslip.io/api/admin/notifications/sent
# Expected: array with sentCount matching recipientCount above, readCount=0
```

- [ ] **Step 4: User tərəfdə görünürlüyü yoxla (mövcud user_session cookie ilə, məs. `/tmp/u.txt`-dən)**

```bash
curl -s -b /tmp/u.txt https://autopulse.157.180.73.79.sslip.io/api/users/me/notifications/unread-count
# Expected: {"unreadCount": >=1} (test bildirişi bu user-ə çatıbsa)

curl -s -b /tmp/u.txt https://autopulse.157.180.73.79.sslip.io/api/users/me/notifications
# Expected: array, ən yuxarıda test bildirişi

curl -s -b /tmp/u.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/users/me/notifications/1/read
# Expected: 204

curl -s -b /tmp/u.txt https://autopulse.157.180.73.79.sslip.io/api/users/me/notifications/unread-count
# Expected: unreadCount bir azalıb
```

- [ ] **Step 5: Test bildirişini təmizlə (əgər bu real istifadəçilərə görünəcəksə)**

Əgər Step 3-də göndərilən "Test bildirişi" real istifadəçilərin `/kabinet/bildirisler` səhifəsində görünəcəksə, serverdə birbaşa SQL ilə sil:

```bash
psql "$AVTOPULSE_DSN" -c "DELETE FROM avto444.admin_notification_recipients WHERE notification_id = (SELECT id FROM avto444.admin_notifications WHERE title = 'Test bildirişi');"
psql "$AVTOPULSE_DSN" -c "DELETE FROM avto444.admin_notifications WHERE title = 'Test bildirişi';"
```

---

### Task 6: Frontend API client-lər

**Files:**
- Create: `src/api/notifications.ts`
- Create: `src/api/adminNotify.ts`

**Interfaces:**
- Produces (`notifications.ts`):
  - `interface UserNotification { id: number; notificationId: number; title: string; body: string; isRead: boolean; createdAt: string; }`
  - `getMyNotifications(): Promise<UserNotification[]>`
  - `getMyNotificationsUnreadCount(): Promise<number>`
  - `markNotificationRead(id: number): Promise<void>`
  - `getShopNotifications(): Promise<UserNotification[]>`
  - `getShopNotificationsUnreadCount(): Promise<number>`
  - `markShopNotificationRead(id: number): Promise<void>`
- Produces (`adminNotify.ts`):
  - `interface NotificationFilters { recipientType?: 'user' | 'shop' | ''; balanceMin?: number; balanceMax?: number; createdFrom?: string; createdTo?: string; hasActiveListing?: boolean; hasNonVipActiveListing?: boolean; }`
  - `interface NotificationSummary { id: number; title: string; body: string; createdAt: string; sentCount: number; readCount: number; }`
  - `previewNotification(title: string, body: string, filters: NotificationFilters): Promise<number>`
  - `sendNotification(title: string, body: string, filters: NotificationFilters): Promise<{ id: number; recipientCount: number }>`
  - `getSentNotifications(): Promise<NotificationSummary[]>`

- [ ] **Step 1: `src/api/notifications.ts` yaz**

```typescript
// Real HTTP client for the avtopulse-backend Go service's admin-notification
// read endpoints — the recipient side (user_session / shop_session), mirroring
// src/api/chat.ts's split-by-session-type convention.

const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

export interface UserNotification {
  id: number;
  notificationId: number;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export async function getMyNotifications(): Promise<UserNotification[]> {
  const res = await fetch(`${API_BASE}/api/users/me/notifications`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`getMyNotifications failed: ${res.status}`);
  }
  return res.json();
}

export async function getMyNotificationsUnreadCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/users/me/notifications/unread-count`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.unreadCount ?? 0;
}

export async function markNotificationRead(id: number): Promise<void> {
  await fetch(`${API_BASE}/api/users/me/notifications/${id}/read`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function getShopNotifications(): Promise<UserNotification[]> {
  const res = await fetch(`${API_BASE}/api/shops/me/notifications`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`getShopNotifications failed: ${res.status}`);
  }
  return res.json();
}

export async function getShopNotificationsUnreadCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/shops/me/notifications/unread-count`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.unreadCount ?? 0;
}

export async function markShopNotificationRead(id: number): Promise<void> {
  await fetch(`${API_BASE}/api/shops/me/notifications/${id}/read`, {
    method: 'POST',
    credentials: 'include',
  });
}
```

- [ ] **Step 2: `src/api/adminNotify.ts` yaz**

```typescript
// Real HTTP client for the avtopulse-backend Go service's admin bulk-
// notification endpoints — send side, admin_session-gated, mirroring
// src/api/admin.ts's conventions.

const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

export interface NotificationFilters {
  recipientType?: 'user' | 'shop' | '';
  balanceMin?: number;
  balanceMax?: number;
  createdFrom?: string;
  createdTo?: string;
  hasActiveListing?: boolean;
  hasNonVipActiveListing?: boolean;
}

export interface NotificationSummary {
  id: number;
  title: string;
  body: string;
  createdAt: string;
  sentCount: number;
  readCount: number;
}

export class AdminNotifyUnauthorizedError extends Error {}

export async function previewNotification(
  title: string,
  body: string,
  filters: NotificationFilters
): Promise<number> {
  const res = await fetch(`${API_BASE}/api/admin/notifications/preview`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, filters }),
  });
  if (res.status === 401) {
    throw new AdminNotifyUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`previewNotification failed: ${res.status}`);
  }
  const data = await res.json();
  return data.recipientCount ?? 0;
}

export async function sendNotification(
  title: string,
  body: string,
  filters: NotificationFilters
): Promise<{ id: number; recipientCount: number }> {
  const res = await fetch(`${API_BASE}/api/admin/notifications`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, filters }),
  });
  if (res.status === 401) {
    throw new AdminNotifyUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`sendNotification failed: ${res.status}`);
  }
  return res.json();
}

export async function getSentNotifications(): Promise<NotificationSummary[]> {
  const res = await fetch(`${API_BASE}/api/admin/notifications/sent`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new AdminNotifyUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getSentNotifications failed: ${res.status}`);
  }
  return res.json();
}
```

- [ ] **Step 3: Tip yoxlaması**

Run: `npx tsc -b --noEmit`
Expected: xətasız.

- [ ] **Step 4: Commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/api/notifications.ts src/api/adminNotify.ts
git add src/api/notifications.ts src/api/adminNotify.ts
git commit -m "feat(frontend): API clients for admin bulk notifications (send side + recipient side)"
```

---

### Task 7: Kabinet "Bildirişlər" səhifəsi + nav badge

**Files:**
- Create: `src/pages/kabinet/KabinetBildirisler.tsx`
- Create: `src/pages/kabinet/KabinetBildirisler.module.css`
- Modify: `src/pages/kabinet/KabinetLayout.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getMyNotifications`, `getMyNotificationsUnreadCount`, `markNotificationRead` (Task 6-dan).

- [ ] **Step 1: `KabinetBildirisler.tsx` yaz**

```tsx
import { useEffect, useState } from 'react';
import { getMyNotifications, markNotificationRead } from '../../api/notifications';
import type { UserNotification } from '../../api/notifications';
import styles from './KabinetBildirisler.module.css';

export default function KabinetBildirisler() {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setNotifications(await getMyNotifications());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleOpen = async (n: UserNotification) => {
    if (n.isRead) return;
    await markNotificationRead(n.notificationId);
    setNotifications((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
    );
  };

  if (loading) {
    return <p className={styles.empty}>Yüklənir...</p>;
  }

  if (notifications.length === 0) {
    return <p className={styles.empty}>Hələ heç bir bildiriş yoxdur.</p>;
  }

  return (
    <div className={styles.page}>
      {notifications.map((n) => (
        <button
          key={n.id}
          className={n.isRead ? styles.item : styles.itemUnread}
          onClick={() => handleOpen(n)}
        >
          <div className={styles.itemHeader}>
            <span className={styles.itemTitle}>{n.title}</span>
            {!n.isRead && <span className={styles.dot} />}
          </div>
          <p className={styles.itemBody}>{n.body}</p>
          <span className={styles.itemDate}>{new Date(n.createdAt).toLocaleDateString('az-AZ')}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `KabinetBildirisler.module.css` yaz**

```css
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.item,
.itemUnread {
  text-align: left;
  padding: var(--space-4);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.itemUnread {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.itemHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.itemTitle {
  font-weight: 600;
  font-size: 14px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}

.itemBody {
  font-size: 13px;
  color: var(--text-secondary);
}

.itemDate {
  font-size: 11px;
  color: var(--text-secondary);
}

.empty {
  color: var(--text-secondary);
  font-size: 13px;
  padding: var(--space-4);
}
```

- [ ] **Step 3: `KabinetLayout.tsx`-ə tab + badge əlavə et**

`KabinetLayout.tsx`-in `TABS` massivinə, "Mesajlarım"-dan sonra əlavə et:

```typescript
{ to: '/kabinet/bildirisler', label: 'Bildirişlər', icon: '🔔', end: false },
```

Yeni `notifUnread` state və polling əlavə et (mövcud `unreadCount` pattern-inin yanında):

```typescript
import { getMyNotificationsUnreadCount } from '../../api/notifications';
// ...
const [notifUnread, setNotifUnread] = useState(0);

useEffect(() => {
  if (!user) return;
  const poll = async () => {
    try {
      setUnreadCount(await getUnreadCount());
      setNotifUnread(await getMyNotificationsUnreadCount());
    } catch {
      // Non-fatal — badges just stay at their last known value.
    }
  };
  poll();
  const interval = setInterval(poll, 4000);
  return () => clearInterval(interval);
}, [user]);
```

Nav render-də badge şərtini genişlət:

```tsx
{tab.to === '/kabinet/mesajlarim' && unreadCount > 0 && (
  <span className={styles.badge}>{unreadCount}</span>
)}
{tab.to === '/kabinet/bildirisler' && notifUnread > 0 && (
  <span className={styles.badge}>{notifUnread}</span>
)}
```

- [ ] **Step 4: `App.tsx`-ə route əlavə et**

`import KabinetMesajlarim from './pages/kabinet/KabinetMesajlarim';` sətrindən sonra:

```typescript
import KabinetBildirisler from './pages/kabinet/KabinetBildirisler';
```

`<Route path="mesajlarim" element={<KabinetMesajlarim />} />`-dən sonra:

```tsx
<Route path="bildirisler" element={<KabinetBildirisler />} />
```

- [ ] **Step 5: Dərlə + tip yoxla**

Run: `npx tsc -b --noEmit && npm run build`
Expected: xətasız.

- [ ] **Step 6: Commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/kabinet/KabinetBildirisler.tsx src/pages/kabinet/KabinetBildirisler.module.css src/pages/kabinet/KabinetLayout.tsx src/App.tsx
git add src/pages/kabinet/KabinetBildirisler.tsx src/pages/kabinet/KabinetBildirisler.module.css src/pages/kabinet/KabinetLayout.tsx src/App.tsx
git commit -m "feat(frontend): Kabinet Bildirişlər page + unread badge"
```

---

### Task 8: Mağaza "Bildirişlər" səhifəsi + nav badge

**Files:**
- Create: `src/pages/shop/MyShopBildirisler.tsx`
- Create: `src/pages/shop/MyShopBildirisler.module.css`
- Modify: `src/pages/shop/MyShop.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getShopNotifications`, `getShopNotificationsUnreadCount`, `markShopNotificationRead` (Task 6-dan).

- [ ] **Step 1: `MyShopBildirisler.tsx` yaz**

`KabinetBildirisler.tsx` ilə eyni struktur, `MyShop`-un standalone-route pattern-inə (bax `MyShopMesajlar.tsx`) uyğun, öz `.page` sətirlərini (`padding`/`max-width`/`margin`/`color`) daxil edən CSS ilə:

```tsx
import { useEffect, useState } from 'react';
import { getShopNotifications, markShopNotificationRead } from '../../api/notifications';
import type { UserNotification } from '../../api/notifications';
import styles from './MyShopBildirisler.module.css';

export default function MyShopBildirisler() {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setNotifications(await getShopNotifications());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleOpen = async (n: UserNotification) => {
    if (n.isRead) return;
    await markShopNotificationRead(n.notificationId);
    setNotifications((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
    );
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>Yüklənir...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {notifications.length === 0 ? (
        <p className={styles.empty}>Hələ heç bir bildiriş yoxdur.</p>
      ) : (
        notifications.map((n) => (
          <button
            key={n.id}
            className={n.isRead ? styles.item : styles.itemUnread}
            onClick={() => handleOpen(n)}
          >
            <div className={styles.itemHeader}>
              <span className={styles.itemTitle}>{n.title}</span>
              {!n.isRead && <span className={styles.dot} />}
            </div>
            <p className={styles.itemBody}>{n.body}</p>
            <span className={styles.itemDate}>{new Date(n.createdAt).toLocaleDateString('az-AZ')}</span>
          </button>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: `MyShopBildirisler.module.css` yaz**

`KabinetBildirisler.module.css`-in eyni surəti, üstünə `.page`-ə tam səhifə stilləri əlavə olunmuş (Task-ın CSS-bug fix-indən öyrənilən nümunə üzrə, `MyShopMesajlar.module.css`-in `.page`-i ilə eyni):

```css
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-10) var(--space-6) var(--space-16);
  max-width: var(--max-width);
  margin: 0 auto;
  color: var(--text-primary);
}

.item,
.itemUnread {
  text-align: left;
  padding: var(--space-4);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.itemUnread {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.itemHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.itemTitle {
  font-weight: 600;
  font-size: 14px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}

.itemBody {
  font-size: 13px;
  color: var(--text-secondary);
}

.itemDate {
  font-size: 11px;
  color: var(--text-secondary);
}

.empty {
  color: var(--text-secondary);
  font-size: 13px;
  padding: var(--space-4);
}
```

- [ ] **Step 3: `MyShop.tsx`-ə nav link + badge əlavə et**

`MyShop.tsx`-də mövcud (sətir ~368) `<Link to="/magazam/mesajlar" className={styles.logoutBtn}>...` sətirindən sonra, eyni pattern ilə:

```tsx
<Link to="/magazam/bildirisler" className={styles.logoutBtn}>
  🔔 Bildirişlər{notifUnread > 0 ? ` (${notifUnread})` : ''}
</Link>
```

`getShopUnreadCount` import-unun yanına:

```typescript
import { getShopNotificationsUnreadCount } from '../../api/notifications';
```

Mövcud `unreadCount` state/polling-in yanına (sətir ~102 ətrafı, `setUnreadCount(await getShopUnreadCount());`):

```typescript
const [notifUnread, setNotifUnread] = useState(0);
// ...
setNotifUnread(await getShopNotificationsUnreadCount());
```

(Eyni `useEffect`/`setInterval` blokunun daxilinə, mövcud `getShopUnreadCount()` çağırışının yanına əlavə et — MyShop.tsx-in polling effect-inin dəqiq strukturunu Read ilə yoxlayıb uyğunlaşdır.)

- [ ] **Step 4: `App.tsx`-ə route əlavə et**

`import MyShopMesajlar from './pages/shop/MyShopMesajlar';`-dan sonra:

```typescript
import MyShopBildirisler from './pages/shop/MyShopBildirisler';
```

`<Route path="/magazam/mesajlar" element={<MyShopMesajlar />} />`-dan sonra:

```tsx
<Route path="/magazam/bildirisler" element={<MyShopBildirisler />} />
```

- [ ] **Step 5: Dərlə + tip yoxla**

Run: `npx tsc -b --noEmit && npm run build`
Expected: xətasız.

- [ ] **Step 6: Commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/shop/MyShopBildirisler.tsx src/pages/shop/MyShopBildirisler.module.css src/pages/shop/MyShop.tsx src/App.tsx
git add src/pages/shop/MyShopBildirisler.tsx src/pages/shop/MyShopBildirisler.module.css src/pages/shop/MyShop.tsx src/App.tsx
git commit -m "feat(frontend): MyShop Bildirişlər page + unread badge"
```

---

### Task 9: Admin panelinə "Bildirişlər" tab-ı (filtr forması + göndərmə + tarixçə)

**Files:**
- Modify: `src/pages/AdminDashboard.tsx`
- Modify: `src/pages/AdminDashboard.module.css`

**Interfaces:**
- Consumes: `previewNotification`, `sendNotification`, `getSentNotifications` (Task 6-dan).

- [ ] **Step 1: `AdminDashboard.tsx`-ə import + state əlavə et**

Mövcud importlara əlavə:

```typescript
import { previewNotification, sendNotification, getSentNotifications } from '../api/adminNotify';
import type { NotificationFilters, NotificationSummary } from '../api/adminNotify';
```

`activeTab` tipini genişlət:

```typescript
const [activeTab, setActiveTab] = useState<'pending' | 'shopProducts' | 'notifications'>('pending');
```

Yeni state-lər (mövcud `actingId`-dən sonra):

```typescript
const [notifTitle, setNotifTitle] = useState('');
const [notifBody, setNotifBody] = useState('');
const [notifRecipientType, setNotifRecipientType] = useState<'user' | 'shop' | ''>('');
const [notifHasNonVip, setNotifHasNonVip] = useState(false);
const [previewCount, setPreviewCount] = useState<number | null>(null);
const [sending, setSending] = useState(false);
const [sentList, setSentList] = useState<NotificationSummary[]>([]);
```

- [ ] **Step 2: Filtr obyektini quran helper + preview/göndər handler-ləri əlavə et**

```typescript
const buildFilters = (): NotificationFilters => ({
  recipientType: notifRecipientType,
  ...(notifHasNonVip ? { hasNonVipActiveListing: true } : {}),
});

const handlePreview = async () => {
  try {
    setPreviewCount(await previewNotification(notifTitle || '(preview)', notifBody || '(preview)', buildFilters()));
  } catch (err) {
    if (err instanceof AdminUnauthorizedError) {
      navigate('/admin');
      return;
    }
    setNotice('Alıcı sayı hesablanarkən xəta baş verdi.');
  }
};

const loadSent = async () => {
  const data = await getSentNotifications();
  setSentList(data);
};

const handleSend = async () => {
  if (!notifTitle || !notifBody) {
    setNotice('Başlıq və mətn tələb olunur.');
    return;
  }
  setSending(true);
  setNotice(null);
  try {
    const result = await sendNotification(notifTitle, notifBody, buildFilters());
    setNotice(`Bildiriş ${result.recipientCount} alıcıya göndərildi.`);
    setNotifTitle('');
    setNotifBody('');
    setPreviewCount(null);
    await loadSent();
  } catch (err) {
    if (err instanceof AdminUnauthorizedError) {
      navigate('/admin');
      return;
    }
    setNotice('Bildiriş göndərilərkən xəta baş verdi.');
  } finally {
    setSending(false);
  }
};
```

`AdminUnauthorizedError`-i mövcud import sətirinə əlavə et (artıq import olunub, dəyişiklik lazım deyil).

`loadAll`-a `loadSent()`-i əlavə et:

```typescript
await Promise.all([loadPending(), loadShopProducts(), loadSent()]);
```

- [ ] **Step 3: Tab bar-a üçüncü düymə əlavə et**

```tsx
<button
  className={activeTab === 'notifications' ? styles.tabActive : styles.tab}
  onClick={() => setActiveTab('notifications')}
>
  Bildirişlər ({sentList.length})
</button>
```

- [ ] **Step 4: Yeni tab bloku əlavə et**

`{activeTab === 'shopProducts' && (...)}` blokundan sonra:

```tsx
{activeTab === 'notifications' && (
  <div className={styles.list}>
    <div className={styles.row}>
      <div className={styles.rowInfo} style={{ width: '100%' }}>
        <input
          className={styles.formInput}
          placeholder="Başlıq"
          value={notifTitle}
          onChange={(e) => setNotifTitle(e.target.value)}
        />
        <textarea
          className={styles.formInput}
          placeholder="Mətn"
          value={notifBody}
          onChange={(e) => setNotifBody(e.target.value)}
          rows={3}
        />
        <div className={styles.rowDetails}>
          <label>
            <input
              type="radio"
              checked={notifRecipientType === ''}
              onChange={() => setNotifRecipientType('')}
            />{' '}
            Hər ikisi
          </label>{' '}
          <label>
            <input
              type="radio"
              checked={notifRecipientType === 'user'}
              onChange={() => setNotifRecipientType('user')}
            />{' '}
            Yalnız istifadəçilər
          </label>{' '}
          <label>
            <input
              type="radio"
              checked={notifRecipientType === 'shop'}
              onChange={() => setNotifRecipientType('shop')}
            />{' '}
            Yalnız mağazalar
          </label>
        </div>
        <div className={styles.rowDetails}>
          <label>
            <input
              type="checkbox"
              checked={notifHasNonVip}
              onChange={(e) => setNotifHasNonVip(e.target.checked)}
            />{' '}
            Yalnız VIP olmayan aktiv elanı olanlar
          </label>
        </div>
      </div>
      <div className={styles.rowActions}>
        <button className={styles.approveBtn} onClick={handlePreview}>
          Neçəyə çatacaq?
        </button>
        <button className={styles.approveBtn} onClick={handleSend} disabled={sending}>
          {sending ? '...' : 'Göndər'}
        </button>
      </div>
    </div>
    {previewCount !== null && (
      <p className={styles.status}>Bu filtrlərlə {previewCount} alıcıya çatacaq.</p>
    )}

    <h3>Göndərilmiş bildirişlər</h3>
    {sentList.length === 0 ? (
      <p className={styles.status}>Hələ heç bir bildiriş göndərilməyib.</p>
    ) : (
      sentList.map((n) => (
        <div key={n.id} className={styles.row}>
          <div className={styles.rowInfo}>
            <div className={styles.rowTitle}>{n.title}</div>
            <div className={styles.rowDetails}>{n.body}</div>
            <span className={styles.statusBadge}>
              Göndərildi: {n.sentCount} / Oxundu: {n.readCount}
            </span>
          </div>
        </div>
      ))
    )}
  </div>
)}
```

- [ ] **Step 5: `AdminDashboard.module.css`-ə `.formInput` əlavə et**

Mövcud `.row`/`.rowInfo` stillərinin yanına:

```css
.formInput {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  margin-bottom: var(--space-2);
}
```

- [ ] **Step 6: Dərlə + tip yoxla**

Run: `npx tsc -b --noEmit && npm run build`
Expected: xətasız.

- [ ] **Step 7: Commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/AdminDashboard.tsx src/pages/AdminDashboard.module.css
git add src/pages/AdminDashboard.tsx src/pages/AdminDashboard.module.css
git commit -m "feat(frontend): AdminDashboard Bildirişlər tab — filter form, preview, send, sent/read history"
```

---

### Task 10: Frontend deploy + canlı yoxlama (əl ilə, brauzer avtomatlaşdırması olmadan)

**Files:** yoxdur.

- [ ] **Step 1: Deploy et**

```bash
git push origin main
bash deploy/deploy.sh
```

- [ ] **Step 2: Admin panelində canlı yoxlama**

`https://<frontend-domain>/admin` → login → Dashboard → "Bildirişlər" tab-ına keç, filtr seç, "Neçəyə çatacaq?" düyməsinə bas, saya bax. Real göndərmə etməzdən əvvəl istifadəçiyə xəbər ver ki, real istifadəçilərə çatacaq (test datası deyil, filtrlərə uyğun canlı istifadəçilər).

- [ ] **Step 3: Kabinet/Mağaza tərəfdə görünürlüyü yoxla**

`/kabinet/bildirisler` və `/magazam/bildirisler`-ə uyğun test hesabları ilə daxil olub, badge/say/oxuma davranışını yoxla.

---

## Xülasə — Task Sırası

1. Migrasiya
2. Repository (+ test)
3. Handler-lər (+ test) + admin auth export
4. `main.go` mount
5. Backend deploy + canlı yoxlama
6. Frontend API client-lər
7. Kabinet səhifəsi
8. Mağaza səhifəsi
9. Admin dashboard tab-ı
10. Frontend deploy + canlı yoxlama
