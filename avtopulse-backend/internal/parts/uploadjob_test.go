package parts

import (
	"bytes"
	"context"
	"io"
	"testing"
	"time"

	"github.com/xuri/excelize/v2"
)

type fakePartsRepo struct {
	sellers  map[string]*Seller
	nextID   int64
	inserted []NewPart
}

func newFakePartsRepo() *fakePartsRepo {
	return &fakePartsRepo{sellers: map[string]*Seller{}, nextID: 1}
}

func (f *fakePartsRepo) ListSellers(ctx context.Context) ([]Seller, error) { return nil, nil }

func (f *fakePartsRepo) GetOrCreateSeller(ctx context.Context, name string) (*Seller, error) {
	if s, ok := f.sellers[name]; ok {
		return s, nil
	}
	s := &Seller{ID: f.nextID, Name: name}
	f.nextID++
	f.sellers[name] = s
	return s, nil
}

func (f *fakePartsRepo) InsertParts(ctx context.Context, newParts []NewPart) error {
	f.inserted = append(f.inserted, newParts...)
	return nil
}

func (f *fakePartsRepo) DeleteSellerParts(ctx context.Context, sellerID int64) error {
	kept := f.inserted[:0]
	for _, p := range f.inserted {
		if p.SellerID != sellerID {
			kept = append(kept, p)
		}
	}
	f.inserted = kept
	return nil
}

func (f *fakePartsRepo) ListParts(ctx context.Context, filter PartFilter) ([]Part, int, error) {
	return nil, 0, nil
}

type fakeStorageClient struct{}

func (f *fakeStorageClient) Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, error) {
	return "http://fake/" + path, nil
}

func (f *fakeStorageClient) UploadDual(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, string, error) {
	return "http://fake-minio/" + path, "http://fake-s3/" + path, nil
}

func buildOneRowWorkbook(t *testing.T) []byte {
	t.Helper()
	f := excelize.NewFile()
	sheet := "MODEL 3"
	f.SetSheetName(f.GetSheetName(0), sheet)
	f.SetCellValue(sheet, "A3", 1)
	f.SetCellValue(sheet, "C3", "OEM-1")
	f.SetCellValue(sheet, "D3", "desc")
	f.SetCellValue(sheet, "E3", "2020")
	f.SetCellValue(sheet, "F3", "Made in China＝$5")
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("write failed: %v", err)
	}
	return buf.Bytes()
}

func TestJobRunner_StartUploadProcessesAndCompletes(t *testing.T) {
	repo := newFakePartsRepo()
	jr := NewJobRunner(repo, &fakeStorageClient{})

	fileBytes := buildOneRowWorkbook(t)
	jobID := jr.StartUpload(context.Background(), "test-seller", fileBytes)
	if jobID == "" {
		t.Fatal("expected non-empty job id")
	}

	var job *Job
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		j, ok := jr.GetJob(jobID)
		if !ok {
			t.Fatal("job not found immediately after StartUpload")
		}
		if j.Status == JobDone || j.Status == JobFailed {
			job = j
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	if job == nil {
		t.Fatal("job did not complete within timeout")
	}
	if job.Status != JobDone {
		t.Fatalf("expected status done, got %s (error: %s)", job.Status, job.Error)
	}
	if job.Total != 1 || job.Processed != 1 {
		t.Fatalf("expected total=1 processed=1, got total=%d processed=%d", job.Total, job.Processed)
	}
	if len(repo.inserted) != 1 {
		t.Fatalf("expected 1 part inserted, got %d", len(repo.inserted))
	}
	if repo.inserted[0].OEM == nil || *repo.inserted[0].OEM != "OEM-1" {
		t.Fatalf("unexpected inserted part: %+v", repo.inserted[0])
	}
}

func TestJobRunner_GetJob_UnknownID(t *testing.T) {
	jr := NewJobRunner(newFakePartsRepo(), &fakeStorageClient{})
	_, ok := jr.GetJob("does-not-exist")
	if ok {
		t.Fatal("expected ok=false for unknown job id")
	}
}

func waitForJob(t *testing.T, jr *JobRunner, jobID string) *Job {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		j, ok := jr.GetJob(jobID)
		if !ok {
			t.Fatal("job not found")
		}
		if j.Status == JobDone || j.Status == JobFailed {
			return j
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("job did not complete within timeout")
	return nil
}

func TestJobRunner_ReuploadSameSellerDoesNotDuplicateParts(t *testing.T) {
	repo := newFakePartsRepo()
	jr := NewJobRunner(repo, &fakeStorageClient{})

	fileBytes := buildOneRowWorkbook(t)

	jobID1 := jr.StartUpload(context.Background(), "same-seller", fileBytes)
	job1 := waitForJob(t, jr, jobID1)
	if job1.Status != JobDone {
		t.Fatalf("first upload: expected done, got %s (%s)", job1.Status, job1.Error)
	}
	if len(repo.inserted) != 1 {
		t.Fatalf("first upload: expected 1 part inserted, got %d", len(repo.inserted))
	}

	jobID2 := jr.StartUpload(context.Background(), "same-seller", fileBytes)
	job2 := waitForJob(t, jr, jobID2)
	if job2.Status != JobDone {
		t.Fatalf("second upload: expected done, got %s (%s)", job2.Status, job2.Error)
	}

	if len(repo.inserted) != 1 {
		t.Fatalf("expected re-upload to replace rather than duplicate parts, got %d parts inserted", len(repo.inserted))
	}
}

func TestJobRunner_InvalidWorkbookSurfacesFailureThroughGetJob(t *testing.T) {
	repo := newFakePartsRepo()
	jr := NewJobRunner(repo, &fakeStorageClient{})

	invalidBytes := []byte("this is not a valid xlsx file")
	jobID := jr.StartUpload(context.Background(), "some-seller", invalidBytes)

	job := waitForJob(t, jr, jobID)
	if job.Status != JobFailed {
		t.Fatalf("expected status failed, got %s", job.Status)
	}
	if job.Error == "" {
		t.Fatal("expected non-empty error message on failed job")
	}
}
