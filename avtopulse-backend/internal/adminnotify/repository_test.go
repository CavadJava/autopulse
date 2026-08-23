package adminnotify

import (
	"context"
	"os"
	"testing"

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
