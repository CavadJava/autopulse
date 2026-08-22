package storage

import (
	"context"
	"fmt"
	"io"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type s3Client struct {
	mc     *minio.Client
	bucket string
}

// NewS3Client connects to a real AWS S3 bucket. Unlike NewClient (MinIO),
// this does NOT attempt to create the bucket or set its policy — the
// bucket already exists and is managed by the user directly in the AWS
// console; a backend service reaching into a real AWS account's bucket
// policies is an avoidable extra risk for this small addition.
func NewS3Client(ctx context.Context, region, accessKey, secretKey, bucket string) (Client, error) {
	endpoint := fmt.Sprintf("s3.%s.amazonaws.com", region)
	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: true,
		Region: region,
	})
	if err != nil {
		return nil, fmt.Errorf("storage: connecting to aws s3: %w", err)
	}

	return &s3Client{mc: mc, bucket: bucket}, nil
}

func (c *s3Client) Upload(ctx context.Context, path string, data io.Reader, size int64, contentType string) (string, error) {
	_, err := c.mc.PutObject(ctx, c.bucket, path, data, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", fmt.Errorf("storage: uploading %q to s3: %w", path, err)
	}
	return fmt.Sprintf("https://%s.s3.amazonaws.com/%s", c.bucket, path), nil
}
