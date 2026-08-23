package adminnotify

import "time"

type Filters struct {
	RecipientType          string     `json:"recipientType"` // "user", "shop", or "" for both
	BalanceMin             *int       `json:"balanceMin,omitempty"`
	BalanceMax             *int       `json:"balanceMax,omitempty"`
	CreatedFrom            *time.Time `json:"createdFrom,omitempty"`
	CreatedTo              *time.Time `json:"createdTo,omitempty"`
	HasActiveListing       *bool      `json:"hasActiveListing,omitempty"`
	HasNonVipActiveListing *bool      `json:"hasNonVipActiveListing,omitempty"`
}

type RecipientRef struct {
	Type string
	ID   int64
}

type Notification struct {
	ID        int64     `json:"id"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Filters   Filters   `json:"filters"`
	CreatedAt time.Time `json:"createdAt"`
}

type NotificationSummary struct {
	Notification
	SentCount int `json:"sentCount"`
	ReadCount int `json:"readCount"`
}

type UserNotification struct {
	ID             int64     `json:"id"`
	NotificationID int64     `json:"notificationId"`
	Title          string    `json:"title"`
	Body           string    `json:"body"`
	IsRead         bool      `json:"isRead"`
	CreatedAt      time.Time `json:"createdAt"`
}
