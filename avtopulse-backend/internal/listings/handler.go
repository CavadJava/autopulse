package listings

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"github.com/CavadJava/avtopulse-backend/internal/user"
	"github.com/go-chi/chi/v5"
)

type listingsHandlers struct {
	userRepo user.Repository
	shopRepo shop.Repository
}

func NewHandler(userRepo user.Repository, shopRepo shop.Repository) http.Handler {
	h := &listingsHandlers{userRepo: userRepo, shopRepo: shopRepo}
	r := chi.NewRouter()

	r.Get("/", h.PublicListings)
	r.Get("/{source}/{id}", h.PublicListingDetail)

	return r
}

func toImageOut(minioURL, s3URL string, sira int) ImageOut {
	return ImageOut{MinioURL: minioURL, S3URL: s3URL, Sira: sira}
}

// PublicListings godoc
// @Summary      List every approved listing across shops and individual users
// @Description  Fully public — no authentication required. Only status='saytda' listings are included.
// @Tags         listings
// @Produce      json
// @Success      200  {array}   PublicListing
// @Failure      500  {string}  string  "internal error"
// @Router       /listings [get]
func (h *listingsHandlers) PublicListings(w http.ResponseWriter, req *http.Request) {
	out := []PublicListing{}

	shopProducts, err := h.shopRepo.ListActiveProducts(req.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	for _, p := range shopProducts {
		images := make([]ImageOut, len(p.Images))
		for i, img := range p.Images {
			images[i] = toImageOut(img.MinioURL, img.S3URL, img.Sira)
		}
		out = append(out, PublicListing{
			Source: "shop", ID: p.ID, Marka: p.Marka, Model: p.Model, Il: p.Il,
			Qiymet: p.Qiymet, Yurus: p.Yurus, Yanacaq: p.Yanacaq, Ban: p.Ban,
			Title: p.Title, Details: p.Details, Images: images,
			SellerType: "diler", SellerName: p.ShopName,
		})
	}

	userProducts, err := h.userRepo.ListActiveProducts(req.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	for _, p := range userProducts {
		images := make([]ImageOut, len(p.Images))
		for i, img := range p.Images {
			images[i] = toImageOut(img.MinioURL, img.S3URL, img.Sira)
		}
		out = append(out, PublicListing{
			Source: "user", ID: p.ID, Marka: p.Marka, Model: p.Model, Il: p.Il,
			Qiymet: p.Qiymet, Yurus: p.Yurus, Yanacaq: p.Yanacaq, Ban: p.Ban,
			Title: p.Title, Details: p.Details, Images: images,
			SellerType: "şəxsi", SellerName: "",
		})
	}

	writeJSON(w, http.StatusOK, out)
}

// PublicListingDetail godoc
// @Summary      Get one approved listing's detail, by source and id
// @Description  Fully public — no authentication required. source must be "shop" or "user". Only status='saytda' listings are visible.
// @Tags         listings
// @Produce      json
// @Param        source  path  string  true  "shop or user"
// @Param        id      path  int     true  "Listing id"
// @Success      200     {object}  PublicListing
// @Failure      400     {string}  string  "invalid source or id"
// @Failure      404     {string}  string  "listing not found"
// @Failure      500     {string}  string  "internal error"
// @Router       /listings/{source}/{id} [get]
func (h *listingsHandlers) PublicListingDetail(w http.ResponseWriter, req *http.Request) {
	source := chi.URLParam(req, "source")
	if source != "shop" && source != "user" {
		http.Error(w, "invalid source", http.StatusBadRequest)
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(req, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	if source == "shop" {
		shopProducts, err := h.shopRepo.ListActiveProducts(req.Context())
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		for _, p := range shopProducts {
			if p.ID != id {
				continue
			}
			images := make([]ImageOut, len(p.Images))
			for i, img := range p.Images {
				images[i] = toImageOut(img.MinioURL, img.S3URL, img.Sira)
			}
			writeJSON(w, http.StatusOK, PublicListing{
				Source: "shop", ID: p.ID, Marka: p.Marka, Model: p.Model, Il: p.Il,
				Qiymet: p.Qiymet, Yurus: p.Yurus, Yanacaq: p.Yanacaq, Ban: p.Ban,
				Title: p.Title, Details: p.Details, Images: images,
				SellerType: "diler", SellerName: p.ShopName,
			})
			return
		}
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}

	userProducts, err := h.userRepo.ListActiveProducts(req.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	for _, p := range userProducts {
		if p.ID != id {
			continue
		}
		images := make([]ImageOut, len(p.Images))
		for i, img := range p.Images {
			images[i] = toImageOut(img.MinioURL, img.S3URL, img.Sira)
		}
		writeJSON(w, http.StatusOK, PublicListing{
			Source: "user", ID: p.ID, Marka: p.Marka, Model: p.Model, Il: p.Il,
			Qiymet: p.Qiymet, Yurus: p.Yurus, Yanacaq: p.Yanacaq, Ban: p.Ban,
			Title: p.Title, Details: p.Details, Images: images,
			SellerType: "şəxsi", SellerName: "",
		})
		return
	}
	http.Error(w, "listing not found", http.StatusNotFound)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
