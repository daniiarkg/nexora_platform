package httpserver

import (
	"crypto/subtle"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

func secureHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("Cross-Origin-Resource-Policy", "same-site")
		next.ServeHTTP(w, r)
	})
}

type ipRateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     rate.Limit
	burst    int
}

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newIPRateLimiter(rps float64, burst int) *ipRateLimiter {
	limiter := &ipRateLimiter{
		visitors: make(map[string]*visitor),
		rate:     rate.Limit(rps),
		burst:    burst,
	}
	go limiter.cleanup()
	return limiter
}

func (l *ipRateLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.getLimiter(realIP(r)).Allow() {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{
				"error": "rate limit exceeded",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (l *ipRateLimiter) getLimiter(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()

	v, ok := l.visitors[ip]
	if !ok {
		v = &visitor{limiter: rate.NewLimiter(l.rate, l.burst)}
		l.visitors[ip] = v
	}
	v.lastSeen = time.Now()
	return v.limiter
}

func (l *ipRateLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		l.mu.Lock()
		for ip, v := range l.visitors {
			if time.Since(v.lastSeen) > 15*time.Minute {
				delete(l.visitors, ip)
			}
		}
		l.mu.Unlock()
	}
}

func realIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if first := strings.TrimSpace(parts[0]); first != "" {
			return first
		}
	}
	if real := strings.TrimSpace(r.Header.Get("X-Real-IP")); real != "" {
		return real
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func bearerTokenMatches(header string, expected string) bool {
	token, ok := strings.CutPrefix(header, "Bearer ")
	if !ok {
		return false
	}
	token = strings.TrimSpace(token)
	if token == "" || expected == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(token), []byte(expected)) == 1
}
