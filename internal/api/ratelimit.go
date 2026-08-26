package api

import (
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/Katzelabs/Konku/internal/config"
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

	// lastSweep is when expired windows were last evicted. See allow.
	lastSweep time.Time
}

type window struct {
	count int
	reset time.Time
}

// The login budget, per IP. Tight on purpose: this is the one unauthenticated
// path where a correct guess is a whole account, and ten tries in five minutes
// is far more than a person who has forgotten a password needs and far less
// than a guessing loop wants.
const (
	defaultMaxLoginAttempts = 10
	loginLimitWindow        = 5 * time.Minute
)

// loginAttempts is read at construction because the limiter is built once,
// mirroring writesPerMinute in quota.go.
func loginAttempts(cfg config.Config) int {
	if cfg.MaxLoginAttempts > 0 {
		return cfg.MaxLoginAttempts
	}
	return defaultMaxLoginAttempts
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
//
// The sweep runs at most once per window rather than on every call. It used to
// iterate every key on every request, while holding the mutex — O(n) under a
// global lock on the hot path, so the cost scaled with exactly the flood the
// limiter exists to absorb, and the busier the attack the more the defence cost.
//
// Once per window is still enough for what the sweep is for: a key's window
// lasts perWind, so nothing survives more than two sweeps past its expiry, and
// the map stays bounded by the number of distinct keys seen in that time. An
// individual expired entry is not left to rot either — the per-key check below
// resets a stale window whether or not the sweep has run.
func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()

	if now.Sub(rl.lastSweep) >= rl.perWind {
		for k, w := range rl.hits {
			if now.After(w.reset) {
				delete(rl.hits, k)
			}
		}
		rl.lastSweep = now
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
				copyFor(r).Common.TooManyAttempts)
			return
		}
		next.ServeHTTP(w, r)
	})
}
