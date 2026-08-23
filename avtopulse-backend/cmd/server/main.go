package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/CavadJava/avtopulse-backend/docs"
	"github.com/CavadJava/avtopulse-backend/internal/admin"
	"github.com/CavadJava/avtopulse-backend/internal/auth"
	"github.com/CavadJava/avtopulse-backend/internal/db"
	"github.com/CavadJava/avtopulse-backend/internal/listings"
	"github.com/CavadJava/avtopulse-backend/internal/shop"
	"github.com/CavadJava/avtopulse-backend/internal/storage"
	"github.com/CavadJava/avtopulse-backend/internal/user"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	httpSwagger "github.com/swaggo/http-swagger/v2"
)

// @title AutoPulse Mağazalar API
// @version 1.0
// @description Backend API for AutoPulse's shop/mağaza listings — public shop/product browsing plus a simple cookie-based shop-owner login.
// @host localhost:8090
// @BasePath /api/shops
func main() {
	ctx := context.Background()

	dsn := os.Getenv("AVTOPULSE_DSN")
	if dsn == "" {
		log.Fatal("AVTOPULSE_DSN env var is required")
	}
	port := os.Getenv("AVTOPULSE_PORT")
	if port == "" {
		port = "8090"
	}

	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		log.Fatalf("failed to connect to db: %v", err)
	}
	defer pool.Close()

	if err := db.RunMigrations(ctx, pool, "migrations"); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	shopRepo := shop.NewRepository(pool)
	sessions := auth.NewSessionStore(pool)

	userRepo := user.NewRepository(pool)
	userSessions := user.NewSessionStore(pool)

	adminUsername := os.Getenv("ADMIN_USERNAME")
	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminUsername == "" || adminPassword == "" {
		log.Fatal("ADMIN_USERNAME and ADMIN_PASSWORD env vars are required")
	}

	minioEndpoint := os.Getenv("AVTOPULSE_MINIO_ENDPOINT")
	minioAccessKey := os.Getenv("AVTOPULSE_MINIO_ACCESS_KEY")
	minioSecretKey := os.Getenv("AVTOPULSE_MINIO_SECRET_KEY")
	minioBucket := os.Getenv("AVTOPULSE_MINIO_BUCKET")
	minioPublicURL := os.Getenv("AVTOPULSE_MINIO_PUBLIC_URL")
	if minioEndpoint == "" || minioAccessKey == "" || minioSecretKey == "" || minioBucket == "" || minioPublicURL == "" {
		log.Fatal("AVTOPULSE_MINIO_ENDPOINT, AVTOPULSE_MINIO_ACCESS_KEY, AVTOPULSE_MINIO_SECRET_KEY, AVTOPULSE_MINIO_BUCKET, AVTOPULSE_MINIO_PUBLIC_URL env vars are required")
	}

	minioClient, err := storage.NewClient(ctx, minioEndpoint, minioAccessKey, minioSecretKey, minioBucket, minioPublicURL, false)
	if err != nil {
		log.Fatalf("failed to connect to minio: %v", err)
	}

	var storageClient storage.Client = minioClient

	// Optional: mirror every upload to a real AWS S3 bucket too, in parallel
	// with MinIO. Only enabled if all 4 AWS env vars are set — otherwise the
	// backend runs MinIO-only, same as before.
	awsAccessKey := os.Getenv("AVTOPULSE_AWS_ACCESS_KEY_ID")
	awsSecretKey := os.Getenv("AVTOPULSE_AWS_SECRET_ACCESS_KEY")
	awsRegion := os.Getenv("AVTOPULSE_AWS_REGION")
	awsBucket := os.Getenv("AVTOPULSE_AWS_BUCKET")
	if awsAccessKey != "" || awsSecretKey != "" || awsRegion != "" || awsBucket != "" {
		if awsAccessKey == "" || awsSecretKey == "" || awsRegion == "" || awsBucket == "" {
			log.Fatal("AVTOPULSE_AWS_ACCESS_KEY_ID, AVTOPULSE_AWS_SECRET_ACCESS_KEY, AVTOPULSE_AWS_REGION, AVTOPULSE_AWS_BUCKET must all be set together, or all left unset")
		}
		s3Client, err := storage.NewS3Client(ctx, awsRegion, awsAccessKey, awsSecretKey, awsBucket)
		if err != nil {
			log.Fatalf("failed to connect to aws s3: %v", err)
		}
		storageClient = storage.NewDualClient(minioClient, s3Client)
		log.Printf("dual-write storage enabled: minio + aws s3 (%s/%s)", awsRegion, awsBucket)
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/healthz", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	r.Get("/swagger/*", httpSwagger.WrapHandler)

	authHandler := auth.NewHandler(shopRepo, sessions, storageClient)
	r.Post("/api/shops/login", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
	r.Get("/api/shops/me/products", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
	r.Post("/api/shops/logout", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
	r.Post("/api/shops/me/products", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
	r.Post("/api/shops/me/products/{id}/images", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
	r.Put("/api/shops/me/products/{id}", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
	r.Delete("/api/shops/me/products/{id}", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
	r.Post("/api/shops/me/products/{id}/restore", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
	r.Delete("/api/shops/me/products/{id}/images/{imageId}", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
	r.Post("/api/shops/me/logo", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})

	r.Mount("/api/shops", shop.NewHandler(shopRepo))

	r.Mount("/api/listings", listings.NewHandler(userRepo, shopRepo))

	userHandler := user.NewHandler(userRepo, userSessions, storageClient)
	r.Post("/api/users/otp/request", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})
	r.Post("/api/users/otp/verify", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})
	r.Post("/api/users/logout", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})
	r.Get("/api/users/me/products", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})
	r.Post("/api/users/me/products", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})
	r.Put("/api/users/me/products/{id}", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})
	r.Delete("/api/users/me/products/{id}", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})
	r.Post("/api/users/me/products/{id}/images", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/users", userHandler).ServeHTTP(w, req)
	})

	adminHandler := admin.NewHandler(userRepo, shopRepo, adminUsername, adminPassword)
	r.Post("/api/admin/login", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/admin", adminHandler).ServeHTTP(w, req)
	})
	r.Post("/api/admin/logout", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/admin", adminHandler).ServeHTTP(w, req)
	})
	r.Get("/api/admin/products/pending", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/admin", adminHandler).ServeHTTP(w, req)
	})
	r.Post("/api/admin/products/{id}/approve", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/admin", adminHandler).ServeHTTP(w, req)
	})
	r.Post("/api/admin/products/{id}/reject", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/admin", adminHandler).ServeHTTP(w, req)
	})
	r.Get("/api/admin/shop-products", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/admin", adminHandler).ServeHTTP(w, req)
	})
	r.Post("/api/admin/shop-products/{id}/cancel", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/admin", adminHandler).ServeHTTP(w, req)
	})

	addr := ":" + port
	srv := &http.Server{Addr: addr, Handler: r}

	go func() {
		log.Printf("avtopulse-backend listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}
