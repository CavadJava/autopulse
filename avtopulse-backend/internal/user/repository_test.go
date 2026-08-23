package user

import (
	"context"
	"testing"
)

type fakeRepo struct {
	products map[int64]Product
	nextID   int64
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{products: map[int64]Product{}, nextID: 1}
}

func (f *fakeRepo) FindOrCreateByPhone(ctx context.Context, phone string) (*User, error) {
	return &User{ID: 1, Phone: phone}, nil
}

func (f *fakeRepo) ListMyProducts(ctx context.Context, userID int64) ([]Product, error) {
	out := []Product{}
	for _, p := range f.products {
		if p.UserID == userID {
			out = append(out, p)
		}
	}
	return out, nil
}

func (f *fakeRepo) CreateProduct(ctx context.Context, userID int64, input CreateProductInput) (*Product, error) {
	id := f.nextID
	f.nextID++
	p := Product{
		ID: id, UserID: userID, Marka: input.Marka, Model: input.Model, Il: input.Il,
		Qiymet: input.Qiymet, Yurus: input.Yurus, Yanacaq: input.Yanacaq, Ban: input.Ban,
		Title: input.Title, Details: input.Details, Status: "gozlemede", Images: []ProductImage{},
	}
	f.products[id] = p
	return &p, nil
}

func (f *fakeRepo) UpdateProduct(ctx context.Context, productID int64, input CreateProductInput) (*Product, error) {
	p, ok := f.products[productID]
	if !ok {
		return nil, ErrNotFound
	}
	newStatus := p.Status
	if p.Status == "legv_edilib" {
		newStatus = "gozlemede"
	}
	p.Marka, p.Model, p.Il, p.Qiymet, p.Yurus, p.Yanacaq, p.Ban, p.Title, p.Details, p.Status =
		input.Marka, input.Model, input.Il, input.Qiymet, input.Yurus, input.Yanacaq, input.Ban, input.Title, input.Details, newStatus
	f.products[productID] = p
	return &p, nil
}

func (f *fakeRepo) DeleteProduct(ctx context.Context, productID int64) error {
	p, ok := f.products[productID]
	if !ok {
		return ErrNotFound
	}
	p.Status = "legv_edilib"
	f.products[productID] = p
	return nil
}

func (f *fakeRepo) GetProductUserID(ctx context.Context, productID int64) (int64, error) {
	p, ok := f.products[productID]
	if !ok {
		return 0, ErrNotFound
	}
	return p.UserID, nil
}

func (f *fakeRepo) AddProductImage(ctx context.Context, productID int64, minioURL, s3URL string, sira int, kind string) (*ProductImage, error) {
	return &ProductImage{ID: int64(sira + 1), MinioURL: minioURL, S3URL: s3URL, Sira: sira, Kind: kind}, nil
}

func (f *fakeRepo) IncrementViewCount(ctx context.Context, productID int64) error {
	return nil
}

func (f *fakeRepo) PromoteProduct(ctx context.Context, productID int64, tier string, price int) (*Product, error) {
	return nil, nil
}

func (f *fakeRepo) ListPendingProducts(ctx context.Context) ([]Product, error) {
	out := []Product{}
	for _, p := range f.products {
		if p.Status == "gozlemede" {
			out = append(out, p)
		}
	}
	return out, nil
}

func (f *fakeRepo) ApproveProduct(ctx context.Context, productID int64) error {
	p, ok := f.products[productID]
	if !ok {
		return ErrNotFound
	}
	p.Status = "saytda"
	f.products[productID] = p
	return nil
}

func (f *fakeRepo) RejectProduct(ctx context.Context, productID int64) error {
	p, ok := f.products[productID]
	if !ok {
		return ErrNotFound
	}
	p.Status = "legv_edilib"
	f.products[productID] = p
	return nil
}

func TestCreateProduct_StartsAsGozlemede(t *testing.T) {
	repo := newFakeRepo()
	p, err := repo.CreateProduct(context.Background(), 1, CreateProductInput{Marka: "Toyota", Title: "Test"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Status != "gozlemede" {
		t.Fatalf("expected status gozlemede, got %q", p.Status)
	}
}

func TestUpdateProduct_LegvEdilib_GoesBackToGozlemede(t *testing.T) {
	repo := newFakeRepo()
	repo.products[1] = Product{ID: 1, UserID: 1, Status: "legv_edilib"}

	updated, err := repo.UpdateProduct(context.Background(), 1, CreateProductInput{Title: "Updated"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Status != "gozlemede" {
		t.Fatalf("expected status to reset to gozlemede after editing a legv_edilib product, got %q", updated.Status)
	}
}

func TestUpdateProduct_Saytda_StaysUnchanged(t *testing.T) {
	repo := newFakeRepo()
	repo.products[1] = Product{ID: 1, UserID: 1, Status: "saytda"}

	updated, err := repo.UpdateProduct(context.Background(), 1, CreateProductInput{Title: "Updated"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Status != "saytda" {
		t.Fatalf("expected status to remain saytda when editing an already-approved product, got %q", updated.Status)
	}
}

func TestDeleteProduct_SetsLegvEdilib(t *testing.T) {
	repo := newFakeRepo()
	repo.products[1] = Product{ID: 1, UserID: 1, Status: "saytda"}

	if err := repo.DeleteProduct(context.Background(), 1); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.products[1].Status != "legv_edilib" {
		t.Fatalf("expected status legv_edilib after delete, got %q", repo.products[1].Status)
	}
}
