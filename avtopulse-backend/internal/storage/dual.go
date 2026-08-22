package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
)

type dualClient struct {
	primary   Client // MinIO — its URL is what Upload returns
	secondary Client // real AWS S3 — written in parallel, no fallback URL
}

// NewDualClient writes every upload to both the primary (MinIO) and
// secondary (real AWS S3) storage clients. Both writes must succeed —
// if either fails, Upload returns an error. The returned URL always comes
// from the primary client; the secondary is a parallel copy only.
//
// There is no rollback: if the primary write succeeds but the secondary
// fails, the object is left in the primary store. Cleaning that up is not
// worth the complexity for this small addition — a rare, manually
// recoverable edge case.
func NewDualClient(primary, secondary Client) Client {
	return &dualClient{primary: primary, secondary: secondary}
}

func (d *dualClient) Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, error) {
	minioURL, _, err := d.UploadDual(ctx, path, data, size, contentType)
	return minioURL, err
}

func (d *dualClient) UploadDual(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, string, error) {
	// io.Reader can only be consumed once — buffer it so both writes can
	// read the same content independently.
	buf, err := io.ReadAll(data)
	if err != nil {
		return "", "", fmt.Errorf("storage: buffering upload %q: %w", path, err)
	}

	minioURL, err := d.primary.Upload(ctx, path, bytes.NewReader(buf), size, contentType)
	if err != nil {
		return "", "", fmt.Errorf("storage: primary (minio) upload failed: %w", err)
	}

	s3URL, err := d.secondary.Upload(ctx, "shop/"+path, bytes.NewReader(buf), size, contentType)
	if err != nil {
		return "", "", fmt.Errorf("storage: secondary (aws s3) upload failed: %w", err)
	}

	return minioURL, s3URL, nil
}
