package api

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// rateLimiter is a fixed-window per-key counter.
//
// It guards the login endpoint, which is the only unauthenticated write path
// in the application (D-039). In-memory is the right scope: Konku is a single
// process serving one user, and a Redis-backed limiter would be the first
// dependency added for a problem that does not exist (D-023).
type rateLimiter struct {
	mu      sync.Mutex
	hits    map[string]*window
	limit   int
	perWind time.Duration
}

type window struct {
	count int
	reset time.Time
}

func newRateLimiter(limit int, per time.Duration) *rateLimiter {
	return &rateLimiter{
		hits:    make(map[string]*window),
		limit:   limit,
		perWind: per,
	}
}

// allow reports whether key may proceed, and sweeps expired windows so the map
// cannot grow without bound from spoofed source addresses.
func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()

	for k, w := range rl.hits {
		if now.After(w.reset) {
			delete(rl.hits, k)
		}
	}

	w, ok := rl.hits[key]
	if !ok || now.After(w.reset) {
		rl.hits[key] = &window{count: 1, reset: now.Add(rl.perWind)}
		return true
	}

	if w.count >= rl.limit {
		return false
	}
	w.count++
	return true
}

// clientKey returns the client IP without its source port.
//
// This matters more than it looks. chi's RealIP middleware rewrites
// RemoteAddr to a bare IP when the proxy headers are present, but on a direct
// connection RemoteAddr is "IP:port" and the port changes with every new TCP
// connection. Keying on the raw value would give each attempt its own bucket
// and silently disable rate limiting entirely — exactly when it matters most,
// because a direct connection means the reverse proxy was bypassed.
func clientKey(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

func (rl *rateLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.allow(clientKey(r)) {
			writeError(w, http.StatusTooManyRequests, CodeRateLimited,
				"Terlalu banyak percobaan. Coba lagi beberapa menit lagi.")
			return
		}
		next.ServeHTTP(w, r)
	})
}
