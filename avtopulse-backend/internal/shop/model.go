package shop

type Shop struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	CustomerID int64  `json:"customerId"`
	Title      string `json:"title"`
	Details    string `json:"details"`
	WorkTimes  string `json:"workTimes"`
}

type ShopSummary struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Title string `json:"title"`
}

type Product struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Title   string `json:"title"`
	Details string `json:"details"`
}
