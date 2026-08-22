package storage

import (
	"bytes"
	"context"
	"net/http"
	"os"
	"testing"
)

func TestUpload_RealMinIO(t *testing.T) {
	endpoint := os.Getenv("AVTOPULSE_TEST_MINIO_ENDPOINT")
	if endpoint == "" {
		t.Skip("AVTOPULSE_TEST_MINIO_ENDPOINT not set, skipping integration test")
	}
	accessKey := os.Getenv("AVTOPULSE_TEST_MINIO_ACCESS_KEY")
	secretKey := os.Getenv("AVTOPULSE_TEST_MINIO_SECRET_KEY")

	ctx := context.Background()
	client, err := NewClient(ctx, endpoint, accessKey, secretKey, "avtopulse-test", "http://"+endpoint, false)
	if err != nil {
		t.Fatalf("NewClient failed: %v", err)
	}

	content := []byte("test image bytes")
	url, err := client.Upload(ctx, "test/upload_test.txt", bytes.NewReader(content), int64(len(content)), "text/plain")
	if err != nil {
		t.Fatalf("Upload failed: %v", err)
	}
	if url == "" {
		t.Fatal("expected a non-empty URL")
	}

	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("fetching uploaded object failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 fetching uploaded object (public-read policy), got %d", resp.StatusCode)
	}
}
