package shop

import (
	"encoding/json"
	"time"
)

type Shop struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	CustomerID  int64     `json:"customerId"`
	Title       string    `json:"title"`
	Details     string    `json:"details"`
	WorkTimes   string    `json:"workTimes"`
	LogoURL     string    `json:"logoUrl"`
	Email       string    `json:"email"`
	Balans      int       `json:"balans"`
	Address     string    `json:"address"`
	ContactName string    `json:"contactName"`
	CreatedAt   time.Time `json:"createdAt"`
}

type CreateShopInput struct {
	Name     string `json:"name"`
	Title    string `json:"title"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type ShopSummary struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Title string `json:"title"`
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
	Name    string `json:"name"`
	Title   string `json:"title"`
	Details string `json:"details"`
	Marka   string `json:"marka"`
	Model   string `json:"model"`
	Il      int    `json:"il"`
	Qiymet  int    `json:"qiymet"`
	Yurus   int    `json:"yurus"`
	Yanacaq string `json:"yanacaq"`
	Ban     string `json:"ban"`
	Status  string `json:"status"`

	DetailsJSON json.RawMessage `json:"details"`
	ViewCount   int             `json:"viewCount"`
	VipTier     string          `json:"vipTier"`
	QiymetUSD   int             `json:"qiymetUsd"`

	Images []ProductImage `json:"images"`
}

type ProductWithShopName struct {
	Product
	ShopName string `json:"shopName"`
}

type CreateProductInput struct {
	Name    string `json:"name"`
	Title   string `json:"title"`
	Details string `json:"details"`
	Marka   string `json:"marka"`
	Model   string `json:"model"`
	Il      int    `json:"il"`
	Qiymet  int    `json:"qiymet"`
	Yurus   int    `json:"yurus"`
	Yanacaq string `json:"yanacaq"`
	Ban     string `json:"ban"`

	DetailsJSON json.RawMessage `json:"details"`
	QiymetUSD   int             `json:"qiymetUsd"`
}
