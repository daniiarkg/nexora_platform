package httpserver

import (
	"log/slog"
	"net/http"

	"github.com/daniiarkg/nexora_platform/backend/internal/ai"
	"github.com/daniiarkg/nexora_platform/backend/internal/cache"
	"github.com/daniiarkg/nexora_platform/backend/internal/config"
	"github.com/daniiarkg/nexora_platform/backend/internal/mail"
	"github.com/daniiarkg/nexora_platform/backend/internal/payments"
	"github.com/daniiarkg/nexora_platform/backend/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

type Dependencies struct {
	Config   config.Config
	Store    *store.Store
	Cache    *cache.Client
	AI       *ai.GeminiClient
	Mailer   *mail.Mailer
	Payments payments.Provider
	Logger   *slog.Logger
}

type Server struct {
	cfg      config.Config
	store    *store.Store
	cache    *cache.Client
	ai       *ai.GeminiClient
	mailer   *mail.Mailer
	payments payments.Provider
	logger   *slog.Logger
}

func New(deps Dependencies) *Server {
	return &Server{
		cfg:      deps.Config,
		store:    deps.Store,
		cache:    deps.Cache,
		ai:       deps.AI,
		mailer:   deps.Mailer,
		payments: deps.Payments,
		logger:   deps.Logger,
	}
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(secureHeaders)
	r.Use(newIPRateLimiter(s.cfg.RateLimitRPS, s.cfg.RateLimitBurst).middleware)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   s.cfg.AllowedOrigins,
		AllowedMethods:   []string{http.MethodGet, http.MethodPost, http.MethodOptions},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/healthz", s.health)

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/automation-requests", s.createAutomationRequest)
		r.Post("/ai/chat", s.chat)
		r.Post("/payments/checkout-intents", s.createCheckoutIntent)

		r.Group(func(admin chi.Router) {
			admin.Use(s.requireAdmin)
			admin.Get("/admin/automation-requests", s.listAutomationRequests)
		})
	})

	return r
}

func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !bearerTokenMatches(r.Header.Get("Authorization"), s.cfg.AdminAPIToken) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "admin authorization required",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}
