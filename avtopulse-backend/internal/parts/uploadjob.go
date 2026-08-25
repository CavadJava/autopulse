package parts

import (
	"bytes"
	"context"
	"fmt"
	"sync"

	"github.com/CavadJava/avtopulse-backend/internal/storage"
	"github.com/google/uuid"
)

type JobStatus string

const (
	JobPending    JobStatus = "pending"
	JobProcessing JobStatus = "processing"
	JobDone       JobStatus = "done"
	JobFailed     JobStatus = "failed"
)

type Job struct {
	ID        string
	Status    JobStatus
	Processed int
	Total     int
	Error     string
}

// JobRunner processes uploaded workbooks in the background and tracks
// progress in an in-memory map, keyed by job ID. Jobs are not persisted
// across process restarts — acceptable for this admin-only, low-volume
// upload flow.
type JobRunner struct {
	repo    Repository
	storage storage.Client

	mu   sync.Mutex
	jobs map[string]*Job
}

func NewJobRunner(repo Repository, storageClient storage.Client) *JobRunner {
	return &JobRunner{
		repo:    repo,
		storage: storageClient,
		jobs:    map[string]*Job{},
	}
}

// StartUpload kicks off parsing and DB insertion in a background goroutine
// and returns immediately with a job ID for status polling.
func (jr *JobRunner) StartUpload(ctx context.Context, sellerName string, fileBytes []byte) string {
	jobID := uuid.NewString()
	job := &Job{ID: jobID, Status: JobPending}

	jr.mu.Lock()
	jr.jobs[jobID] = job
	jr.mu.Unlock()

	go jr.process(context.Background(), job, sellerName, fileBytes)

	return jobID
}

func (jr *JobRunner) GetJob(jobID string) (*Job, bool) {
	jr.mu.Lock()
	defer jr.mu.Unlock()
	j, ok := jr.jobs[jobID]
	if !ok {
		return nil, false
	}
	cp := *j
	return &cp, true
}

func (jr *JobRunner) setStatus(job *Job, status JobStatus) {
	jr.mu.Lock()
	job.Status = status
	jr.mu.Unlock()
}

func (jr *JobRunner) setError(job *Job, err error) {
	jr.mu.Lock()
	job.Status = JobFailed
	job.Error = err.Error()
	jr.mu.Unlock()
}

func (jr *JobRunner) process(ctx context.Context, job *Job, sellerName string, fileBytes []byte) {
	jr.setStatus(job, JobProcessing)

	rows, err := ParseWorkbook(bytes.NewReader(fileBytes))
	if err != nil {
		jr.setError(job, fmt.Errorf("parsing workbook: %w", err))
		return
	}

	jr.mu.Lock()
	job.Total = len(rows)
	jr.mu.Unlock()

	seller, err := jr.repo.GetOrCreateSeller(ctx, sellerName)
	if err != nil {
		jr.setError(job, fmt.Errorf("resolving seller: %w", err))
		return
	}

	// Process in batches so a single bad image doesn't fail the whole
	// upload, and so a very large file (1500+ rows) isn't held entirely
	// in one giant INSERT statement.
	const batchSize = 50
	var batch []NewPart

	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		if err := jr.repo.InsertParts(ctx, batch); err != nil {
			return err
		}
		jr.mu.Lock()
		job.Processed += len(batch)
		jr.mu.Unlock()
		batch = batch[:0]
		return nil
	}

	for i, row := range rows {
		newPart := NewPart{
			SellerID:          seller.ID,
			Model:             row.Model,
			RowNo:             row.RowNo,
			OEM:               row.OEM,
			Description:       row.Description,
			YearRange:         row.YearRange,
			PriceRaw:          row.PriceRaw,
			PriceMadeInChina:  row.Prices.MadeInChina,
			PriceOriginalNew:  row.Prices.OriginalNew,
			PriceOriginalUsed: row.Prices.OriginalUsed,
		}

		if len(row.ImageBytes) > 0 {
			objectPath := fmt.Sprintf("parts/%s/%d_%s%s", row.Model, seller.ID, uuid.NewString(), row.ImageExt)
			minioURL, s3URL, err := jr.storage.UploadDual(ctx, objectPath, bytes.NewReader(row.ImageBytes), int64(len(row.ImageBytes)), "image/"+row.ImageExt[1:])
			if err == nil {
				newPart.ImageURL = &minioURL
				newPart.ImageURLS3 = &s3URL
			}
			// Image upload failure is non-fatal for the row — the part
			// still gets inserted without an image rather than losing the
			// whole row's catalog data.
		}

		batch = append(batch, newPart)

		if len(batch) >= batchSize || i == len(rows)-1 {
			if err := flush(); err != nil {
				jr.setError(job, fmt.Errorf("inserting parts batch: %w", err))
				return
			}
		}
	}

	jr.setStatus(job, JobDone)
}
