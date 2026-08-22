package user

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strconv"

	"github.com/CavadJava/avtopulse-backend/internal/storage"
	"github.com/go-chi/chi/v5"
)

const cookieName = "user_session"
const otpTestCode = "1234"

type userHandlers struct {
	repo     Repository
	sessions SessionStore
	storage  storage.Client
}

func NewHandler(repo Repository, sessions SessionStore, storageClient storage.Client) http.Handler {
	h := &userHandlers{repo: repo, sessions: sessions, storage: storageClient}
	r := chi.NewRouter()

	r.Post("/otp/request", h.RequestOTP)
	r.Post("/otp/verify", h.VerifyOTP)
	r.Post("/logout", h.Logout)
	r.Get("/me/products", h.MeProducts)
	r.Post("/me/products", h.CreateProduct)
	r.Put("/me/products/{id}", h.UpdateProduct)
	r.Delete("/me/products/{id}", h.DeleteProduct)
	r.Post("/me/products/{id}/images", h.UploadProductImages)

	return r
}

type otpRequestBody struct {
	Phone string `json:"phone"`
}

// RequestOTP godoc
// @Summary      Request an OTP code for phone-based login
// @Description  Always succeeds — no real SMS is sent in this environment; the test code is a fixed value.
// @Tags         user
// @Accept       json
// @Produce      json
// @Param        body  body      otpRequestBody  true  "Phone number"
// @Success      200   {object}  map[string]bool
// @Failure      400   {string}  string  "invalid request body"
// @Router       /otp/request [post]
func (h *userHandlers) RequestOTP(w http.ResponseWriter, req *http.Request) {
	var body otpRequestBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Phone == "" {
		http.Error(w, "phone is required", http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
}

type otpVerifyBody struct {
	Phone string `json:"phone"`
	Code  string `json:"code"`
}

type otpVerifyResponse struct {
	User User `json:"user"`
}

// VerifyOTP godoc
// @Summary      Verify an OTP code and log in (or auto-register) by phone
// @Description  Test code is a fixed value ("1234") — no real SMS/OTP provider. Creates a new user account automatically on first login. Sets a user_session HttpOnly cookie on success.
// @Tags         user
// @Accept       json
// @Produce      json
// @Param        body  body      otpVerifyBody  true  "Phone number and OTP code"
// @Success      200   {object}  otpVerifyResponse
// @Failure      400   {string}  string  "invalid request body"
// @Failure      401   {string}  string  "invalid code"
// @Failure      500   {string}  string  "internal error"
// @Router       /otp/verify [post]
func (h *userHandlers) VerifyOTP(w http.ResponseWriter, req *http.Request) {
	var body otpVerifyBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Code != otpTestCode {
		http.Error(w, "invalid code", http.StatusUnauthorized)
		return
	}

	u, err := h.repo.FindOrCreateByPhone(req.Context(), body.Phone)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	token, err := h.sessions.Create(req.Context(), u.ID)
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

	writeJSON(w, http.StatusOK, otpVerifyResponse{User: *u})
}

// Logout godoc
// @Summary      Log out the current user session
// @Tags         user
// @Success      200  {string}  string  "ok"
// @Failure      500  {string}  string  "internal error"
// @Router       /logout [post]
func (h *userHandlers) Logout(w http.ResponseWriter, req *http.Request) {
	cookie, err := req.Cookie(cookieName)
	if err == nil {
		if delErr := h.sessions.Delete(req.Context(), cookie.Value); delErr != nil {
			log.Printf("user: failed to delete session: %v", delErr)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
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
}

// MeProducts godoc
// @Summary      List the logged-in user's own listings, any status
// @Description  Requires a valid user_session cookie.
// @Tags         user
// @Produce      json
// @Success      200  {array}   Product
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /me/products [get]
func (h *userHandlers) MeProducts(w http.ResponseWriter, req *http.Request) {
	userID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	products, err := h.repo.ListMyProducts(req.Context(), userID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, products)
}

type createProductRequest struct {
	Marka   string `json:"marka"`
	Model   string `json:"model"`
	Il      int    `json:"il"`
	Qiymet  int    `json:"qiymet"`
	Yurus   int    `json:"yurus"`
	Yanacaq string `json:"yanacaq"`
	Ban     string `json:"ban"`
	Title   string `json:"title"`
	Details string `json:"details"`
}

// CreateProduct godoc
// @Summary      Create a new listing for the logged-in user
// @Description  Requires a valid user_session cookie. New listings start in 'gozlemede' (pending moderation).
// @Tags         user
// @Accept       json
// @Produce      json
// @Param        body  body      createProductRequest  true  "New listing details"
// @Success      201   {object}  Product
// @Failure      400   {string}  string  "invalid request body"
// @Failure      401   {string}  string  "unauthorized"
// @Failure      500   {string}  string  "internal error"
// @Router       /me/products [post]
func (h *userHandlers) CreateProduct(w http.ResponseWriter, req *http.Request) {
	userID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var body createProductRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	product, err := h.repo.CreateProduct(req.Context(), userID, CreateProductInput{
		Marka: body.Marka, Model: body.Model, Il: body.Il, Qiymet: body.Qiymet,
		Yurus: body.Yurus, Yanacaq: body.Yanacaq, Ban: body.Ban, Title: body.Title, Details: body.Details,
	})
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, product)
}

// UpdateProduct godoc
// @Summary      Update a listing owned by the logged-in user
// @Description  Requires a valid user_session cookie. The listing must belong to the authenticated user. Editing a legv_edilib listing sends it back to gozlemede for re-moderation.
// @Tags         user
// @Accept       json
// @Produce      json
// @Param        id    path      int                    true  "Product id"
// @Param        body  body      createProductRequest   true  "Updated listing details"
// @Success      200   {object}  Product
// @Failure      400   {string}  string  "invalid product id or request body"
// @Failure      401   {string}  string  "unauthorized"
// @Failure      404   {string}  string  "listing not found or not owned by this user"
// @Failure      500   {string}  string  "internal error"
// @Router       /me/products/{id} [put]
func (h *userHandlers) UpdateProduct(w http.ResponseWriter, req *http.Request) {
	userID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}

	ownerUserID, err := h.repo.GetProductUserID(req.Context(), productID)
	if errors.Is(err, ErrNotFound) || ownerUserID != userID {
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	var body createProductRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	product, err := h.repo.UpdateProduct(req.Context(), productID, CreateProductInput{
		Marka: body.Marka, Model: body.Model, Il: body.Il, Qiymet: body.Qiymet,
		Yurus: body.Yurus, Yanacaq: body.Yanacaq, Ban: body.Ban, Title: body.Title, Details: body.Details,
	})
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, product)
}

// DeleteProduct godoc
// @Summary      Cancel (soft-delete) a listing owned by the logged-in user
// @Description  Requires a valid user_session cookie. Sets status to legv_edilib — does not remove the row.
// @Tags         user
// @Produce      json
// @Param        id  path  int  true  "Product id"
// @Success      200  {object}  map[string]bool
// @Failure      400  {string}  string  "invalid product id"
// @Failure      401  {string}  string  "unauthorized"
// @Failure      404  {string}  string  "listing not found or not owned by this user"
// @Failure      500  {string}  string  "internal error"
// @Router       /me/products/{id} [delete]
func (h *userHandlers) DeleteProduct(w http.ResponseWriter, req *http.Request) {
	userID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}

	ownerUserID, err := h.repo.GetProductUserID(req.Context(), productID)
	if errors.Is(err, ErrNotFound) || ownerUserID != userID {
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if err := h.repo.DeleteProduct(req.Context(), productID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// UploadProductImages godoc
// @Summary      Upload one or more images for a listing
// @Description  Requires a valid user_session cookie. The listing must belong to the authenticated user.
// @Tags         user
// @Accept       multipart/form-data
// @Produce      json
// @Param        id      path      int   true  "Product id"
// @Param        images  formData  file  true  "One or more image files"
// @Success      200     {array}   ProductImage
// @Failure      400     {string}  string  "invalid product id or no files"
// @Failure      401     {string}  string  "unauthorized"
// @Failure      404     {string}  string  "listing not found or not owned by this user"
// @Failure      500     {string}  string  "internal error"
// @Router       /me/products/{id}/images [post]
func (h *userHandlers) UploadProductImages(w http.ResponseWriter, req *http.Request) {
	userID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}

	ownerUserID, err := h.repo.GetProductUserID(req.Context(), productID)
	if errors.Is(err, ErrNotFound) || ownerUserID != userID {
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if err := req.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "invalid multipart form", http.StatusBadRequest)
		return
	}
	files := req.MultipartForm.File["images"]
	if len(files) == 0 {
		http.Error(w, "no files provided", http.StatusBadRequest)
		return
	}

	var results []ProductImage
	for i, fh := range files {
		f, err := fh.Open()
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		ext := filepath.Ext(fh.Filename)
		objectPath := fmt.Sprintf("user/%d/product/%d/%s%s", userID, productID, uuidV4(), ext)
		minioURL, s3URL, err := h.storage.UploadDual(req.Context(), objectPath, f, fh.Size, fh.Header.Get("Content-Type"))
		f.Close()
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		img, err := h.repo.AddProductImage(req.Context(), productID, minioURL, s3URL, i)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		results = append(results, *img)
	}

	writeJSON(w, http.StatusOK, results)
}

func uuidV4() string {
	b := make([]byte, 16)
	rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
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
