package parts

type Seller struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type Part struct {
	ID                int64    `json:"id"`
	SellerID          int64    `json:"sellerId"`
	SellerName        string   `json:"sellerName"`
	Model             string   `json:"model"`
	RowNo             *int     `json:"rowNo,omitempty"`
	OEM               *string  `json:"oem,omitempty"`
	Description       *string  `json:"description,omitempty"`
	YearRange         *string  `json:"yearRange,omitempty"`
	PriceRaw          *string  `json:"priceRaw,omitempty"`
	PriceMadeInChina  *float64 `json:"priceMadeInChina,omitempty"`
	PriceOriginalNew  *float64 `json:"priceOriginalNew,omitempty"`
	PriceOriginalUsed *float64 `json:"priceOriginalUsed,omitempty"`
	ImageURL          *string  `json:"imageUrl,omitempty"`
}

type NewPart struct {
	SellerID          int64
	Model             string
	RowNo             *int
	OEM               *string
	Description       *string
	YearRange         *string
	PriceRaw          *string
	PriceMadeInChina  *float64
	PriceOriginalNew  *float64
	PriceOriginalUsed *float64
	ImageURL          *string
	ImageURLS3        *string
}

type PartFilter struct {
	Model     string
	SellerIDs []int64
	Page      int
	Limit     int
}

var ValidModels = map[string]bool{
	"model3":     true,
	"modely":     true,
	"models":     true,
	"modelx":     true,
	"cybertruck": true,
}
