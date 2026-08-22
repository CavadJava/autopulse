package storage

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
)

type fakeClient struct {
	failWith error
	uploaded []string // paths this client was asked to upload
}

func (f *fakeClient) Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, error) {
	if f.failWith != nil {
		return "", f.failWith
	}
	io.ReadAll(data) // drain, matching a real client's behavior
	f.uploaded = append(f.uploaded, path)
	return "http://fake/" + path, nil
}

func (f *fakeClient) UploadDual(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, string, error) {
	url, err := f.Upload(ctx, path, data, size, contentType)
	return url, "", err
}

func TestDualClient_BothSucceed(t *testing.T) {
	primary := &fakeClient{}
	secondary := &fakeClient{}
	client := NewDualClient(primary, secondary)

	url, err := client.Upload(context.Background(), "test/foo.jpg", strings.NewReader("data"), 4, "image/jpeg")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if url != "http://fake/test/foo.jpg" {
		t.Fatalf("expected URL from primary, got %q", url)
	}
	if len(primary.uploaded) != 1 || primary.uploaded[0] != "test/foo.jpg" {
		t.Fatalf("expected primary to receive 'test/foo.jpg', got %v", primary.uploaded)
	}
	if len(secondary.uploaded) != 1 || secondary.uploaded[0] != "shop/test/foo.jpg" {
		t.Fatalf("expected secondary to receive 'shop/test/foo.jpg' (shop/ prefix), got %v", secondary.uploaded)
	}
}

func TestDualClient_PrimaryFails(t *testing.T) {
	primary := &fakeClient{failWith: errors.New("minio down")}
	secondary := &fakeClient{}
	client := NewDualClient(primary, secondary)

	_, err := client.Upload(context.Background(), "test/foo.jpg", strings.NewReader("data"), 4, "image/jpeg")
	if err == nil {
		t.Fatal("expected an error when primary fails")
	}
	if len(secondary.uploaded) != 0 {
		t.Fatalf("expected secondary to NOT be attempted when primary fails, got %v", secondary.uploaded)
	}
}

func TestDualClient_SecondaryFails(t *testing.T) {
	primary := &fakeClient{}
	secondary := &fakeClient{failWith: errors.New("aws down")}
	client := NewDualClient(primary, secondary)

	_, err := client.Upload(context.Background(), "test/foo.jpg", strings.NewReader("data"), 4, "image/jpeg")
	if err == nil {
		t.Fatal("expected an error when secondary fails, even though primary succeeded")
	}
	if len(primary.uploaded) != 1 {
		t.Fatalf("expected primary to have already been attempted (and succeeded) before secondary failed, got %v", primary.uploaded)
	}
}

func TestDualClient_UploadDual_ReturnsBothURLs(t *testing.T) {
	primary := &fakeClient{}
	secondary := &fakeClient{}
	client := NewDualClient(primary, secondary)

	dc, ok := client.(interface {
		UploadDual(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, string, error)
	})
	if !ok {
		t.Fatal("expected dualClient to implement UploadDual")
	}

	minioURL, s3URL, err := dc.UploadDual(context.Background(), "test/foo.jpg", strings.NewReader("data"), 4, "image/jpeg")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if minioURL != "http://fake/test/foo.jpg" {
		t.Fatalf("expected minio URL from primary, got %q", minioURL)
	}
	if s3URL != "http://fake/shop/test/foo.jpg" {
		t.Fatalf("expected s3 URL from secondary with shop/ prefix, got %q", s3URL)
	}
}
