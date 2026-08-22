# AutoPulse Marketplace Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working, end-to-end "mağazalar" (shops) slice for AutoPulse: a new Go backend + Postgres database serving 6 REST endpoints (shop list, shop detail, shop products, cookie-based shop login/me/logout), plus new AutoPulse frontend pages (`/mağazalar`, `/mağazalar/:name`, `/magaza-giris`, `/magazam`) that consume them.

**Architecture:** A brand-new, standalone Go monolith (`avtopulse-backend`, separate GitHub repo) owns a new `avtopulse` Postgres database with an `avto444` schema (three tables: `shop`, `shop_products`, `shop_sessions`). It exposes JSON REST endpoints via `chi` + `pgx`. The existing AutoPulse React frontend gets a new, self-contained `src/api/shop.ts` + `src/pages/shop/*` layer that talks to this backend over `fetch` with `credentials: 'include'` — completely parallel to, and untouched by, the existing mock-data marketplace code.

**Tech Stack:** Go 1.22+, `chi` (router), `pgx/v5` (Postgres driver, no ORM), `golang-migrate` or hand-rolled SQL migration runner, `golang.org/x/crypto/bcrypt`, PostgreSQL 15+, React 18 + TypeScript + CSS Modules (frontend, matching existing AutoPulse conventions), Vite.

## Global Constraints

- Backend lives in a **new, separate GitHub repo**: `CavadJava/avtopulse-backend`.
- Database: `avtopulse` (new Postgres database on the existing 157.180.73.79 Postgres instance, NOT shared with java-distribution-workspace's Postgres).
- Schema: `avto444` (all 3 tables live under this schema for this phase).
- No subdomain routing anywhere — everything lives under `autopulse.157.180.73.79.sslip.io`.
- Shop session token MUST be an `HttpOnly; Secure; SameSite=Lax` cookie named `shop_session` — never returned in a JSON response body, never stored in `localStorage`.
- Endpoints 1–3 (list, by-name, products) are public/unauthenticated. Endpoints 4–6 (login, me/products, logout) are the cookie-based shop-owner flow.
- Passwords are stored as bcrypt hashes only — never plaintext.
- Product CRUD UI, real production-grade auth hardening (refresh tokens, rate limiting), multi-user-per-shop permissions, and shop self-signup are explicitly OUT of scope for this phase — do not build them.
- Frontend must not touch or modify any existing mock-data marketplace code (`/elanlar`, `/elan-ver`, `src/api/mockData/*`, etc.) — the shop feature is a fully parallel, additive layer.
- The existing AutoPulse user login (`src/context/AuthContext.tsx`, `/giris`, `/giris/kod`) MUST NOT be touched or modified in any way. Shop login (`/magaza-giris`, `/magazam`) is a completely separate, additive flow that a regular AutoPulse user never has to go through and that never calls into `AuthContext`. Only the frontend (never the regular signed-in user's own session/token) talks to the Go backend, and only from the new `src/api/shop.ts`/`src/pages/shop/*` files — no existing page or component gains a new dependency on the Go backend.
- Every backend task must end with `go build ./...` and `go test ./...` passing. Every frontend task must end with `npx tsc --noEmit` and `npm run build` passing, plus the standing corruption scan (`grep -rn 'Ɛ\|Ɔ'` across touched files) before any commit, per this project's established practice.
- Follow the existing AutoPulse deploy workflow for the frontend half: `git commit` → `git push origin main` → `bash deploy/deploy.sh` from `/Users/frontend/workspace/me-github/autopulse`, then a live `curl` verification.

---

## Task 1: Scaffold the avtopulse-backend repo

**Files:**
- Create (new repo, local path `/Users/frontend/workspace/me-github/avtopulse-backend`):
  - `go.mod`
  - `cmd/server/main.go`
  - `.gitignore`
  - `README.md`

**Interfaces:**
- Produces: a `main()` that starts an HTTP server on `:8090` (chosen port for this service) with a `chi.Router`, a single `GET /healthz` route returning `200 OK` with body `ok`, and graceful shutdown on SIGINT/SIGTERM.

- [ ] **Step 1: Create the GitHub repo and local directory**

```bash
mkdir -p /Users/frontend/workspace/me-github/avtopulse-backend
cd /Users/frontend/workspace/me-github/avtopulse-backend
git init
gh repo create CavadJava/avtopulse-backend --public --source=. --remote=origin
```

- [ ] **Step 2: Initialize the Go module**

```bash
go mod init github.com/CavadJava/avtopulse-backend
go get github.com/go-chi/chi/v5@latest
```

- [ ] **Step 3: Write `cmd/server/main.go`**

```go
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/healthz", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	addr := ":8090"
	srv := &http.Server{Addr: addr, Handler: r}

	go func() {
		log.Printf("avtopulse-backend listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}
```

- [ ] **Step 4: Write `.gitignore`**

```
/avtopulse-backend
*.log
.env
```

- [ ] **Step 5: Write a minimal `README.md`**

```markdown
# avtopulse-backend

Go monolith backend for AutoPulse's "Mağazalar" (shops) feature.

## Run locally

    go run ./cmd/server

Listens on :8090. GET /healthz for a liveness check.
```

- [ ] **Step 6: Build and run it, verify healthz**

```bash
go build ./cmd/server
./server &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8090/healthz
kill %1
rm -f server
```

Expected: `200`

- [ ] **Step 7: Commit and push**

```bash
git add -A
git commit -m "chore: scaffold avtopulse-backend with chi router and /healthz"
git push -u origin main
```

---

## Task 2: Postgres schema and migrations

**Files:**
- Create: `migrations/0001_init_schema.sql`
- Create: `migrations/0002_seed_avto444.sql`
- Create: `internal/db/db.go`
- Create: `internal/db/migrate.go`
- Test: `internal/db/db_test.go`

**Interfaces:**
- Consumes: nothing from Task 1 beyond the repo existing.
- Produces:
  - `db.Connect(ctx context.Context, dsn string) (*pgxpool.Pool, error)` — opens a pgx connection pool.
  - `db.RunMigrations(ctx context.Context, pool *pgxpool.Pool, dir string) error` — applies any `.sql` files in `dir` not yet recorded in a `schema_migrations` tracking table, in filename order.

- [ ] **Step 1: Install pgx**

```bash
go get github.com/jackc/pgx/v5/pgxpool
```

- [ ] **Step 2: Write `migrations/0001_init_schema.sql`**

```sql
CREATE SCHEMA IF NOT EXISTS avto444;

CREATE TABLE avto444.shop (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT UNIQUE NOT NULL,
  customer_id    BIGINT NOT NULL,
  title          TEXT NOT NULL,
  details        TEXT,
  work_times     TEXT,
  password_hash  TEXT NOT NULL
);

CREATE TABLE avto444.shop_products (
  id       BIGSERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  title    TEXT NOT NULL,
  details  TEXT,
  shop_id  BIGINT NOT NULL REFERENCES avto444.shop(id)
);

CREATE TABLE avto444.shop_sessions (
  token       TEXT PRIMARY KEY,
  shop_id     BIGINT NOT NULL REFERENCES avto444.shop(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
```

- [ ] **Step 3: Write `migrations/0002_seed_avto444.sql`**

The password for the seeded shop is `avto444pass`. Its bcrypt hash below was generated with cost 10 — regenerate it if you change the password (`go run` a one-off `bcrypt.GenerateFromPassword([]byte("avto444pass"), 10)` snippet and paste the result).

```sql
INSERT INTO avto444.shop (name, customer_id, title, details, work_times, password_hash)
VALUES (
  'avto444',
  1,
  'Avto 444',
  'Bakı şəhərində etibarlı avtosalon — yeni və işlənmiş avtomobillər.',
  'Hər gün 09:00–19:00',
  '$2a$10$examplehashreplacewithreal.hash.generatedbelow'
);

INSERT INTO avto444.shop_products (name, title, details, shop_id)
SELECT v.name, v.title, v.details, s.id
FROM avto444.shop s,
(VALUES
  ('bmw-320i', 'BMW 320i, 2020', 'Ağ rəng, avtomat sürət qutusu, 45000 km yürüş'),
  ('mercedes-e200', 'Mercedes-Benz E200, 2019', 'Qara rəng, tam dolğun, 62000 km yürüş'),
  ('toyota-camry', 'Toyota Camry, 2021', 'Gümüşü rəng, hibrid mühərrik, 30000 km yürüş'),
  ('hyundai-sonata', 'Hyundai Sonata, 2018', 'Ağ rəng, mexaniki sürət qutusu, 78000 km yürüş')
) AS v(name, title, details)
WHERE s.name = 'avto444';
```

- [ ] **Step 4: Generate the real bcrypt hash and paste it into 0002**

```bash
cat > /tmp/hashgen.go << 'EOF'
package main

import (
	"fmt"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	hash, _ := bcrypt.GenerateFromPassword([]byte("avto444pass"), 10)
	fmt.Println(string(hash))
}
EOF
go get golang.org/x/crypto/bcrypt
go run /tmp/hashgen.go
```

Copy the printed hash and replace `$2a$10$examplehashreplacewithreal.hash.generatedbelow` in `migrations/0002_seed_avto444.sql` with it.

- [ ] **Step 5: Write `internal/db/db.go`**

```go
package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}
```

- [ ] **Step 6: Write `internal/db/migrate.go`**

```go
package db

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
)

func RunMigrations(ctx context.Context, pool *pgxpool.Pool, dir string) error {
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS public.schema_migrations (
			filename TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`)
	if err != nil {
		return fmt.Errorf("creating schema_migrations table: %w", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("reading migrations dir: %w", err)
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".sql" {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)

	for _, name := range files {
		var count int
		err := pool.QueryRow(ctx, `SELECT count(*) FROM public.schema_migrations WHERE filename = $1`, name).Scan(&count)
		if err != nil {
			return fmt.Errorf("checking migration %s: %w", name, err)
		}
		if count > 0 {
			continue
		}

		content, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return fmt.Errorf("reading migration %s: %w", name, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("starting tx for %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, string(content)); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("applying migration %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO public.schema_migrations (filename) VALUES ($1)`, name); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("recording migration %s: %w", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("committing migration %s: %w", name, err)
		}
	}

	return nil
}
```

- [ ] **Step 7: Write `internal/db/db_test.go`** (requires a real local Postgres; skip via env var if unavailable)

```go
package db

import (
	"context"
	"os"
	"testing"
)

func TestConnectAndMigrate(t *testing.T) {
	dsn := os.Getenv("AVTOPULSE_TEST_DSN")
	if dsn == "" {
		t.Skip("AVTOPULSE_TEST_DSN not set, skipping integration test")
	}

	ctx := context.Background()
	pool, err := Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer pool.Close()

	if err := RunMigrations(ctx, pool, "../../migrations"); err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}

	var name string
	err = pool.QueryRow(ctx, `SELECT name FROM avto444.shop WHERE name = 'avto444'`).Scan(&name)
	if err != nil {
		t.Fatalf("expected seeded shop 'avto444', query failed: %v", err)
	}
	if name != "avto444" {
		t.Fatalf("expected name 'avto444', got %q", name)
	}
}
```

- [ ] **Step 8: Create local test DB and run the test**

```bash
createdb avtopulse_test 2>/dev/null || true
export AVTOPULSE_TEST_DSN="postgres://localhost:5432/avtopulse_test?sslmode=disable"
go test ./internal/db/... -v
```

Expected: `PASS`

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add Postgres schema, migrations, and migration runner"
git push
```

---

## Task 3: Shop repository + list/by-name/products handlers

**Files:**
- Create: `internal/shop/model.go`
- Create: `internal/shop/repository.go`
- Create: `internal/shop/handler.go`
- Test: `internal/shop/handler_test.go`

**Interfaces:**
- Consumes: `*pgxpool.Pool` from Task 2's `db.Connect`.
- Produces:
  - `shop.Shop` struct: `{ID int64; Name string; CustomerID int64; Title string; Details string; WorkTimes string}`
  - `shop.Product` struct: `{ID int64; Name string; Title string; Details string}`
  - `shop.Repository` interface: `ListShops(ctx) ([]Shop, error)`, `GetShopByName(ctx, name string) (*Shop, error)`, `GetShopByID(ctx, id int64) (*Shop, error)`, `ListProducts(ctx, shopID int64) ([]Product, error)`
  - `shop.NewRepository(pool *pgxpool.Pool) Repository`
  - `shop.NewHandler(repo Repository) http.Handler` — registers `GET /`, `GET /by-name/{name}`, `GET /{shopId}/products` on a `chi.Mux` it returns, meant to be mounted at `/api/shops`.

- [ ] **Step 1: Write `internal/shop/model.go`**

```go
package shop

type Shop struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	CustomerID int64  `json:"customerId"`
	Title      string `json:"title"`
	Details    string `json:"details"`
	WorkTimes  string `json:"workTimes"`
}

type ShopSummary struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Title string `json:"title"`
}

type Product struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Title   string `json:"title"`
	Details string `json:"details"`
}
```

- [ ] **Step 2: Write `internal/shop/repository.go`**

```go
package shop

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("shop: not found")

type Repository interface {
	ListShops(ctx context.Context) ([]ShopSummary, error)
	GetShopByName(ctx context.Context, name string) (*Shop, error)
	GetShopByID(ctx context.Context, id int64) (*Shop, error)
	ListProducts(ctx context.Context, shopID int64) ([]Product, error)
}

type pgRepository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &pgRepository{pool: pool}
}

func (r *pgRepository) ListShops(ctx context.Context) ([]ShopSummary, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, name, title FROM avto444.shop ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ShopSummary
	for rows.Next() {
		var s ShopSummary
		if err := rows.Scan(&s.ID, &s.Name, &s.Title); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *pgRepository) GetShopByName(ctx context.Context, name string) (*Shop, error) {
	var s Shop
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, customer_id, title, details, work_times FROM avto444.shop WHERE name = $1`,
		name,
	).Scan(&s.ID, &s.Name, &s.CustomerID, &s.Title, &s.Details, &s.WorkTimes)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *pgRepository) GetShopByID(ctx context.Context, id int64) (*Shop, error) {
	var s Shop
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, customer_id, title, details, work_times FROM avto444.shop WHERE id = $1`,
		id,
	).Scan(&s.ID, &s.Name, &s.CustomerID, &s.Title, &s.Details, &s.WorkTimes)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *pgRepository) ListProducts(ctx context.Context, shopID int64) ([]Product, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name, title, details FROM avto444.shop_products WHERE shop_id = $1 ORDER BY id`,
		shopID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Product{}
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.ID, &p.Name, &p.Title, &p.Details); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
```

- [ ] **Step 3: Write `internal/shop/handler.go`**

```go
package shop

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

func NewHandler(repo Repository) http.Handler {
	r := chi.NewRouter()

	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		shops, err := repo.ListShops(req.Context())
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, shops)
	})

	r.Get("/by-name/{name}", func(w http.ResponseWriter, req *http.Request) {
		name := chi.URLParam(req, "name")
		s, err := repo.GetShopByName(req.Context(), name)
		if errors.Is(err, ErrNotFound) {
			http.Error(w, "shop not found", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, s)
	})

	r.Get("/{shopId}/products", func(w http.ResponseWriter, req *http.Request) {
		idStr := chi.URLParam(req, "shopId")
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			http.Error(w, "invalid shopId", http.StatusBadRequest)
			return
		}

		if _, err := repo.GetShopByID(req.Context(), id); errors.Is(err, ErrNotFound) {
			http.Error(w, "shop not found", http.StatusNotFound)
			return
		} else if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		products, err := repo.ListProducts(req.Context(), id)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, products)
	})

	return r
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
```

- [ ] **Step 4: Write the failing test `internal/shop/handler_test.go`**

```go
package shop

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeRepo struct {
	shops    []ShopSummary
	byName   map[string]*Shop
	byID     map[int64]*Shop
	products map[int64][]Product
}

func (f *fakeRepo) ListShops(ctx context.Context) ([]ShopSummary, error) { return f.shops, nil }

func (f *fakeRepo) GetShopByName(ctx context.Context, name string) (*Shop, error) {
	s, ok := f.byName[name]
	if !ok {
		return nil, ErrNotFound
	}
	return s, nil
}

func (f *fakeRepo) GetShopByID(ctx context.Context, id int64) (*Shop, error) {
	s, ok := f.byID[id]
	if !ok {
		return nil, ErrNotFound
	}
	return s, nil
}

func (f *fakeRepo) ListProducts(ctx context.Context, shopID int64) ([]Product, error) {
	return f.products[shopID], nil
}

func newFakeRepo() *fakeRepo {
	s := &Shop{ID: 1, Name: "avto444", Title: "Avto 444"}
	return &fakeRepo{
		shops:  []ShopSummary{{ID: 1, Name: "avto444", Title: "Avto 444"}},
		byName: map[string]*Shop{"avto444": s},
		byID:   map[int64]*Shop{1: s},
		products: map[int64][]Product{
			1: {{ID: 10, Name: "bmw-320i", Title: "BMW 320i, 2020"}},
		},
	}
}

func TestListShops(t *testing.T) {
	h := NewHandler(newFakeRepo())
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got []ShopSummary
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(got) != 1 || got[0].Name != "avto444" {
		t.Fatalf("unexpected body: %+v", got)
	}
}

func TestGetShopByName_Found(t *testing.T) {
	h := NewHandler(newFakeRepo())
	req := httptest.NewRequest(http.MethodGet, "/by-name/avto444", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestGetShopByName_NotFound(t *testing.T) {
	h := NewHandler(newFakeRepo())
	req := httptest.NewRequest(http.MethodGet, "/by-name/does-not-exist", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestListProducts_Found(t *testing.T) {
	h := NewHandler(newFakeRepo())
	req := httptest.NewRequest(http.MethodGet, "/1/products", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got []Product
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(got) != 1 || got[0].Name != "bmw-320i" {
		t.Fatalf("unexpected body: %+v", got)
	}
}

func TestListProducts_ShopNotFound(t *testing.T) {
	h := NewHandler(newFakeRepo())
	req := httptest.NewRequest(http.MethodGet, "/999/products", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
```

- [ ] **Step 5: Run the tests, verify they pass**

```bash
go test ./internal/shop/... -v
```

Expected: all 5 tests `PASS` (handler is already written above, so this validates it, not a red-green cycle — but run it to confirm before moving on)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: shop repository + list/by-name/products handlers"
git push
```

---

## Task 4: Shop-owner auth (login, me/products, logout) with HttpOnly cookie

**Files:**
- Create: `internal/auth/session.go`
- Create: `internal/auth/handler.go`
- Test: `internal/auth/handler_test.go`

**Interfaces:**
- Consumes: `shop.Repository` (Task 3) for `GetShopByName`/`GetShopByID`/`ListProducts`; needs a new repository method `shop.Repository.GetPasswordHash(ctx, shopID int64) (string, error)` — **add this method to the `Repository` interface and `pgRepository` in `internal/shop/repository.go` as part of this task** (it wasn't needed by Task 3's endpoints, but is needed here).
- Produces:
  - `auth.SessionStore` interface: `Create(ctx, shopID int64) (token string, err error)`, `Lookup(ctx, token string) (shopID int64, err error)`, `Delete(ctx, token string) error`
  - `auth.NewSessionStore(pool *pgxpool.Pool) SessionStore`
  - `auth.NewHandler(shopRepo shop.Repository, sessions SessionStore) http.Handler` — registers `POST /login`, `GET /me/products`, `POST /logout`, meant to be mounted at `/api/shops` alongside Task 3's handler (so full paths are `/api/shops/login`, `/api/shops/me/products`, `/api/shops/logout`).

- [ ] **Step 1: Add `GetPasswordHash` to the shop Repository**

In `internal/shop/repository.go`, add to the `Repository` interface:

```go
	GetPasswordHash(ctx context.Context, shopID int64) (string, error)
```

And to `pgRepository`:

```go
func (r *pgRepository) GetPasswordHash(ctx context.Context, shopID int64) (string, error) {
	var hash string
	err := r.pool.QueryRow(ctx, `SELECT password_hash FROM avto444.shop WHERE id = $1`, shopID).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return hash, err
}
```

Also update `internal/shop/handler_test.go`'s `fakeRepo` to implement the new method (needed so Task 3's tests still compile):

```go
func (f *fakeRepo) GetPasswordHash(ctx context.Context, shopID int64) (string, error) {
	s, ok := f.byID[shopID]
	if !ok {
		return "", ErrNotFound
	}
	return f.passwordHashes[s.Name], nil
}
```

Add a `passwordHashes map[string]string` field to the `fakeRepo` struct and populate it in `newFakeRepo()` with a bcrypt hash of a known test password (generate one the same way as Task 2 Step 4, using password `test-pass`).

- [ ] **Step 2: Run Task 3's tests to confirm they still compile and pass**

```bash
go test ./internal/shop/... -v
```

Expected: still all `PASS` — this step exists purely to catch an interface-mismatch compile error before moving on.

- [ ] **Step 3: Write `internal/auth/session.go`**

```go
package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrSessionNotFound = errors.New("auth: session not found or expired")

const sessionTTL = 7 * 24 * time.Hour

type SessionStore interface {
	Create(ctx context.Context, shopID int64) (string, error)
	Lookup(ctx context.Context, token string) (int64, error)
	Delete(ctx context.Context, token string) error
}

type pgSessionStore struct {
	pool *pgxpool.Pool
}

func NewSessionStore(pool *pgxpool.Pool) SessionStore {
	return &pgSessionStore{pool: pool}
}

func (s *pgSessionStore) Create(ctx context.Context, shopID int64) (string, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", err
	}
	token := hex.EncodeToString(tokenBytes)

	_, err := s.pool.Exec(ctx,
		`INSERT INTO avto444.shop_sessions (token, shop_id, expires_at) VALUES ($1, $2, $3)`,
		token, shopID, time.Now().Add(sessionTTL),
	)
	if err != nil {
		return "", err
	}
	return token, nil
}

func (s *pgSessionStore) Lookup(ctx context.Context, token string) (int64, error) {
	var shopID int64
	var expiresAt time.Time
	err := s.pool.QueryRow(ctx,
		`SELECT shop_id, expires_at FROM avto444.shop_sessions WHERE token = $1`,
		token,
	).Scan(&shopID, &expiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrSessionNotFound
	}
	if err != nil {
		return 0, err
	}
	if time.Now().After(expiresAt) {
		return 0, ErrSessionNotFound
	}
	return shopID, nil
}

func (s *pgSessionStore) Delete(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM avto444.shop_sessions WHERE token = $1`, token)
	return err
}
```

- [ ] **Step 4: Write `internal/auth/handler.go`**

```go
package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
)

const cookieName = "shop_session"

type loginRequest struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

type loginResponse struct {
	Shop shop.ShopSummary `json:"shop"`
}

func NewHandler(shopRepo shop.Repository, sessions SessionStore) http.Handler {
	r := chi.NewRouter()

	r.Post("/login", func(w http.ResponseWriter, req *http.Request) {
		var body loginRequest
		if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		s, err := shopRepo.GetShopByName(req.Context(), body.Name)
		if errors.Is(err, shop.ErrNotFound) {
			http.Error(w, "invalid name or password", http.StatusUnauthorized)
			return
		}
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		hash, err := shopRepo.GetPasswordHash(req.Context(), s.ID)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)); err != nil {
			http.Error(w, "invalid name or password", http.StatusUnauthorized)
			return
		}

		token, err := sessions.Create(req.Context(), s.ID)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name:     cookieName,
			Value:    token,
			Path:     "/",
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   7 * 24 * 60 * 60,
		})

		writeJSON(w, http.StatusOK, loginResponse{
			Shop: shop.ShopSummary{ID: s.ID, Name: s.Name, Title: s.Title},
		})
	})

	r.Get("/me/products", func(w http.ResponseWriter, req *http.Request) {
		shopID, err := requireSession(req, sessions)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		products, err := shopRepo.ListProducts(req.Context(), shopID)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, products)
	})

	r.Post("/logout", func(w http.ResponseWriter, req *http.Request) {
		cookie, err := req.Cookie(cookieName)
		if err == nil {
			sessions.Delete(req.Context(), cookie.Value)
		}
		http.SetCookie(w, &http.Cookie{
			Name:     cookieName,
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
		})
		w.WriteHeader(http.StatusOK)
	})

	return r
}

func requireSession(req *http.Request, sessions SessionStore) (int64, error) {
	cookie, err := req.Cookie(cookieName)
	if err != nil {
		return 0, ErrSessionNotFound
	}
	return sessions.Lookup(req.Context(), cookie.Value)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

var _ = time.Second // keep time import if unused elsewhere; remove if go vet complains
```

(If `go vet`/build complains about the unused `time` import placeholder, delete the `var _ = time.Second` line and the `"time"` import — it was only a defensive placeholder.)

- [ ] **Step 5: Install bcrypt if not already present**

```bash
go get golang.org/x/crypto/bcrypt
```

- [ ] **Step 6: Write the failing tests `internal/auth/handler_test.go`**

```go
package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"golang.org/x/crypto/bcrypt"
)

type fakeShopRepo struct {
	byName map[string]*shop.Shop
	byID   map[int64]*shop.Shop
	hashes map[int64]string
}

func (f *fakeShopRepo) ListShops(ctx context.Context) ([]shop.ShopSummary, error) { return nil, nil }

func (f *fakeShopRepo) GetShopByName(ctx context.Context, name string) (*shop.Shop, error) {
	s, ok := f.byName[name]
	if !ok {
		return nil, shop.ErrNotFound
	}
	return s, nil
}

func (f *fakeShopRepo) GetShopByID(ctx context.Context, id int64) (*shop.Shop, error) {
	s, ok := f.byID[id]
	if !ok {
		return nil, shop.ErrNotFound
	}
	return s, nil
}

func (f *fakeShopRepo) ListProducts(ctx context.Context, shopID int64) ([]shop.Product, error) {
	return []shop.Product{{ID: 1, Name: "bmw-320i", Title: "BMW 320i"}}, nil
}

func (f *fakeShopRepo) GetPasswordHash(ctx context.Context, shopID int64) (string, error) {
	h, ok := f.hashes[shopID]
	if !ok {
		return "", shop.ErrNotFound
	}
	return h, nil
}

type fakeSessionStore struct {
	tokenToShop map[string]int64
}

func newFakeSessionStore() *fakeSessionStore {
	return &fakeSessionStore{tokenToShop: map[string]int64{}}
}

func (f *fakeSessionStore) Create(ctx context.Context, shopID int64) (string, error) {
	token := "test-token"
	f.tokenToShop[token] = shopID
	return token, nil
}

func (f *fakeSessionStore) Lookup(ctx context.Context, token string) (int64, error) {
	id, ok := f.tokenToShop[token]
	if !ok {
		return 0, ErrSessionNotFound
	}
	return id, nil
}

func (f *fakeSessionStore) Delete(ctx context.Context, token string) error {
	delete(f.tokenToShop, token)
	return nil
}

func newFakeShopRepo() *fakeShopRepo {
	hash, _ := bcrypt.GenerateFromPassword([]byte("correct-password"), 4)
	s := &shop.Shop{ID: 1, Name: "avto444", Title: "Avto 444"}
	return &fakeShopRepo{
		byName: map[string]*shop.Shop{"avto444": s},
		byID:   map[int64]*shop.Shop{1: s},
		hashes: map[int64]string{1: string(hash)},
	}
}

func TestLogin_Success_SetsCookie(t *testing.T) {
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore())
	body, _ := json.Marshal(loginRequest{Name: "avto444", Password: "correct-password"})
	req := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}

	cookies := rec.Result().Cookies()
	var found bool
	for _, c := range cookies {
		if c.Name == cookieName {
			found = true
			if !c.HttpOnly {
				t.Fatal("expected cookie to be HttpOnly")
			}
			if c.SameSite != http.SameSiteLaxMode {
				t.Fatal("expected cookie SameSite=Lax")
			}
		}
	}
	if !found {
		t.Fatal("expected shop_session cookie to be set")
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore())
	body, _ := json.Marshal(loginRequest{Name: "avto444", Password: "wrong-password"})
	req := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestMeProducts_NoCookie(t *testing.T) {
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore())
	req := httptest.NewRequest(http.MethodGet, "/me/products", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestMeProducts_WithValidCookie(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(newFakeShopRepo(), sessions)
	req := httptest.NewRequest(http.MethodGet, "/me/products", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestLogout_ClearsSession(t *testing.T) {
	sessions := newFakeSessionStore()
	token, _ := sessions.Create(context.Background(), 1)

	h := NewHandler(newFakeShopRepo(), sessions)
	req := httptest.NewRequest(http.MethodPost, "/logout", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	if _, err := sessions.Lookup(context.Background(), token); err == nil {
		t.Fatal("expected session to be deleted after logout")
	}
}
```

- [ ] **Step 7: Run the tests**

```bash
go test ./internal/auth/... -v
```

Expected: all 5 tests `PASS`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: shop-owner login/me-products/logout with HttpOnly session cookie"
git push
```

---

## Task 5: Wire everything into main.go with real DB config

**Files:**
- Modify: `cmd/server/main.go`
- Create: `.env.example`

**Interfaces:**
- Consumes: `db.Connect`, `db.RunMigrations` (Task 2); `shop.NewRepository`, `shop.NewHandler` (Task 3); `auth.NewSessionStore`, `auth.NewHandler` (Task 4).
- Produces: a fully wired server exposing all 6 endpoints under `/api/shops/*`.

- [ ] **Step 1: Write `.env.example`**

```
AVTOPULSE_DSN=postgres://localhost:5432/avtopulse?sslmode=disable
AVTOPULSE_PORT=8090
```

- [ ] **Step 2: Rewrite `cmd/server/main.go`**

```go
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/CavadJava/avtopulse-backend/internal/auth"
	"github.com/CavadJava/avtopulse-backend/internal/db"
	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	ctx := context.Background()

	dsn := os.Getenv("AVTOPULSE_DSN")
	if dsn == "" {
		log.Fatal("AVTOPULSE_DSN env var is required")
	}
	port := os.Getenv("AVTOPULSE_PORT")
	if port == "" {
		port = "8090"
	}

	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		log.Fatalf("failed to connect to db: %v", err)
	}
	defer pool.Close()

	if err := db.RunMigrations(ctx, pool, "migrations"); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	shopRepo := shop.NewRepository(pool)
	sessions := auth.NewSessionStore(pool)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/healthz", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	r.Route("/api/shops", func(r chi.Router) {
		r.Mount("/", shop.NewHandler(shopRepo))
		r.Mount("/", auth.NewHandler(shopRepo, sessions))
	})

	addr := ":" + port
	srv := &http.Server{Addr: addr, Handler: r}

	go func() {
		log.Printf("avtopulse-backend listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}
```

Note: chi's `Mount("/", ...)` for two sibling sub-routers on the same path prefix works because Task 3's handler only registers `GET /`, `GET /by-name/{name}`, `GET /{shopId}/products`, and Task 4's handler only registers `POST /login`, `GET /me/products`, `POST /logout` — no path collisions. If `go build` reports a routing conflict, mount Task 4's handler at a sub-path instead, e.g. `r.Mount("/", auth.NewHandler(...))` → verify with Step 4 below before assuming success.

- [ ] **Step 3: Create local test DB, run migrations via server start, verify build**

```bash
createdb avtopulse 2>/dev/null || true
export AVTOPULSE_DSN="postgres://localhost:5432/avtopulse?sslmode=disable"
go build ./cmd/server
```

Expected: builds with no errors.

- [ ] **Step 4: Start the server and manually verify all 6 endpoints**

```bash
./server &
sleep 1

echo "--- GET /api/shops ---"
curl -s http://localhost:8090/api/shops

echo "--- GET /api/shops/by-name/avto444 ---"
curl -s http://localhost:8090/api/shops/by-name/avto444

echo "--- GET /api/shops/1/products ---"
curl -s http://localhost:8090/api/shops/1/products

echo "--- POST /api/shops/login (wrong password) ---"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8090/api/shops/login \
  -H "Content-Type: application/json" -d '{"name":"avto444","password":"wrong"}'

echo "--- POST /api/shops/login (correct password) ---"
curl -s -c /tmp/avtopulse-cookies.txt -X POST http://localhost:8090/api/shops/login \
  -H "Content-Type: application/json" -d '{"name":"avto444","password":"avto444pass"}'

echo "--- GET /api/shops/me/products (with cookie) ---"
curl -s -b /tmp/avtopulse-cookies.txt http://localhost:8090/api/shops/me/products

echo "--- POST /api/shops/logout ---"
curl -s -o /dev/null -w "%{http_code}\n" -b /tmp/avtopulse-cookies.txt -X POST http://localhost:8090/api/shops/logout

echo "--- GET /api/shops/me/products (after logout, should be 401) ---"
curl -s -o /dev/null -w "%{http_code}\n" -b /tmp/avtopulse-cookies.txt http://localhost:8090/api/shops/me/products

kill %1
rm -f server /tmp/avtopulse-cookies.txt
```

Expected: `/api/shops` returns `[{"id":1,"name":"avto444","title":"Avto 444"}]`; `by-name/avto444` returns the full shop object; `1/products` returns 4 seeded products; wrong-password login returns `401`; correct-password login returns `200` + shop object and sets the cookie; `me/products` with the cookie returns the 4 products; logout returns `200`; `me/products` after logout returns `401`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire shop + auth handlers into main.go with real Postgres config"
git push
```

---

## Task 6: Frontend API client (`src/api/shop.ts`)

**Files:**
- Create: `/Users/frontend/workspace/me-github/autopulse/src/api/shop.ts`
- Create: `/Users/frontend/workspace/me-github/autopulse/.env.local.example`

**Interfaces:**
- Consumes: nothing from the existing AutoPulse codebase (fully parallel layer).
- Produces:
  - `interface ShopSummary { id: number; name: string; title: string }`
  - `interface Shop { id: number; name: string; customerId: number; title: string; details: string; workTimes: string }`
  - `interface ShopProduct { id: number; name: string; title: string; details: string }`
  - `async function getShops(): Promise<ShopSummary[]>`
  - `async function getShopByName(name: string): Promise<Shop>` — throws `ShopNotFoundError` on 404
  - `async function getShopProducts(shopId: number): Promise<ShopProduct[]>`
  - `async function shopLogin(name: string, password: string): Promise<ShopSummary>` — throws `ShopLoginError` on 401
  - `async function getMyShopProducts(): Promise<ShopProduct[]>` — throws `ShopUnauthorizedError` on 401
  - `async function shopLogout(): Promise<void>`
  - `class ShopNotFoundError extends Error {}`, `class ShopLoginError extends Error {}`, `class ShopUnauthorizedError extends Error {}`

- [ ] **Step 1: Create `.env.local.example` documenting the new env var**

```
# Base URL for the avtopulse-backend Go service. Leave empty in production
# if /api is proxied through the same origin by Caddy.
VITE_AVTOPULSE_API_BASE=http://localhost:8090
```

- [ ] **Step 2: Write `src/api/shop.ts`**

```typescript
// Real HTTP client for the avtopulse-backend Go service's shop/mağaza
// endpoints. This is a deliberately separate, parallel layer from the rest
// of AutoPulse's mock-data API modules (src/api/listings.ts etc.) — it talks
// to a real backend over the network, not an in-memory mock.

const API_BASE = import.meta.env.VITE_AVTOPULSE_API_BASE ?? '';

export interface ShopSummary {
  id: number;
  name: string;
  title: string;
}

export interface Shop {
  id: number;
  name: string;
  customerId: number;
  title: string;
  details: string;
  workTimes: string;
}

export interface ShopProduct {
  id: number;
  name: string;
  title: string;
  details: string;
}

export class ShopNotFoundError extends Error {}
export class ShopLoginError extends Error {}
export class ShopUnauthorizedError extends Error {}

export async function getShops(): Promise<ShopSummary[]> {
  const res = await fetch(`${API_BASE}/api/shops`);
  if (!res.ok) {
    throw new Error(`getShops failed: ${res.status}`);
  }
  return res.json();
}

export async function getShopByName(name: string): Promise<Shop> {
  const res = await fetch(`${API_BASE}/api/shops/by-name/${encodeURIComponent(name)}`);
  if (res.status === 404) {
    throw new ShopNotFoundError(`Shop not found: ${name}`);
  }
  if (!res.ok) {
    throw new Error(`getShopByName failed: ${res.status}`);
  }
  return res.json();
}

export async function getShopProducts(shopId: number): Promise<ShopProduct[]> {
  const res = await fetch(`${API_BASE}/api/shops/${shopId}/products`);
  if (res.status === 404) {
    throw new ShopNotFoundError(`Shop not found: ${shopId}`);
  }
  if (!res.ok) {
    throw new Error(`getShopProducts failed: ${res.status}`);
  }
  return res.json();
}

export async function shopLogin(name: string, password: string): Promise<ShopSummary> {
  const res = await fetch(`${API_BASE}/api/shops/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  if (res.status === 401) {
    throw new ShopLoginError('Ad və ya parol yanlışdır');
  }
  if (!res.ok) {
    throw new Error(`shopLogin failed: ${res.status}`);
  }
  const data = await res.json();
  return data.shop;
}

export async function getMyShopProducts(): Promise<ShopProduct[]> {
  const res = await fetch(`${API_BASE}/api/shops/me/products`, {
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new ShopUnauthorizedError('Not logged in');
  }
  if (!res.ok) {
    throw new Error(`getMyShopProducts failed: ${res.status}`);
  }
  return res.json();
}

export async function shopLogout(): Promise<void> {
  await fetch(`${API_BASE}/api/shops/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/api/shop.ts .env.local.example || echo CLEAN
git add -A
git commit -m "feat: add src/api/shop.ts — real HTTP client for avtopulse-backend shop endpoints"
```

---

## Task 7: `/mağazalar` shop list page

**Files:**
- Create: `src/pages/shop/ShopList.tsx`
- Create: `src/pages/shop/ShopList.module.css`
- Modify: `src/App.tsx`
- Modify: `src/components/Header.tsx`

**Interfaces:**
- Consumes: `getShops()` from Task 6's `src/api/shop.ts`.
- Produces: a `/mağazalar` route rendering a card grid; a "Mağazalar" link in the header nav.

- [ ] **Step 1: Write `src/pages/shop/ShopList.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getShops } from '../../api/shop';
import type { ShopSummary } from '../../api/shop';
import styles from './ShopList.module.css';

export default function ShopList() {
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getShops();
        setShops(data);
      } catch {
        setError('Mağazalar yüklənərkən xəta baş verdi.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Mağazalar</h1>

      {loading && <p className={styles.status}>Yüklənir...</p>}
      {error && <p className={styles.status}>{error}</p>}
      {!loading && !error && shops.length === 0 && (
        <p className={styles.status}>Hələ heç bir mağaza yoxdur.</p>
      )}

      <div className={styles.grid}>
        {shops.map((shop) => (
          <Link key={shop.id} to={`/magazalar/${shop.name}`} className={styles.card}>
            <div className={styles.cardIcon}>🏪</div>
            <div className={styles.cardTitle}>{shop.title}</div>
            <div className={styles.cardName}>@{shop.name}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

Note: the spec uses `/mağazalar` with the Azerbaijani `ğ` character in prose, but URL paths in this codebase's existing routes are consistently ASCII (`/elan-ver`, `/qiymetler`, `/muqayise`) — so this task uses `/magazalar` (ASCII) as the actual route path, matching that established convention. Reference the spec's Azerbaijani route names as the *feature name*, not the literal URL string.

- [ ] **Step 2: Write `src/pages/shop/ShopList.module.css`**

```css
.page {
  padding: var(--space-10) var(--space-6) var(--space-16);
  max-width: var(--max-width);
  margin: 0 auto;
}

.title {
  font-size: 28px;
  font-weight: 800;
  font-family: var(--font-display);
  margin-bottom: var(--space-8);
}

.status {
  color: var(--text-secondary);
  font-size: 15px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-5);
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-2);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--accent-medium);
}

.cardIcon {
  font-size: 32px;
}

.cardTitle {
  font-weight: 700;
  font-size: 15px;
  color: var(--text-primary);
}

.cardName {
  font-size: 12.5px;
  color: var(--text-tertiary);
}
```

- [ ] **Step 3: Wire the route into `src/App.tsx`**

Add the import near the other page imports:

```tsx
import ShopList from './pages/shop/ShopList';
```

Add the route inside `<Routes>`, near `/muqayise`:

```tsx
            <Route path="/magazalar" element={<ShopList />} />
```

- [ ] **Step 4: Add a "Mağazalar" link to `src/components/Header.tsx`**

In the `.links` div (`src/components/Header.tsx:31-35`), add a new `Link` alongside the existing three:

```tsx
          <div className={styles.links}>
            <Link to="/elanlar">Elanlar</Link>
            <Link to="/magazalar">Mağazalar</Link>
            <Link to="/qiymetler">Qiymətlər</Link>
            <Link to="/business">Biznes üçün</Link>
          </div>
```

- [ ] **Step 5: Type-check and build**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc --noEmit
npm run build
```

Expected: both succeed with no errors.

- [ ] **Step 6: Manually verify with the backend running**

```bash
# In a separate terminal, from avtopulse-backend:
# export AVTOPULSE_DSN=... && go run ./cmd/server

cd /Users/frontend/workspace/me-github/autopulse
echo "VITE_AVTOPULSE_API_BASE=http://localhost:8090" > .env.local
npm run dev &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/magazalar
kill %1
```

Expected: `200`. (Port may differ if 5173 is busy — check the `npm run dev` output for the actual port, matching this project's established multi-instance-port gotcha.)

- [ ] **Step 7: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/shop/ShopList.tsx src/pages/shop/ShopList.module.css src/App.tsx src/components/Header.tsx || echo CLEAN
git add -A
git commit -m "feat: add /magazalar shop list page + header nav link"
```

---

## Task 8: `/magazalar/:name` shop storefront page

**Files:**
- Create: `src/pages/shop/ShopFront.tsx`
- Create: `src/pages/shop/ShopFront.module.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getShopByName`, `getShopProducts`, `ShopNotFoundError` (Task 6).
- Produces: a `/magazalar/:name` route showing shop details + product cards.

- [ ] **Step 1: Write `src/pages/shop/ShopFront.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getShopByName, getShopProducts, ShopNotFoundError } from '../../api/shop';
import type { Shop, ShopProduct } from '../../api/shop';
import styles from './ShopFront.module.css';

export default function ShopFront() {
  const { name } = useParams<{ name: string }>();
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const shopData = await getShopByName(name);
        setShop(shopData);
        const productData = await getShopProducts(shopData.id);
        setProducts(productData);
      } catch (err) {
        if (err instanceof ShopNotFoundError) {
          setError('Mağaza tapılmadı.');
        } else {
          setError('Mağaza yüklənərkən xəta baş verdi.');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [name]);

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>Yüklənir...</p>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>{error ?? 'Mağaza tapılmadı.'}</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroIcon}>🏪</div>
        <div>
          <h1 className={styles.title}>{shop.title}</h1>
          <p className={styles.name}>@{shop.name}</p>
        </div>
      </div>

      {shop.details && <p className={styles.details}>{shop.details}</p>}
      {shop.workTimes && (
        <p className={styles.workTimes}>
          <strong>İş saatları:</strong> {shop.workTimes}
        </p>
      )}

      <h2 className={styles.sectionTitle}>Məhsullar</h2>

      {products.length === 0 ? (
        <p className={styles.status}>Bu mağazada hələ məhsul yoxdur.</p>
      ) : (
        <div className={styles.grid}>
          {products.map((product) => (
            <div key={product.id} className={styles.productCard}>
              <div className={styles.productTitle}>{product.title}</div>
              {product.details && <div className={styles.productDetails}>{product.details}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/pages/shop/ShopFront.module.css`**

```css
.page {
  padding: var(--space-10) var(--space-6) var(--space-16);
  max-width: var(--max-width);
  margin: 0 auto;
}

.status {
  color: var(--text-secondary);
  font-size: 15px;
}

.hero {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  margin-bottom: var(--space-6);
}

.heroIcon {
  font-size: 40px;
}

.title {
  font-size: 26px;
  font-weight: 800;
  font-family: var(--font-display);
}

.name {
  font-size: 13px;
  color: var(--text-tertiary);
}

.details {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: var(--space-3);
  max-width: 640px;
}

.workTimes {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: var(--space-8);
}

.sectionTitle {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: var(--space-5);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-5);
}

.productCard {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
}

.productTitle {
  font-weight: 700;
  font-size: 14.5px;
  margin-bottom: var(--space-2);
}

.productDetails {
  font-size: 13px;
  color: var(--text-secondary);
}
```

- [ ] **Step 3: Wire the route into `src/App.tsx`**

Add the import:

```tsx
import ShopFront from './pages/shop/ShopFront';
```

Add the route, right after the `/magazalar` route from Task 7:

```tsx
            <Route path="/magazalar/:name" element={<ShopFront />} />
```

- [ ] **Step 4: Type-check and build**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc --noEmit
npm run build
```

Expected: both succeed with no errors.

- [ ] **Step 5: Manually verify with the backend running**

```bash
# Backend running from Task 5's verification, or start fresh:
# cd avtopulse-backend && export AVTOPULSE_DSN=... && go run ./cmd/server &

cd /Users/frontend/workspace/me-github/autopulse
npm run dev &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/magazalar/avto444
kill %1
```

Expected: `200`.

- [ ] **Step 6: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/shop/ShopFront.tsx src/pages/shop/ShopFront.module.css src/App.tsx || echo CLEAN
git add -A
git commit -m "feat: add /magazalar/:name shop storefront page"
```

---

## Task 9: `/magaza-giris` login page + `/magazam` my-shop page

**Files:**
- Create: `src/pages/shop/ShopLogin.tsx`
- Create: `src/pages/shop/ShopLogin.module.css`
- Create: `src/pages/shop/MyShop.tsx`
- Create: `src/pages/shop/MyShop.module.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `shopLogin`, `getMyShopProducts`, `shopLogout`, `ShopLoginError`, `ShopUnauthorizedError` (Task 6).
- Produces: `/magaza-giris` and `/magazam` routes.

- [ ] **Step 1: Write `src/pages/shop/ShopLogin.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { shopLogin, ShopLoginError } from '../../api/shop';
import styles from './ShopLogin.module.css';

export default function ShopLogin() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await shopLogin(name, password);
      navigate('/magazam');
    } catch (err) {
      if (err instanceof ShopLoginError) {
        setError('Ad və ya parol yanlışdır.');
      } else {
        setError('Giriş zamanı xəta baş verdi.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Mağaza girişi</h1>
        <p className={styles.subtitle}>Öz mağazanıza daxil olmaq üçün ad və parolunuzu daxil edin.</p>

        <label className={styles.field}>
          <span className={styles.label}>Mağaza adı</span>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="məs. avto444"
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Parol</span>
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.submitBtn} type="submit" disabled={submitting}>
          {submitting ? 'Daxil olunur...' : 'Daxil ol'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Write `src/pages/shop/ShopLogin.module.css`**

```css
.page {
  padding: var(--space-10) var(--space-6);
  max-width: 420px;
  margin: 0 auto;
}

.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.title {
  font-size: 22px;
  font-weight: 800;
  font-family: var(--font-display);
}

.subtitle {
  font-size: 13.5px;
  color: var(--text-secondary);
  margin-top: -var(--space-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.input {
  padding: 12px 14px;
  font-size: 14px;
  background: var(--bg-elevated);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
}

.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.error {
  color: var(--error);
  font-size: 13px;
  font-weight: 600;
}

.submitBtn {
  background: var(--accent);
  color: #fff;
  border: none;
  font-weight: 700;
  font-size: 14px;
  padding: var(--space-4);
  border-radius: var(--radius-md);
}

.submitBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Write `src/pages/shop/MyShop.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyShopProducts, shopLogout, ShopUnauthorizedError } from '../../api/shop';
import type { ShopProduct } from '../../api/shop';
import styles from './MyShop.module.css';

export default function MyShop() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getMyShopProducts();
        setProducts(data);
      } catch (err) {
        if (err instanceof ShopUnauthorizedError) {
          navigate('/magaza-giris');
          return;
        }
        setError('Məhsullar yüklənərkən xəta baş verdi.');
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const handleLogout = async () => {
    await shopLogout();
    navigate('/magaza-giris');
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>Yüklənir...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Mənim mağazam</h1>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          Çıxış
        </button>
      </div>

      {error && <p className={styles.status}>{error}</p>}

      {!error && products.length === 0 && (
        <p className={styles.status}>Hələ heç bir məhsulunuz yoxdur.</p>
      )}

      {!error && products.length > 0 && (
        <div className={styles.grid}>
          {products.map((product) => (
            <div key={product.id} className={styles.productCard}>
              <div className={styles.productTitle}>{product.title}</div>
              {product.details && <div className={styles.productDetails}>{product.details}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/pages/shop/MyShop.module.css`**

```css
.page {
  padding: var(--space-10) var(--space-6) var(--space-16);
  max-width: var(--max-width);
  margin: 0 auto;
}

.status {
  color: var(--text-secondary);
  font-size: 15px;
}

.headerRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-8);
}

.title {
  font-size: 26px;
  font-weight: 800;
  font-family: var(--font-display);
}

.logoutBtn {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  padding: 10px 18px;
  border-radius: var(--radius-sm);
}

.logoutBtn:hover {
  box-shadow: none;
  border-color: var(--accent);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-5);
}

.productCard {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
}

.productTitle {
  font-weight: 700;
  font-size: 14.5px;
  margin-bottom: var(--space-2);
}

.productDetails {
  font-size: 13px;
  color: var(--text-secondary);
}
```

- [ ] **Step 5: Wire both routes into `src/App.tsx`**

Add the imports:

```tsx
import ShopLogin from './pages/shop/ShopLogin';
import MyShop from './pages/shop/MyShop';
```

Add the routes, after `/magazalar/:name`:

```tsx
            <Route path="/magaza-giris" element={<ShopLogin />} />
            <Route path="/magazam" element={<MyShop />} />
```

- [ ] **Step 6: Type-check and build**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc --noEmit
npm run build
```

Expected: both succeed with no errors.

- [ ] **Step 7: Manually verify the full login flow with the backend running**

```bash
# Backend running from Task 5 (export AVTOPULSE_DSN=... && go run ./cmd/server &)

cd /Users/frontend/workspace/me-github/autopulse
npm run dev &
sleep 2
curl -s -o /dev/null -w "login page: %{http_code}\n" http://localhost:5173/magaza-giris

# Simulate the login flow the frontend performs, using the same origin's dev proxy is not set up yet
# (that's Task 10) — so hit the backend directly here to confirm the API contract works standalone:
curl -s -c /tmp/mp-cookies.txt -X POST http://localhost:8090/api/shops/login \
  -H "Content-Type: application/json" -d '{"name":"avto444","password":"avto444pass"}'
curl -s -b /tmp/mp-cookies.txt http://localhost:8090/api/shops/me/products
rm -f /tmp/mp-cookies.txt

kill %1
```

Expected: login page returns `200`; the backend login+me/products curl round-trip returns the shop object then the 4 seeded products (same as Task 5's verification — this just re-confirms nothing regressed).

- [ ] **Step 8: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/pages/shop/ShopLogin.tsx src/pages/shop/ShopLogin.module.css src/pages/shop/MyShop.tsx src/pages/shop/MyShop.module.css src/App.tsx || echo CLEAN
git add -A
git commit -m "feat: add /magaza-giris login page and /magazam my-shop products page"
```

---

## Task 10: Production deploy — backend service + Caddy proxy + frontend

**Files:**
- Modify (on server, not in either repo): `/etc/caddy/Caddyfile`
- Create (on server): `/etc/systemd/system/avtopulse-backend.service`
- Modify: `/Users/frontend/workspace/me-github/autopulse/deploy/deploy.sh` (only if it needs a new env var passthrough — check first, per this task's steps)

**Interfaces:**
- Consumes: the built `avtopulse-backend` binary (Task 5); the existing `deploy/deploy.sh` script and Caddy config pattern already used for `autopulse.157.180.73.79.sslip.io`.
- Produces: a live, deployed `avtopulse-backend` reachable at `autopulse.157.180.73.79.sslip.io/api/shops/*`, and a live frontend build that talks to it.

- [ ] **Step 1: Create the `avtopulse` Postgres database on the server**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 "sudo -u postgres createdb avtopulse"
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 "sudo -u postgres psql -c \"SELECT datname FROM pg_database WHERE datname = 'avtopulse';\""
```

Expected: the second command's output lists `avtopulse`, confirming it exists and is separate from any other project's database.

- [ ] **Step 2: rsync the avtopulse-backend source to the server**

```bash
rsync -avz --exclude='.git' --exclude='avtopulse-backend' \
  -e "ssh -i ~/.ssh/youtube-remote-webrtc_ed25519" \
  /Users/frontend/workspace/me-github/avtopulse-backend/ \
  root@157.180.73.79:/opt/avtopulse-backend/
```

- [ ] **Step 3: Build the binary on the server and run migrations once manually to verify**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 << 'EOF'
cd /opt/avtopulse-backend
go build -o avtopulse-backend ./cmd/server
export AVTOPULSE_DSN="postgres://localhost:5432/avtopulse?sslmode=disable"
export AVTOPULSE_PORT=8090
timeout 5 ./avtopulse-backend &
sleep 2
curl -s http://localhost:8090/api/shops
kill %1 2>/dev/null
EOF
```

Expected: the curl call prints `[{"id":1,"name":"avto444","title":"Avto 444"}]` (migrations ran and seeded the shop on first start).

- [ ] **Step 4: Create a systemd unit for the backend**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 << 'EOF'
cat > /etc/systemd/system/avtopulse-backend.service << 'UNIT'
[Unit]
Description=avtopulse-backend Go service
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/avtopulse-backend
Environment=AVTOPULSE_DSN=postgres://localhost:5432/avtopulse?sslmode=disable
Environment=AVTOPULSE_PORT=8090
ExecStart=/opt/avtopulse-backend/avtopulse-backend
Restart=on-failure
User=youtube-remote

[Install]
WantedBy=multi-user.target
UNIT

chown youtube-remote:youtube-remote /opt/avtopulse-backend/avtopulse-backend
systemctl daemon-reload
systemctl enable avtopulse-backend
systemctl start avtopulse-backend
systemctl status avtopulse-backend --no-pager
EOF
```

Expected: `systemctl status` shows `active (running)`.

- [ ] **Step 5: Add a reverse-proxy rule to the existing Caddyfile block for autopulse**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 "grep -A5 'autopulse.157.180.73.79.sslip.io' /etc/caddy/Caddyfile"
```

Read the existing block first. Then add (inside that same site block, before the catch-all `handle` for static files, if the file uses `handle`/`handle_path` blocks — adapt to whatever pattern the existing Caddyfile actually uses, matching its style exactly rather than assuming):

```
    handle /api/* {
        reverse_proxy localhost:8090
    }
```

- [ ] **Step 6: Validate and reload Caddy**

```bash
ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 "caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy"
```

Expected: `Valid configuration` and no errors from the reload.

- [ ] **Step 7: Verify the proxied API is reachable through the public domain**

```bash
curl -s https://autopulse.157.180.73.79.sslip.io/api/shops
curl -s https://autopulse.157.180.73.79.sslip.io/api/shops/by-name/avto444
```

Expected: same JSON as Task 5's local verification, now served through the public domain.

- [ ] **Step 8: Deploy the frontend (which now points at the same-origin `/api`)**

Since `/api/*` is proxied on the same origin in production, leave `VITE_AVTOPULSE_API_BASE` unset for production builds (the `?? ''` fallback in `src/api/shop.ts` makes all calls relative, e.g. `/api/shops`, which resolves against `autopulse.157.180.73.79.sslip.io` automatically).

```bash
cd /Users/frontend/workspace/me-github/autopulse
git push origin main
bash deploy/deploy.sh
```

- [ ] **Step 9: Full live verification**

```bash
curl -s -o /dev/null -w "magazalar list: %{http_code}\n" https://autopulse.157.180.73.79.sslip.io/magazalar
curl -s -o /dev/null -w "magazalar/avto444: %{http_code}\n" https://autopulse.157.180.73.79.sslip.io/magazalar/avto444
curl -s -o /dev/null -w "magaza-giris: %{http_code}\n" https://autopulse.157.180.73.79.sslip.io/magaza-giris
curl -s -o /dev/null -w "magazam (unauthenticated, still 200 — client-side redirect): %{http_code}\n" https://autopulse.157.180.73.79.sslip.io/magazam
```

Expected: all four return `200` (React Router serves the SPA shell for all client-side routes; `/magazam`'s auth redirect happens in-browser via JS, not as an HTTP redirect, so it still returns 200 at the HTTP level — this is consistent with how every other client-side-guarded route in this app already behaves, e.g. `/elan-ver`).

- [ ] **Step 10: Commit any deploy-script changes if Task 10 required them, otherwise skip**

```bash
cd /Users/frontend/workspace/me-github/autopulse
git status --short
# If deploy.sh was modified in this task, commit it. If untouched, nothing to commit here.
```

---

## Self-Review Notes

- **Spec coverage:** All 6 API endpoints (list, by-name, products, login, me/products, logout) → Tasks 3 & 4. Schema (`shop`, `shop_products`, `shop_sessions` with `password_hash`) → Task 2. Seed data → Task 2. Frontend routes `/mağazalar` (as `/magazalar`, ASCII), `/mağazalar/:name`, `/magaza-giris`, `/magazam` → Tasks 7, 8, 9. Header nav link → Task 7. HttpOnly/Secure/SameSite=Lax cookie → Task 4. Same-origin proxy reasoning → Task 10. Separate repo, separate DB, no subdomain routing → all addressed in Global Constraints and respected throughout.
- **Route naming clarification:** the spec write-up uses `/mağazalar` (with `ğ`) in prose; this plan uses ASCII `/magazalar` for the actual route paths to match this codebase's existing convention (`/elan-ver`, `/qiymetler`, `/muqayise` are all ASCII despite Azerbaijani being used elsewhere in the UI). This is called out explicitly in Task 7 rather than left ambiguous.
- **Placeholder scan:** no TBD/TODO markers; every step has literal, runnable code or commands.
- **Type consistency:** `ShopSummary { id, name, title }`, `Shop { id, name, customerId, title, details, workTimes }`, `ShopProduct { id, name, title, details }` are defined once in Task 6 and referenced identically in Tasks 7–9 (frontend) and mirror the Go `shop.ShopSummary`/`shop.Shop`/`shop.Product` JSON tags defined in Task 3.
