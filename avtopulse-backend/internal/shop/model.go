package shop

import "encoding/json"

type Shop struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	CustomerID int64  `json:"customerId"`
	Title      string `json:"title"`
	Details    string `json:"details"`
	WorkTimes  string `json:"workTimes"`
	LogoURL    string `json:"logoUrl"`
	Email      string `json:"email"`
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
}
