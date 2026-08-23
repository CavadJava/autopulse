package listings

import "encoding/json"

type ImageOut struct {
	MinioURL string `json:"minioUrl"`
	S3URL    string `json:"s3Url"`
	Sira     int    `json:"sira"`
	Kind     string `json:"kind"`
}

type PublicListing struct {
	Source      string          `json:"source"` // "shop" or "user"
	ID          int64           `json:"id"`
	Marka       string          `json:"marka"`
	Model       string          `json:"model"`
	Il          int             `json:"il"`
	Qiymet      int             `json:"qiymet"`
	Yurus       int             `json:"yurus"`
	Yanacaq     string          `json:"yanacaq"`
	Ban         string          `json:"ban"`
	Title       string          `json:"title"`
	Details     string          `json:"details"`
	Images      []ImageOut      `json:"images"`
	SellerType  string          `json:"sellerType"` // "diler" or "şəxsi"
	SellerName  string          `json:"sellerName"` // shop name, or "" for user listings
	DetailsJSON json.RawMessage `json:"detailsJson"`
	ViewCount   int             `json:"viewCount"`
	VipTier     string          `json:"vipTier"`
}
