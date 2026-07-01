package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/daniiarkg/nexora_platform/backend/internal/ai"
	authsec "github.com/daniiarkg/nexora_platform/backend/internal/auth"
	"github.com/daniiarkg/nexora_platform/backend/internal/cache"
	"github.com/daniiarkg/nexora_platform/backend/internal/config"
	"github.com/daniiarkg/nexora_platform/backend/internal/httpserver"
	"github.com/daniiarkg/nexora_platform/backend/internal/mail"
	"github.com/daniiarkg/nexora_platform/backend/internal/payments"
	"github.com/daniiarkg/nexora_platform/backend/internal/store"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load(".env", "../.env")

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config load failed", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	dbStore, err := store.New(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("postgres connection failed", "error", err)
		os.Exit(1)
	}
	defer dbStore.Close()

	if err := dbStore.Migrate(ctx); err != nil {
		logger.Error("postgres migration failed", "error", err)
		os.Exit(1)
	}
	if err := dbStore.SeedAccessKeys(ctx, accessKeySeeds(cfg.AuthAccessKeys)); err != nil {
		logger.Error("access key seed failed", "error", err)
		os.Exit(1)
	}

	valkey, err := cache.New(ctx, cfg.ValkeyURL)
	if err != nil {
		logger.Error("valkey connection failed", "error", err)
		os.Exit(1)
	}
	defer valkey.Close()

	mailer := mail.NewMailer(mail.Config{
		Host:        cfg.SMTPHost,
		Port:        cfg.SMTPPort,
		Username:    cfg.SMTPUsername,
		Password:    cfg.SMTPPassword,
		From:        cfg.SMTPFrom,
		FromOptions: cfg.SMTPFromOptions,
		Recipients:  cfg.SMTPAdminRecipients,
		AppURL:      cfg.PublicAppURL,
	}, logger)
	mailer.Start(ctx, cfg.EmailWorkers)

	app := httpserver.New(httpserver.Dependencies{
		Config:   cfg,
		Store:    dbStore,
		Cache:    valkey,
		AI:       ai.NewGeminiClient(cfg.GeminiAPIKey, cfg.GeminiModel),
		Mailer:   mailer,
		Payments: payments.NewProvider(cfg.PaymentProvider),
		Logger:   logger,
	})

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           app.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       90 * time.Second,
	}

	go func() {
		logger.Info("nexora api listening", "addr", server.Addr, "env", cfg.AppEnv)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("api server failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("api shutdown failed", "error", err)
		os.Exit(1)
	}
	logger.Info("nexora api stopped")
}

func accessKeySeeds(keys []string) []store.AccessKeySeed {
	seeds := make([]store.AccessKeySeed, 0, len(keys))
	for i, key := range keys {
		if key == "" {
			continue
		}
		seeds = append(seeds, store.AccessKeySeed{
			Label:     "Bootstrap access key " + strconv.Itoa(i+1),
			TokenHash: authsec.HashToken(key),
		})
	}
	return seeds
}
