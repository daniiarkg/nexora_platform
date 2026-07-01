package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AppEnv         string
	Port           string
	PublicAppURL   string
	DatabaseURL    string
	ValkeyURL      string
	AllowedOrigins []string
	AdminAPIToken  string

	SessionCookieName         string
	SessionTTLHours           int
	EmailConfirmationTTLHours int
	PasswordResetTTLMinutes   int
	AuthAccessKeys            []string
	GoogleOAuthClientID       string
	GoogleOAuthClientSecret   string
	GoogleOAuthRedirectURL    string

	GeminiAPIKey string
	GeminiModel  string

	SMTPHost            string
	SMTPPort            int
	SMTPUsername        string
	SMTPPassword        string
	SMTPFrom            string
	SMTPFromOptions     []string
	SMTPAdminRecipients []string
	EmailWorkers        int

	PaymentProvider      string
	PaymentWebhookSecret string

	RateLimitRPS   float64
	RateLimitBurst int
}

func Load() (Config, error) {
	cfg := Config{
		AppEnv:                    getEnv("APP_ENV", "development"),
		Port:                      getEnv("API_PORT", "8080"),
		PublicAppURL:              getEnv("PUBLIC_APP_URL", "http://localhost:3000"),
		DatabaseURL:               os.Getenv("DATABASE_URL"),
		ValkeyURL:                 os.Getenv("VALKEY_URL"),
		AllowedOrigins:            splitCSV(getEnv("ALLOWED_ORIGINS", "http://localhost:3000")),
		AdminAPIToken:             os.Getenv("ADMIN_API_TOKEN"),
		SessionCookieName:         getEnv("SESSION_COOKIE_NAME", "nexora_session"),
		SessionTTLHours:           getEnvInt("SESSION_TTL_HOURS", 720),
		EmailConfirmationTTLHours: getEnvInt("EMAIL_CONFIRMATION_TTL_HOURS", 24),
		PasswordResetTTLMinutes:   getEnvInt("PASSWORD_RESET_TTL_MINUTES", 30),
		AuthAccessKeys:            splitCSV(os.Getenv("AUTH_ACCESS_KEYS")),
		GoogleOAuthClientID:       os.Getenv("GOOGLE_OAUTH_CLIENT_ID"),
		GoogleOAuthClientSecret:   os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET"),
		GoogleOAuthRedirectURL:    getEnv("GOOGLE_OAUTH_REDIRECT_URL", "http://localhost:8080/api/v1/auth/google/callback"),
		GeminiAPIKey:              os.Getenv("GEMINI_API_KEY"),
		GeminiModel:               getEnv("GEMINI_MODEL", "gemini-2.5-flash"),
		SMTPHost:                  getEnv("SMTP_HOST", "smtp.gmail.com"),
		SMTPUsername:              os.Getenv("SMTP_USERNAME"),
		SMTPFrom:                  os.Getenv("SMTP_FROM"),
		SMTPFromOptions:           splitCSV(os.Getenv("SMTP_FROM_OPTIONS")),
		EmailWorkers:              getEnvInt("EMAIL_WORKERS", 2),
		PaymentProvider:           strings.ToLower(getEnv("PAYMENT_PROVIDER", "unselected")),
		PaymentWebhookSecret:      os.Getenv("PAYMENT_WEBHOOK_SECRET"),
		RateLimitRPS:              getEnvFloat("RATE_LIMIT_RPS", 8),
		RateLimitBurst:            getEnvInt("RATE_LIMIT_BURST", 20),
	}

	cfg.SMTPPort = getEnvInt("SMTP_PORT", 587)
	cfg.SMTPPassword = os.Getenv("SMTP_APP_PASSWORD")
	if cfg.SMTPPassword == "" {
		cfg.SMTPPassword = os.Getenv("SMTP_PASSWORD")
	}
	if len(cfg.SMTPFromOptions) == 0 && cfg.SMTPFrom != "" {
		cfg.SMTPFromOptions = []string{cfg.SMTPFrom}
	}
	cfg.SMTPAdminRecipients = splitCSV(os.Getenv("SMTP_ADMIN_RECIPIENTS"))

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if cfg.ValkeyURL == "" {
		return Config{}, errors.New("VALKEY_URL is required")
	}
	if cfg.AdminAPIToken == "" {
		return Config{}, errors.New("ADMIN_API_TOKEN is required")
	}
	if cfg.AppEnv == "production" && cfg.GeminiAPIKey == "" {
		return Config{}, errors.New("GEMINI_API_KEY is required in production")
	}
	if cfg.AppEnv == "production" && strings.Contains(cfg.AdminAPIToken, "change-me") {
		return Config{}, errors.New("ADMIN_API_TOKEN must be rotated in production")
	}
	if cfg.RateLimitRPS <= 0 || cfg.RateLimitBurst <= 0 {
		return Config{}, errors.New("rate limit values must be positive")
	}
	if cfg.SessionTTLHours <= 0 || cfg.EmailConfirmationTTLHours <= 0 || cfg.PasswordResetTTLMinutes <= 0 {
		return Config{}, errors.New("auth ttl values must be positive")
	}
	if cfg.AppEnv == "production" && strings.TrimSpace(cfg.SessionCookieName) == "" {
		return Config{}, errors.New("SESSION_COOKIE_NAME is required in production")
	}

	return cfg, nil
}

func getEnv(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getEnvInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getEnvFloat(key string, fallback float64) float64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item != "" {
			out = append(out, item)
		}
	}
	return out
}

func (c Config) SMTPAddress() string {
	return fmt.Sprintf("%s:%d", c.SMTPHost, c.SMTPPort)
}
