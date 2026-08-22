package storage

import (
	"context"
	"fmt"
	"io"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Client interface {
	// Upload puts data at the given object path inside the configured bucket
	// and returns a publicly-reachable URL for it (the bucket has a
	// public-read policy, so no signed URL is needed for GET).
	Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, error)
}

type minioClient struct {
	mc        *minio.Client
	bucket    string
	publicURL string // e.g. "http://127.0.0.1:9000" or a public endpoint if fronted by a proxy
}

const publicReadPolicyTemplate = `{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Principal": {"AWS": ["*"]},
			"Action": ["s3:GetObject"],
			"Resource": ["arn:aws:s3:::%s/*"]
		}
	]
}`

// NewClient connects to a MinIO (or any S3-compatible) endpoint, ensures the
// given bucket exists with a public-read policy (car/shop photos are meant
// to be publicly viewable — no signed URLs), and returns a Client ready to
// accept uploads.
func NewClient(ctx context.Context, endpoint, accessKey, secretKey, bucket, publicURL string, useSSL bool) (Client, error) {
	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("storage: connecting to minio: %w", err)
	}

	exists, err := mc.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("storage: checking bucket %q: %w", bucket, err)
	}
	if !exists {
		if err := mc.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("storage: creating bucket %q: %w", bucket, err)
		}
	}

	policy := fmt.Sprintf(publicReadPolicyTemplate, bucket)
	if err := mc.SetBucketPolicy(ctx, bucket, policy); err != nil {
		return nil, fmt.Errorf("storage: setting public-read policy on %q: %w", bucket, err)
	}

	return &minioClient{mc: mc, bucket: bucket, publicURL: publicURL}, nil
}

func (c *minioClient) Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, error) {
	_, err := c.mc.PutObject(ctx, c.bucket, path, data, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", fmt.Errorf("storage: uploading %q: %w", path, err)
	}
	return fmt.Sprintf("%s/%s/%s", c.publicURL, c.bucket, path), nil
}
