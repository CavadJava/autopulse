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

	"github.com/CavadJava/avtopulse-backend/internal/auth"
	"github.com/CavadJava/avtopulse-backend/internal/db"
	"github.com/CavadJava/avtopulse-backend/internal/shop"
	_ "github.com/CavadJava/avtopulse-backend/docs"
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

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/healthz", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	r.Get("/swagger/*", httpSwagger.WrapHandler)

	authHandler := auth.NewHandler(shopRepo, sessions)
	r.Post("/api/shops/login", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
	r.Get("/api/shops/me/products", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})
	r.Post("/api/shops/logout", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/api/shops", authHandler).ServeHTTP(w, req)
	})

	r.Mount("/api/shops", shop.NewHandler(shopRepo))

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
