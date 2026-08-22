package auth

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strconv"

	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"github.com/CavadJava/avtopulse-backend/internal/storage"
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

type authHandlers struct {
	shopRepo shop.Repository
	sessions SessionStore
	storage  storage.Client
}

func NewHandler(shopRepo shop.Repository, sessions SessionStore, storageClient storage.Client) http.Handler {
	h := &authHandlers{shopRepo: shopRepo, sessions: sessions, storage: storageClient}
	r := chi.NewRouter()

	r.Post("/login", h.Login)
	r.Get("/me/products", h.MeProducts)
	r.Post("/me/products", h.CreateProduct)
	r.Put("/me/products/{id}", h.UpdateProduct)
	r.Delete("/me/products/{id}", h.DeleteProduct)
	r.Post("/me/products/{id}/images", h.UploadProductImages)
	r.Delete("/me/products/{id}/images/{imageId}", h.DeleteProductImage)
	r.Post("/me/logo", h.UploadLogo)
	r.Post("/logout", h.Logout)

	return r
}

// Login godoc
// @Summary      Shop owner login
// @Description  Authenticates a shop by name+password and sets an HttpOnly shop_session cookie on success.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      loginRequest  true  "Shop name and password"
// @Success      200   {object}  loginResponse
// @Failure      400   {string}  string  "invalid request body"
// @Failure      401   {string}  string  "invalid name or password"
// @Failure      500   {string}  string  "internal error"
// @Router       /login [post]
func (h *authHandlers) Login(w http.ResponseWriter, req *http.Request) {
	var body loginRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	s, err := h.shopRepo.GetShopByName(req.Context(), body.Name)
	if errors.Is(err, shop.ErrNotFound) {
		http.Error(w, "invalid name or password", http.StatusUnauthorized)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	hash, err := h.shopRepo.GetPasswordHash(req.Context(), s.ID)
	if errors.Is(err, shop.ErrNotFound) {
		http.Error(w, "invalid name or password", http.StatusUnauthorized)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)); err != nil {
		http.Error(w, "invalid name or password", http.StatusUnauthorized)
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

// MeProducts godoc
// @Summary      List the logged-in shop's own products
// @Description  Requires a valid shop_session cookie (set by /login).
// @Tags         auth
// @Produce      json
// @Success      200  {array}   shop.Product
// @Failure      401  {string}  string  "unauthorized"
// @Failure      500  {string}  string  "internal error"
// @Router       /me/products [get]
func (h *authHandlers) MeProducts(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	products, err := h.shopRepo.ListProducts(req.Context(), shopID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, products)
}

// Logout godoc
// @Summary      Log out the current shop session
// @Description  Deletes the server-side session and clears the shop_session cookie. Returns 500 (and leaves the cookie/session intact) if server-side deletion fails.
// @Tags         auth
// @Success      200  {string}  string  "ok"
// @Failure      500  {string}  string  "internal error"
// @Router       /logout [post]
func (h *authHandlers) Logout(w http.ResponseWriter, req *http.Request) {
	cookie, err := req.Cookie(cookieName)
	if err == nil {
		if delErr := h.sessions.Delete(req.Context(), cookie.Value); delErr != nil {
			log.Printf("auth: failed to delete session: %v", delErr)
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

type createProductRequest struct {
	Name    string `json:"name"`
	Title   string `json:"title"`
	Details string `json:"details"`
	Marka   string `json:"marka"`
	Model   string `json:"model"`
	Il      int    `json:"il"`
	Qiymet  int    `json:"qiymet"`
	Yurus   int    `json:"yurus"`
	Yanacaq string `json:"yanacaq"`
	Ban     string `json:"ban"`
}

// CreateProduct godoc
// @Summary      Create a new product for the logged-in shop
// @Description  Requires a valid shop_session cookie. Creates a shop_products row owned by the authenticated shop.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      createProductRequest  true  "New product details"
// @Success      201   {object}  shop.Product
// @Failure      400   {string}  string  "invalid request body"
// @Failure      401   {string}  string  "unauthorized"
// @Failure      500   {string}  string  "internal error"
// @Router       /me/products [post]
func (h *authHandlers) CreateProduct(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var body createProductRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	product, err := h.shopRepo.CreateProduct(req.Context(), shopID, shop.CreateProductInput{
		Name: body.Name, Title: body.Title, Details: body.Details,
		Marka: body.Marka, Model: body.Model, Il: body.Il,
		Qiymet: body.Qiymet, Yurus: body.Yurus, Yanacaq: body.Yanacaq, Ban: body.Ban,
	})
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, product)
}

// UploadProductImages godoc
// @Summary      Upload one or more images for a product
// @Description  Requires a valid shop_session cookie. The product must belong to the authenticated shop.
// @Tags         auth
// @Accept       multipart/form-data
// @Produce      json
// @Param        id      path      int   true  "Product id"
// @Param        images  formData  file  true  "One or more image files"
// @Success      200     {array}   shop.ProductImage
// @Failure      400     {string}  string  "invalid product id or no files"
// @Failure      401     {string}  string  "unauthorized"
// @Failure      404     {string}  string  "product not found or not owned by this shop"
// @Failure      500     {string}  string  "internal error"
// @Router       /me/products/{id}/images [post]
func (h *authHandlers) UploadProductImages(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}

	ownerShopID, err := h.shopRepo.GetProductShopID(req.Context(), productID)
	if errors.Is(err, shop.ErrNotFound) || ownerShopID != shopID {
		http.Error(w, "product not found", http.StatusNotFound)
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

	var results []shop.ProductImage
	for i, fh := range files {
		f, err := fh.Open()
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		ext := filepath.Ext(fh.Filename)
		objectPath := fmt.Sprintf("magaza/%d/product/%d/%s%s", shopID, productID, uuidV4(), ext)
		minioURL, s3URL, err := h.storage.UploadDual(req.Context(), objectPath, f, fh.Size, fh.Header.Get("Content-Type"))
		f.Close()
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		img, err := h.shopRepo.AddProductImage(req.Context(), productID, minioURL, s3URL, i)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		results = append(results, *img)
	}

	writeJSON(w, http.StatusOK, results)
}

// UploadLogo godoc
// @Summary      Upload the logged-in shop's logo
// @Description  Requires a valid shop_session cookie.
// @Tags         auth
// @Accept       multipart/form-data
// @Produce      json
// @Param        logo  formData  file  true  "Logo image file"
// @Success      200   {object}  map[string]string
// @Failure      400   {string}  string  "invalid multipart form or no file"
// @Failure      401   {string}  string  "unauthorized"
// @Failure      500   {string}  string  "internal error"
// @Router       /me/logo [post]
func (h *authHandlers) UploadLogo(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if err := req.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "invalid multipart form", http.StatusBadRequest)
		return
	}
	f, fh, err := req.FormFile("logo")
	if err != nil {
		http.Error(w, "no file provided", http.StatusBadRequest)
		return
	}
	defer f.Close()

	ext := filepath.Ext(fh.Filename)
	objectPath := fmt.Sprintf("magaza/%d/logo/%s%s", shopID, uuidV4(), ext)
	minioURL, _, err := h.storage.UploadDual(req.Context(), objectPath, f, fh.Size, fh.Header.Get("Content-Type"))
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if err := h.shopRepo.SetShopLogo(req.Context(), shopID, minioURL); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"logoUrl": minioURL})
}

type updateProductRequest struct {
	Name    string `json:"name"`
	Title   string `json:"title"`
	Details string `json:"details"`
	Marka   string `json:"marka"`
	Model   string `json:"model"`
	Il      int    `json:"il"`
	Qiymet  int    `json:"qiymet"`
	Yurus   int    `json:"yurus"`
	Yanacaq string `json:"yanacaq"`
	Ban     string `json:"ban"`
}

// UpdateProduct godoc
// @Summary      Update an existing product owned by the logged-in shop
// @Description  Requires a valid shop_session cookie. The product must belong to the authenticated shop.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        id    path      int                    true  "Product id"
// @Param        body  body      updateProductRequest   true  "Updated product details"
// @Success      200   {object}  shop.Product
// @Failure      400   {string}  string  "invalid product id or request body"
// @Failure      401   {string}  string  "unauthorized"
// @Failure      404   {string}  string  "product not found or not owned by this shop"
// @Failure      500   {string}  string  "internal error"
// @Router       /me/products/{id} [put]
func (h *authHandlers) UpdateProduct(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}

	ownerShopID, err := h.shopRepo.GetProductShopID(req.Context(), productID)
	if errors.Is(err, shop.ErrNotFound) || ownerShopID != shopID {
		http.Error(w, "product not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	var body updateProductRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	product, err := h.shopRepo.UpdateProduct(req.Context(), productID, shop.CreateProductInput{
		Name: body.Name, Title: body.Title, Details: body.Details,
		Marka: body.Marka, Model: body.Model, Il: body.Il,
		Qiymet: body.Qiymet, Yurus: body.Yurus, Yanacaq: body.Yanacaq, Ban: body.Ban,
	})
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, product)
}

// DeleteProduct godoc
// @Summary      Delete a product owned by the logged-in shop
// @Description  Requires a valid shop_session cookie. Deletes the product and all its images.
// @Tags         auth
// @Produce      json
// @Param        id  path  int  true  "Product id"
// @Success      200  {object}  map[string]bool
// @Failure      400  {string}  string  "invalid product id"
// @Failure      401  {string}  string  "unauthorized"
// @Failure      404  {string}  string  "product not found or not owned by this shop"
// @Failure      500  {string}  string  "internal error"
// @Router       /me/products/{id} [delete]
func (h *authHandlers) DeleteProduct(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}

	ownerShopID, err := h.shopRepo.GetProductShopID(req.Context(), productID)
	if errors.Is(err, shop.ErrNotFound) || ownerShopID != shopID {
		http.Error(w, "product not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if err := h.shopRepo.DeleteProduct(req.Context(), productID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// DeleteProductImage godoc
// @Summary      Delete a single image from a product owned by the logged-in shop
// @Description  Requires a valid shop_session cookie. The image's product must belong to the authenticated shop.
// @Tags         auth
// @Produce      json
// @Param        id       path  int  true  "Product id"
// @Param        imageId  path  int  true  "Image id"
// @Success      200      {object}  map[string]bool
// @Failure      400      {string}  string  "invalid product or image id"
// @Failure      401      {string}  string  "unauthorized"
// @Failure      404      {string}  string  "product or image not found, or not owned by this shop"
// @Failure      500      {string}  string  "internal error"
// @Router       /me/products/{id}/images/{imageId} [delete]
func (h *authHandlers) DeleteProductImage(w http.ResponseWriter, req *http.Request) {
	shopID, err := requireSession(req, h.sessions)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	productID, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}
	imageID, err := strconv.ParseInt(chi.URLParam(req, "imageId"), 10, 64)
	if err != nil {
		http.Error(w, "invalid image id", http.StatusBadRequest)
		return
	}

	ownerShopID, err := h.shopRepo.GetProductShopID(req.Context(), productID)
	if errors.Is(err, shop.ErrNotFound) || ownerShopID != shopID {
		http.Error(w, "product not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	imageProductID, err := h.shopRepo.GetImageProductID(req.Context(), imageID)
	if errors.Is(err, shop.ErrNotFound) || imageProductID != productID {
		http.Error(w, "image not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if err := h.shopRepo.DeleteProductImage(req.Context(), imageID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
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
