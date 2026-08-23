package user

import (
	"encoding/json"
	"time"
)

type User struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Phone     string    `json:"phone"`
	Balans    int       `json:"balans"`
	CreatedAt time.Time `json:"createdAt"`
}

type ProductImage struct {
	ID       int64  `json:"id"`
	MinioURL string `json:"minioUrl"`
	S3URL    string `json:"s3Url"`
	Sira     int    `json:"sira"`
	Kind     string `json:"kind"`
}

type Product struct {
	ID      int64  `json:"id"`
	UserID  int64  `json:"userId"`
	Marka   string `json:"marka"`
	Model   string `json:"model"`
	Il      int    `json:"il"`
	Qiymet  int    `json:"qiymet"`
	Yurus   int    `json:"yurus"`
	Yanacaq string `json:"yanacaq"`
	Ban     string `json:"ban"`
	Title   string `json:"title"`
	Details string `json:"details"`
	Status  string `json:"status"`

	DetailsJSON json.RawMessage `json:"details"`
	ViewCount   int             `json:"viewCount"`
	VipTier     string          `json:"vipTier"`
	QiymetUSD   int             `json:"qiymetUsd"`

	Images []ProductImage `json:"images"`
}

type CreateProductInput struct {
	Marka   string `json:"marka"`
	Model   string `json:"model"`
	Il      int    `json:"il"`
	Qiymet  int    `json:"qiymet"`
	Yurus   int    `json:"yurus"`
	Yanacaq string `json:"yanacaq"`
	Ban     string `json:"ban"`
	Title   string `json:"title"`
	Details string `json:"details"`

	DetailsJSON json.RawMessage `json:"details"`
	QiymetUSD   int             `json:"qiymetUsd"`
}
