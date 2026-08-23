package user

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrSessionNotFound = errors.New("user: session not found or expired")

const sessionTTL = 7 * 24 * time.Hour

type SessionStore interface {
	Create(ctx context.Context, userID int64) (string, error)
	Lookup(ctx context.Context, token string) (int64, error)
	Delete(ctx context.Context, token string) error
}

type pgSessionStore struct {
	pool *pgxpool.Pool
}

func NewSessionStore(pool *pgxpool.Pool) SessionStore {
	return &pgSessionStore{pool: pool}
}

func (s *pgSessionStore) Create(ctx context.Context, userID int64) (string, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", err
	}
	token := hex.EncodeToString(tokenBytes)

	_, err := s.pool.Exec(ctx,
		`INSERT INTO avto444.user_sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
		token, userID, time.Now().Add(sessionTTL),
	)
	if err != nil {
		return "", err
	}
	return token, nil
}

func (s *pgSessionStore) Lookup(ctx context.Context, token string) (int64, error) {
	var userID int64
	var expiresAt time.Time
	err := s.pool.QueryRow(ctx,
		`SELECT user_id, expires_at FROM avto444.user_sessions WHERE token = $1`,
		token,
	).Scan(&userID, &expiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrSessionNotFound
	}
	if err != nil {
		return 0, err
	}
	if time.Now().After(expiresAt) {
		return 0, ErrSessionNotFound
	}
	return userID, nil
}

func (s *pgSessionStore) Delete(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM avto444.user_sessions WHERE token = $1`, token)
	return err
}
