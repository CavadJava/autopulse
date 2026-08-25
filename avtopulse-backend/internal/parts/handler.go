package parts

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

// AuthFunc extracts the authenticated shop/seller ID from a request (e.g.
// via a session cookie), matching the shape of internal/auth's session
// check. Passed as a plain function so this package doesn't need to import
// internal/auth.
type AuthFunc func(req *http.Request) (int64, error)

type partsHandlers struct {
	repo      Repository
	jobRunner *JobRunner
	authFunc  AuthFunc
}

func NewHandler(repo Repository, jobRunner *JobRunner, authFunc AuthFunc) http.Handler {
	h := &partsHandlers{repo: repo, jobRunner: jobRunner, authFunc: authFunc}
	r := chi.NewRouter()

	r.Get("/sellers", h.ListSellers)
	r.Get("/", h.ListParts)
	r.Post("/upload", h.Upload)
	r.Get("/upload/{jobId}/status", h.UploadStatus)

	return r
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func (h *partsHandlers) ListSellers(w http.ResponseWriter, req *http.Request) {
	sellers, err := h.repo.ListSellers(req.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, sellers)
}

func (h *partsHandlers) ListParts(w http.ResponseWriter, req *http.Request) {
	q := req.URL.Query()

	filter := PartFilter{
		Model: q.Get("model"),
	}
	if sellerIDsStr := q.Get("sellerIds"); sellerIDsStr != "" {
		for _, s := range strings.Split(sellerIDsStr, ",") {
			id, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
			if err == nil {
				filter.SellerIDs = append(filter.SellerIDs, id)
			}
		}
	}
	if page, err := strconv.Atoi(q.Get("page")); err == nil {
		filter.Page = page
	}
	if limit, err := strconv.Atoi(q.Get("limit")); err == nil {
		filter.Limit = limit
	}

	parts, total, err := h.repo.ListParts(req.Context(), filter)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"parts": parts,
		"total": total,
	})
}

func (h *partsHandlers) Upload(w http.ResponseWriter, req *http.Request) {
	shopID, err := h.authFunc(req)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Cap the request body at 256MB (source files run ~195MB) so an
	// oversized upload is rejected with a clear error instead of silently
	// OOMing the process, and lower ParseMultipartForm's in-memory
	// threshold so large uploads spill to a temp file rather than being
	// buffered entirely in RAM.
	req.Body = http.MaxBytesReader(w, req.Body, 256<<20)
	if err := req.ParseMultipartForm(10 << 20); err != nil { // 10MB in-memory threshold, spills to disk above that
		http.Error(w, "invalid multipart form or file too large", http.StatusBadRequest)
		return
	}
	f, _, err := req.FormFile("file")
	if err != nil {
		http.Error(w, "no file provided", http.StatusBadRequest)
		return
	}
	defer f.Close()

	fileBytes, err := io.ReadAll(f)
	if err != nil {
		http.Error(w, "failed reading upload", http.StatusInternalServerError)
		return
	}

	// Identity is always derived from the authenticated shop, never from
	// client-supplied form data — otherwise any logged-in shop could claim
	// to be any seller by setting the sellerName field.
	sellerName := "seller-" + strconv.FormatInt(shopID, 10)

	jobID := h.jobRunner.StartUpload(req.Context(), sellerName, fileBytes)
	writeJSON(w, http.StatusAccepted, map[string]string{"jobId": jobID})
}

func (h *partsHandlers) UploadStatus(w http.ResponseWriter, req *http.Request) {
	jobID := chi.URLParam(req, "jobId")
	job, ok := h.jobRunner.GetJob(jobID)
	if !ok {
		http.Error(w, "job not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, job)
}
