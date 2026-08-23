# AutoPulse Shop Registration + Email/Password Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone publicly register a new shop account (name/title/email/password), and switch shop login from name+password to email+password — while keeping the existing `avto444` account working through the transition.

**Architecture:** Add an `email` column to `avto444.shop` (nullable first, backfilled for the existing row, then made NOT NULL+UNIQUE in the same migration). Add `CreateShop`/`GetShopByEmail` to `shop.Repository`. Change `internal/auth/handler.go`'s `Login` to look up by email instead of name, and add a new `Register` handler that creates a shop and immediately logs it in (same session/cookie flow as `Login`). Frontend gets a new `ShopRegister.tsx` page and `ShopLogin.tsx`'s "Mağaza adı" field is replaced with "Email".

**Tech Stack:** Go 1.26.5, `chi`, `pgx/v5`, `golang.org/x/crypto/bcrypt` (existing — no new dependencies), React 18 + TypeScript (existing conventions).

## Global Constraints

- Full design reference: `docs/superpowers/specs/2026-08-23-avtopulse-shop-registration-email-login-design.md`.
- **This is a breaking change to `POST /api/shops/login`** — its request body changes from `{name, password}` to `{email, password}`. The migration MUST backfill the existing `avto444` row's email (`avto444@autopulse.local`, an explicitly user-approved placeholder) BEFORE adding the `NOT NULL` constraint, or the migration itself will fail against the live `avto444` row. Do not skip or reorder this.
- Email verification, password reset, and any "forgot password" flow are explicitly OUT of scope — a newly registered shop is immediately active and logged in, no verification email is sent (there's no email-sending infrastructure in this project at all).
- New handlers MUST be named methods on `*authHandlers`, never inline closures — a real Phase 1 bug: `swag` cannot attach `@Router` annotations to anonymous closures.
- Password hashing MUST use the existing `golang.org/x/crypto/bcrypt` (`bcrypt.GenerateFromPassword`/`bcrypt.CompareHashAndPassword`), matching the existing `Login` handler's convention — no new hashing library.
- Every backend task must end with `go build ./...` and `go test ./...` passing (run from `avtopulse-backend/`). Every frontend task must end with `npx tsc -b --noEmit` (NOT plain `npx tsc --noEmit`) and `npm run build` passing, run from the repo root, plus the standing corruption scan (`grep -rn 'Ɛ\|Ɔ'` across touched files) before any commit.
- Follow the existing deploy workflow: backend via rsync + `go build` on server + `systemctl restart avtopulse-backend`; frontend via `git push origin main` + `bash deploy/deploy.sh` from `/Users/frontend/workspace/me-github/autopulse`.
- Do not touch the 12+ real live products or the real `avto444` shop's product data during live verification — registration/login verification only needs a disposable test shop account; do not delete or modify `avto444`'s products.
- **Critical deploy-time verification requirement:** after deploying, you MUST confirm `avto444` can still log in with its NEW email (`avto444@autopulse.local`) and its EXISTING, unchanged password — this is the single most important regression check for this breaking change, since a failure here would lock the real shop owner out of their own account.

---

## Task 1: Database migration — add `email` to `shop`, backfill `avto444`

**Files:**
- Create: `avtopulse-backend/migrations/0007_shop_email.sql`

**Interfaces:**
- Consumes: nothing new.
- Produces: `avto444.shop.email TEXT NOT NULL UNIQUE` — ready for `shop.Repository`'s new methods (Task 2) to read/write.

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE avto444.shop ADD COLUMN email TEXT;

UPDATE avto444.shop SET email = 'avto444@autopulse.local' WHERE name = 'avto444';

ALTER TABLE avto444.shop ALTER COLUMN email SET NOT NULL;
ALTER TABLE avto444.shop ADD CONSTRAINT shop_email_unique UNIQUE (email);
```

Save as `avtopulse-backend/migrations/0007_shop_email.sql`.

The three-step order (add nullable → backfill the one existing row → tighten to NOT NULL+UNIQUE) is mandatory — reversing it would fail the migration on the live `avto444` row, which exists before this migration runs and would otherwise violate the NOT NULL constraint the moment it's added.

- [ ] **Step 2: Confirm the SQL is syntactically consistent with `0001_init_schema.sql`'s and `0006_user_schema.sql`'s conventions** (matching capitalization style, no trailing semicolon requirements beyond what Postgres needs). No local Postgres test DSN is available in this environment — this migration will be verified for real at deploy time via the server's automatic migration runner (`db.RunMigrations`), which is why Task 5's deploy step explicitly re-confirms `avto444`'s login works afterward.

- [ ] **Step 3: Commit**

```bash
git add avtopulse-backend/migrations/0007_shop_email.sql
git commit -m "feat: add email column to shop, backfill avto444's placeholder email"
```

---

## Task 2: `shop.Repository` — `CreateShop`, `GetShopByEmail`, `Email` field

**Files:**
- Modify: `avtopulse-backend/internal/shop/model.go`
- Modify: `avtopulse-backend/internal/shop/repository.go`
- Modify: `avtopulse-backend/internal/shop/handler_test.go` (extend `fakeRepo`)
- Modify: `avtopulse-backend/internal/auth/handler_test.go` (extend `fakeShopRepo`)
- Modify: `avtopulse-backend/internal/admin/handler_test.go` (extend `fakeShopRepo`, if it implements the full interface)
- Modify: `avtopulse-backend/internal/listings/handler_test.go` (extend `fakeShopRepo`, if it implements the full interface)

**Interfaces:**
- Consumes: `avto444.shop.email` column (Task 1).
- Produces: `shop.Shop.Email string`, `shop.ErrDuplicate` (new sentinel error), `shop.CreateShopInput{Name, Title, Email, Password}`, `shop.Repository.CreateShop(ctx, input CreateShopInput) (*Shop, error)`, `shop.Repository.GetShopByEmail(ctx, email string) (*Shop, error)`.

- [ ] **Step 1: Add `Email` to the `Shop` struct in `avtopulse-backend/internal/shop/model.go`**

```go
type Shop struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	CustomerID int64  `json:"customerId"`
	Title      string `json:"title"`
	Details    string `json:"details"`
	WorkTimes  string `json:"workTimes"`
	LogoURL    string `json:"logoUrl"`
	Email      string `json:"email"`
}
```

Add a new input type in the same file:

```go
type CreateShopInput struct {
	Name     string `json:"name"`
	Title    string `json:"title"`
	Email    string `json:"email"`
	Password string `json:"password"`
}
```

- [ ] **Step 2: Add `ErrDuplicate` and the two new interface methods in `avtopulse-backend/internal/shop/repository.go`**

```go
var ErrDuplicate = errors.New("shop: name or email already in use")
```

Add to the `Repository` interface:

```go
	GetShopByEmail(ctx context.Context, email string) (*Shop, error)
	CreateShop(ctx context.Context, input CreateShopInput) (*Shop, error)
```

- [ ] **Step 3: Update `GetShopByName` and `GetShopByID`'s SELECT to include `email`** (both currently select 6 columns with COALESCE for the nullable ones — `email` is NOT NULL as of Task 1's migration, so no COALESCE needed):

```go
func (r *pgRepository) GetShopByName(ctx context.Context, name string) (*Shop, error) {
	var s Shop
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, customer_id, title, COALESCE(details, ''), COALESCE(work_times, ''), COALESCE(logo_url, ''), email FROM avto444.shop WHERE name = $1`,
		name,
	).Scan(&s.ID, &s.Name, &s.CustomerID, &s.Title, &s.Details, &s.WorkTimes, &s.LogoURL, &s.Email)
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
		`SELECT id, name, customer_id, title, COALESCE(details, ''), COALESCE(work_times, ''), COALESCE(logo_url, ''), email FROM avto444.shop WHERE id = $1`,
		id,
	).Scan(&s.ID, &s.Name, &s.CustomerID, &s.Title, &s.Details, &s.WorkTimes, &s.LogoURL, &s.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}
```

- [ ] **Step 4: Add `GetShopByEmail` (same shape as `GetShopByName`, keyed by email)**

```go
func (r *pgRepository) GetShopByEmail(ctx context.Context, email string) (*Shop, error) {
	var s Shop
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, customer_id, title, COALESCE(details, ''), COALESCE(work_times, ''), COALESCE(logo_url, ''), email FROM avto444.shop WHERE email = $1`,
		email,
	).Scan(&s.ID, &s.Name, &s.CustomerID, &s.Title, &s.Details, &s.WorkTimes, &s.LogoURL, &s.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}
```

- [ ] **Step 5: Add `CreateShop`** — hashes the password with bcrypt (matching the existing convention used elsewhere in this codebase — check `avtopulse-backend/internal/shop/` or the seed migration for the exact bcrypt cost factor used, default `bcrypt.DefaultCost` if none is otherwise specified), inserts a new row, detects a unique-constraint violation via Postgres error code `23505` and maps it to `ErrDuplicate`:

```go
func (r *pgRepository) CreateShop(ctx context.Context, input CreateShopInput) (*Shop, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	var id int64
	err = r.pool.QueryRow(ctx,
		`INSERT INTO avto444.shop (name, customer_id, title, password_hash, email)
		 VALUES ($1, 0, $2, $3, $4)
		 RETURNING id`,
		input.Name, input.Title, string(hash), input.Email,
	).Scan(&id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrDuplicate
		}
		return nil, err
	}

	return &Shop{ID: id, Name: input.Name, Title: input.Title, Email: input.Email}, nil
}
```

Note: `customer_id` is set to `0` — this column exists from the original schema (`0001_init_schema.sql`) but has no clear ongoing purpose for a self-registered shop (it was presumably meant for linking to an external customer system that was never built out); `0` is a safe, non-null placeholder consistent with the column's `NOT NULL` constraint. Do not attempt to give it real meaning in this task — that's out of scope.

Add the required imports to this file:

```go
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
```

- [ ] **Step 6: Update `avtopulse-backend/internal/shop/handler_test.go`'s `fakeRepo` to implement `GetShopByEmail`/`CreateShop`**

Read the file's current `fakeRepo` first (it has `byName map[string]*Shop`, `byID map[int64]*Shop` fields per earlier phases), then add:

```go
func (f *fakeRepo) GetShopByEmail(ctx context.Context, email string) (*Shop, error) {
	for _, s := range f.byName {
		if s.Email == email {
			return s, nil
		}
	}
	return nil, ErrNotFound
}

func (f *fakeRepo) CreateShop(ctx context.Context, input CreateShopInput) (*Shop, error) {
	if _, exists := f.byName[input.Name]; exists {
		return nil, ErrDuplicate
	}
	for _, s := range f.byName {
		if s.Email == input.Email {
			return nil, ErrDuplicate
		}
	}
	s := &Shop{ID: int64(len(f.byName) + 1), Name: input.Name, Title: input.Title, Email: input.Email}
	f.byName[input.Name] = s
	if f.byID == nil {
		f.byID = map[int64]*Shop{}
	}
	f.byID[s.ID] = s
	return s, nil
}
```

- [ ] **Step 7: Build the shop package in isolation, fix any remaining fakes**

```bash
cd avtopulse-backend
go build ./internal/shop/...
```

Then run the WHOLE module build to find every other fake needing the 2 new methods (do not assume the list above is exhaustive — the same pattern hit in an earlier phase where `internal/user/handler_test.go` had its own separate fake that wasn't initially on the brief's list):

```bash
go build ./...
```

Fix every compile error by adding `GetShopByEmail`/`CreateShop` stub or working implementations to every `shop.Repository`-implementing fake found (`internal/auth/handler_test.go`'s `fakeShopRepo`, `internal/admin/handler_test.go`'s `fakeShopRepo` if it implements the full interface, `internal/listings/handler_test.go`'s `fakeShopRepo` if it implements the full interface — for fakes that don't need real registration/email-lookup behavior in their own tests, a simple stub returning `(nil, nil)` or `(nil, shop.ErrNotFound)` is sufficient, matching the pattern already established for other stubbed methods in those same fakes).

- [ ] **Step 8: Run tests**

```bash
go test ./... -v
```

Expected: everything builds and passes.

- [ ] **Step 9: Commit**

```bash
git add avtopulse-backend
git commit -m "feat: add shop.Email field, GetShopByEmail, CreateShop repository methods"
```

---

## Task 3: Backend — `POST /api/shops/register`, change `Login` to email-based

**Files:**
- Modify: `avtopulse-backend/internal/auth/handler.go`
- Modify: `avtopulse-backend/internal/auth/handler_test.go`
- Modify: `avtopulse-backend/cmd/server/main.go`

**Interfaces:**
- Consumes: `shop.Repository.CreateShop`, `shop.Repository.GetShopByEmail` (Task 2).
- Produces: `POST /api/shops/register` (new), `POST /api/shops/login` (body shape changed from `{name, password}` to `{email, password}`).

- [ ] **Step 1: Change `loginRequest` and `Login`'s lookup in `internal/auth/handler.go`**

```go
type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}
```

Update `Login`'s body (change the doc comment and the lookup call):

```go
// Login godoc
// @Summary      Shop owner login
// @Description  Authenticates a shop by email+password and sets an HttpOnly shop_session cookie on success.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      loginRequest  true  "Shop email and password"
// @Success      200   {object}  loginResponse
// @Failure      400   {string}  string  "invalid request body"
// @Failure      401   {string}  string  "invalid email or password"
// @Failure      500   {string}  string  "internal error"
// @Router       /login [post]
func (h *authHandlers) Login(w http.ResponseWriter, req *http.Request) {
	var body loginRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	s, err := h.shopRepo.GetShopByEmail(req.Context(), body.Email)
	if errors.Is(err, shop.ErrNotFound) {
		http.Error(w, "invalid email or password", http.StatusUnauthorized)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	hash, err := h.shopRepo.GetPasswordHash(req.Context(), s.ID)
	if errors.Is(err, shop.ErrNotFound) {
		http.Error(w, "invalid email or password", http.StatusUnauthorized)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)); err != nil {
		http.Error(w, "invalid email or password", http.StatusUnauthorized)
		return
	}

	token, err := h.sessions.Create(req.Context(), s.ID)
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
}
```

Only the body's field name, the lookup method, and the error messages changed — the rest of `Login`'s logic (password check, session creation, cookie) is untouched.

- [ ] **Step 2: Add the `Register` handler in the same file, right after `Login`**

```go
type registerRequest struct {
	Name     string `json:"name"`
	Title    string `json:"title"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Register godoc
// @Summary      Register a new shop account
// @Description  Publicly creates a new shop account and immediately logs it in (sets an HttpOnly shop_session cookie), same as /login. No email verification is performed.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      registerRequest  true  "New shop's name, title, email, and password"
// @Success      201   {object}  loginResponse
// @Failure      400   {string}  string  "invalid request body"
// @Failure      409   {string}  string  "name or email already in use"
// @Failure      500   {string}  string  "internal error"
// @Router       /register [post]
func (h *authHandlers) Register(w http.ResponseWriter, req *http.Request) {
	var body registerRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Name == "" || body.Title == "" || body.Email == "" || body.Password == "" {
		http.Error(w, "name, title, email, and password are all required", http.StatusBadRequest)
		return
	}

	s, err := h.shopRepo.CreateShop(req.Context(), shop.CreateShopInput{
		Name: body.Name, Title: body.Title, Email: body.Email, Password: body.Password,
	})
	if errors.Is(err, shop.ErrDuplicate) {
		http.Error(w, "name or email already in use", http.StatusConflict)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	token, err := h.sessions.Create(req.Context(), s.ID)
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

	writeJSON(w, http.StatusCreated, loginResponse{
		Shop: shop.ShopSummary{ID: s.ID, Name: s.Name, Title: s.Title},
	})
}
```

- [ ] **Step 3: Register the route in `NewHandler` (same file)**

```go
	r.Post("/register", h.Register)
```

Add next to the existing `r.Post("/login", h.Login)` line.

- [ ] **Step 4: Update `internal/auth/handler_test.go`'s existing login tests and fixtures**

Read the file's current `newFakeShopRepo()`, `TestLogin_Success_SetsCookie`, `TestLogin_WrongPassword`, and any other test constructing a `loginRequest{Name: ...}` — update every such literal to `loginRequest{Email: ...}`, and update `newFakeShopRepo()`'s seed `Shop` (currently `{ID: 1, Name: "avto444", Title: "Avto 444"}`) to also set `Email: "avto444@test.local"` so the fake's `GetShopByEmail` (added in Task 2 Step 6, or wherever this specific fake lives) can find it. Update the two existing login test bodies to send `{Email: "avto444@test.local", Password: ...}` instead of `{Name: "avto444", Password: ...}`.

- [ ] **Step 5: Add tests for `Register`**

```go
func TestRegister_Success(t *testing.T) {
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore(), &fakeStorageClient{})
	body, _ := json.Marshal(registerRequest{Name: "yeni-magaza", Title: "Yeni Mağaza", Email: "yeni@test.local", Password: "test-password"})
	req := httptest.NewRequest(http.MethodPost, "/register", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d, body: %s", rec.Code, rec.Body.String())
	}
	found := false
	for _, c := range rec.Result().Cookies() {
		if c.Name == cookieName {
			found = true
		}
	}
	if !found {
		t.Fatal("expected shop_session cookie to be set on successful registration")
	}
}

func TestRegister_DuplicateEmail_Conflict(t *testing.T) {
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore(), &fakeStorageClient{})
	body, _ := json.Marshal(registerRequest{Name: "yeni-magaza-2", Title: "Yeni Mağaza 2", Email: "avto444@test.local", Password: "test-password"})
	req := httptest.NewRequest(http.MethodPost, "/register", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d, body: %s", rec.Code, rec.Body.String())
	}
}

func TestRegister_MissingFields_BadRequest(t *testing.T) {
	h := NewHandler(newFakeShopRepo(), newFakeSessionStore(), &fakeStorageClient{})
	body, _ := json.Marshal(registerRequest{Name: "", Title: "", Email: "", Password: ""})
	req := httptest.NewRequest(http.MethodPost, "/register", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d, body: %s", rec.Code, rec.Body.String())
	}
}
```

- [ ] **Step 6: Wire the new route into `cmd/server/main.go`**

```go
	r.Post("/api/shops/register", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
```

Add next to the existing `POST /api/shops/login` registration.

- [ ] **Step 7: Build, test, regenerate Swagger**

```bash
cd avtopulse-backend
go build ./...
go test ./... -v
$(go env GOPATH)/bin/swag init -g cmd/server/main.go -o docs --parseInternal
```

Read `docs/swagger.json`'s full `"paths"` object directly (not a truncated snippet) and confirm `/register` [post] is now present alongside the existing paths, tagged `auth`, and confirm `swag init`'s output has no new "declared multiple times" warning involving `/register` (this project has hit this exact class of bug 3 times before across other route groups — verify empirically, don't assume it's fine because the path looks unique).

- [ ] **Step 8: Commit**

```bash
git add avtopulse-backend
git commit -m "feat: POST /api/shops/register, switch login to email-based lookup"
```

---

## Task 4: Frontend — `ShopRegister.tsx`, email-based `ShopLogin.tsx`

**Files:**
- Modify: `src/api/shop.ts`
- Modify: `src/pages/shop/ShopLogin.tsx`
- Create: `src/pages/shop/ShopRegister.tsx`
- Create: `src/pages/shop/ShopRegister.module.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `POST /api/shops/register`, `POST /api/shops/login` (email-based) (Task 3).
- Produces: `shopLogin(email, password)` (signature changed from `shopLogin(name, password)`), new `registerShop(name, title, email, password)`; new route `/magaza-qeydiyyat`.

- [ ] **Step 1: Read the current `src/pages/shop/ShopLogin.tsx` and `src/pages/shop/ShopLogin.module.css` in full** — confirm their exact current structure before editing (this repo has had multiple concurrent sessions touch related files).

- [ ] **Step 2: Update `shopLogin` in `src/api/shop.ts`** — change its signature and request body field:

```typescript
export async function shopLogin(email: string, password: string): Promise<ShopSummary> {
  const res = await fetch(`${API_BASE}/api/shops/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 401) {
    throw new ShopLoginError('Email və ya parol yanlışdır');
  }
  if (!res.ok) {
    throw new Error(`shopLogin failed: ${res.status}`);
  }
  const data = await res.json();
  return data.shop;
}
```

Add a new function right after it:

```typescript
export class ShopRegisterError extends Error {}

export async function registerShop(name: string, title: string, email: string, password: string): Promise<ShopSummary> {
  const res = await fetch(`${API_BASE}/api/shops/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, title, email, password }),
  });
  if (res.status === 409) {
    throw new ShopRegisterError('Bu ad və ya email artıq istifadə olunur');
  }
  if (res.status === 400) {
    throw new ShopRegisterError('Bütün sahələr tələb olunur');
  }
  if (!res.ok) {
    throw new Error(`registerShop failed: ${res.status}`);
  }
  const data = await res.json();
  return data.shop;
}
```

- [ ] **Step 3: Update `src/pages/shop/ShopLogin.tsx`** — replace the "Mağaza adı" field with "Email", update the `shopLogin` call, add a link to the new registration page:

```tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { shopLogin, ShopLoginError } from '../../api/shop';
import styles from './ShopLogin.module.css';

export default function ShopLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await shopLogin(email, password);
      navigate('/magazam');
    } catch (err) {
      if (err instanceof ShopLoginError) {
        setError('Email və ya parol yanlışdır.');
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
        <p className={styles.subtitle}>Öz mağazanıza daxil olmaq üçün email və parolunuzu daxil edin.</p>

        <label className={styles.field}>
          <span className={styles.label}>Email</span>
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="məs. magaza@nümunə.com"
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

        <p className={styles.subtitle}>
          Hesabınız yoxdur? <Link to="/magaza-qeydiyyat">Qeydiyyatdan keçin</Link>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/pages/shop/ShopRegister.tsx`** — mirrors `ShopLogin.tsx`'s structure, 4 fields:

```tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerShop, ShopRegisterError } from '../../api/shop';
import styles from './ShopRegister.module.css';

export default function ShopRegister() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerShop(name, title, email, password);
      navigate('/magazam');
    } catch (err) {
      if (err instanceof ShopRegisterError) {
        setError(err.message);
      } else {
        setError('Qeydiyyat zamanı xəta baş verdi.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Mağaza qeydiyyatı</h1>
        <p className={styles.subtitle}>Yeni mağaza hesabı yaradın.</p>

        <label className={styles.field}>
          <span className={styles.label}>Mağaza adı (slug)</span>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="məs. avto555"
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Başlıq</span>
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="məs. Avto 555"
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Email</span>
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          {submitting ? 'Qeydiyyatdan keçirilir...' : 'Qeydiyyatdan keç'}
        </button>

        <p className={styles.subtitle}>
          Artıq hesabınız var? <Link to="/magaza-giris">Daxil olun</Link>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Write `src/pages/shop/ShopRegister.module.css`** — read `src/pages/shop/ShopLogin.module.css` in full first and copy it verbatim (same class names: `.page`, `.card`, `.title`, `.subtitle`, `.field`, `.label`, `.input`, `.error`, `.submitBtn`, and any others found), so both pages look visually identical apart from field count.

- [ ] **Step 6: Add the route in `src/App.tsx`**

```tsx
            <Route path="/magaza-qeydiyyat" element={<ShopRegister />} />
```

Add next to the existing `/magaza-giris` route, and add the corresponding import at the top of the file alongside the existing `ShopLogin` import.

- [ ] **Step 7: Type-check and build**

```bash
cd /Users/frontend/workspace/me-github/autopulse
npx tsc -b --noEmit
npm run build
```

- [ ] **Step 8: Corruption scan and commit**

```bash
grep -rn 'Ɛ\|Ɔ' src/api/shop.ts src/pages/shop/ShopLogin.tsx src/pages/shop/ShopRegister.tsx src/pages/shop/ShopRegister.module.css src/App.tsx || echo CLEAN
git add src/api/shop.ts src/pages/shop/ShopLogin.tsx src/pages/shop/ShopRegister.tsx src/pages/shop/ShopRegister.module.css src/App.tsx
git commit -m "feat: shop registration page, email-based shop login"
```

---

## Task 5: Deploy + end-to-end verification

**Files:** none — deploy-only task.

- [ ] **Step 1: Full local verification before deploy**

```bash
cd /Users/frontend/workspace/me-github/autopulse/avtopulse-backend
go build ./...
go test ./... -v

cd /Users/frontend/workspace/me-github/autopulse
npx tsc -b --noEmit
npm run build
```

Expected: all green.

- [ ] **Step 2: Merge to main and push**

```bash
git checkout main
git merge feature/shop-registration-email-login --no-ff -m "Merge feature/shop-registration-email-login: public shop registration + email/password login"
git push origin main
```

(Assumes Tasks 1-4 were executed on a branch named `feature/shop-registration-email-login`, created before Task 1 — if a different branch name was used, substitute it here.)

- [ ] **Step 3: Deploy the backend**

```bash
rsync -avz --exclude='.git' --exclude='avtopulse-backend/server' \
  -e "ssh -i ~/.ssh/youtube-remote-webrtc_ed25519" \
  /Users/frontend/workspace/me-github/autopulse/avtopulse-backend/ \
  root@157.180.73.79:/opt/avtopulse-backend/

ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "export PATH=\$PATH:/usr/local/go/bin && cd /opt/avtopulse-backend && go build -o avtopulse-backend ./cmd/server && echo BUILD_OK"

ssh -i ~/.ssh/youtube-remote-webrtc_ed25519 root@157.180.73.79 \
  "chown youtube-remote:youtube-remote /opt/avtopulse-backend/avtopulse-backend && systemctl restart avtopulse-backend && sleep 1 && systemctl status avtopulse-backend --no-pager && journalctl -u avtopulse-backend -n 20 --no-pager"
```

Expected: `active (running)`, no migration errors (migration 0007 applies automatically — this is the step that actually adds and backfills `avto444`'s email in production).

- [ ] **Step 4: CRITICAL — verify `avto444`'s login still works with its new email, BEFORE any other verification**

```bash
curl -s -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/login \
  -H "Content-Type: application/json" \
  -d '{"email":"avto444@autopulse.local","password":"avto444pass"}'
echo
```

Expected: `{"shop":{"id":1,"name":"avto444","title":"Avto 444"}}` (or whatever the real `avto444` password actually is per `workspace/me-github/my-servers/avtopulse/credentials.md` — read that file first to confirm the exact current password before running this command, do not guess). **If this fails, STOP immediately and investigate before proceeding to Step 5** — this means the real shop owner has been locked out, which is the single most important regression this plan must not cause.

- [ ] **Step 5: Deploy the frontend**

```bash
cd /Users/frontend/workspace/me-github/autopulse
bash deploy/deploy.sh
```

- [ ] **Step 6: Live end-to-end verification with a disposable test shop**

```bash
# Register a brand-new, disposable test shop
curl -s -c /tmp/shop-register-cookies.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/register \
  -H "Content-Type: application/json" \
  -d '{"name":"test-registration-throwaway","title":"Test Registration Throwaway","email":"test-registration-throwaway@example.com","password":"test-password-123"}'
echo

# Confirm the new session cookie works (fetch its own, empty product list)
curl -s -b /tmp/shop-register-cookies.txt https://autopulse.157.180.73.79.sslip.io/api/shops/me/products
echo

# Log out, then log back in with the new shop's email+password (fresh session, not reusing the register cookie)
curl -s -c /tmp/shop-login-cookies.txt -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test-registration-throwaway@example.com","password":"test-password-123"}'
echo

# Confirm registering the same email again correctly 409s
curl -s -o /dev/null -w "duplicate email register: %{http_code}\n" -X POST https://autopulse.157.180.73.79.sslip.io/api/shops/register \
  -H "Content-Type: application/json" \
  -d '{"name":"test-registration-throwaway-2","title":"Test 2","email":"test-registration-throwaway@example.com","password":"test-password-123"}'

rm -f /tmp/shop-register-cookies.txt /tmp/shop-login-cookies.txt
```

Expected: registration succeeds (201, cookie set), the new shop's own product list is empty (`[]`), a fresh login with the new email+password succeeds, and a duplicate-email registration attempt correctly returns 409.

Then, in a browser (or via curl against the served HTML), visit `https://autopulse.157.180.73.79.sslip.io/magaza-qeydiyyat` and confirm the registration form renders, and `https://autopulse.157.180.73.79.sslip.io/magaza-giris` and confirm the login form now shows "Email" instead of "Mağaza adı".

**This test shop (`test-registration-throwaway`) is disposable and left in the database after verification** — it has no products and does not interfere with the real `avto444` catalog or its 12+ real products. Do not attempt to delete it via any hard-delete mechanism (none exists for shops in this codebase); leaving one harmless empty test shop row is an acceptable, low-cost trade-off, consistent with how disposable test rows have been handled in every prior phase of this project.

- [ ] **Step 7: Update `workspace/me-github/my-servers/avtopulse/credentials.md`** with: the new `email` column and its `avto444@autopulse.local` placeholder value for the real shop, the new `POST /api/shops/register` endpoint, the breaking change to `POST /api/shops/login`'s request body (`email` instead of `name`), and the new `/magaza-qeydiyyat` frontend route. Explicitly note that `avto444`'s real password is UNCHANGED — only its email was added; anyone testing this API directly needs to switch from `{name, password}` to `{email, password}`.

---

## Self-Review Notes

- **Spec coverage:** email column + backfill → Task 1. `CreateShop`/`GetShopByEmail` repository methods → Task 2. `POST /api/shops/register` + email-based `Login` → Task 3. Registration page + email-based login page → Task 4. Deploy with the critical `avto444`-still-works check placed BEFORE any other verification step → Task 5.
- **Breaking-change safety:** the migration's mandatory ordering (nullable → backfill → NOT NULL+UNIQUE) is called out three times (Task 1's own step commentary, Global Constraints, and Task 5's Step 4 framing) to make sure no executor treats this as a minor detail — a single dropped step here would lock out the one real, live shop account this whole system currently has.
- **Placeholder scan:** no TBD/TODO markers. The one explicit "read credentials.md first, don't guess" instruction in Task 5 Step 4 is a genuine judgment call for deploy time (the actual `avto444` password), not a content gap in the plan.
- **Type consistency:** Go `CreateShopInput{Name, Title, Email, Password}` and `registerRequest{Name, Title, Email, Password}` field names match exactly across Tasks 2-3; TS `registerShop(name, title, email, password)` in Task 4 matches the same order and names.
- **Test-fake discipline:** Task 2 Step 7 explicitly instructs running the WHOLE module build (not just `internal/shop`) to catch every fake needing the 2 new interface methods, referencing the exact prior-phase incident (a brief's fake-file list turning out to be non-exhaustive) so this doesn't repeat.
- **Demo-data protection:** Task 5's live verification uses one disposable test shop for the full register→login→duplicate-409 round-trip, and explicitly notes that shop deletion isn't implemented for this codebase (accepted, low-cost trade-off) rather than inventing a cleanup mechanism that doesn't exist.
