package api

import (
	"testing"
	"time"
)

// The limiter had no tests at all, which is how it came to sweep its entire map
// under a global lock on every single request without anyone noticing. These
// assert the two things it has to do — refuse past the limit, and not grow
// without bound — so a future change to one cannot silently break the other.

func TestRateLimiterRefusesPastTheLimit(t *testing.T) {
	rl := newRateLimiter(3, time.Minute)

	for i := range 3 {
		if !rl.allow("192.0.2.1") {
			t.Fatalf("attempt %d refused, want allowed", i+1)
		}
	}
	if rl.allow("192.0.2.1") {
		t.Error("attempt 4 allowed, want refused")
	}

	// A different key has its own budget, or one noisy address would lock
	// everybody out — which is the failure a shared limiter makes easy.
	if !rl.allow("192.0.2.2") {
		t.Error("a second key was refused on its first attempt")
	}
}

func TestRateLimiterWindowExpires(t *testing.T) {
	const window = 30 * time.Millisecond
	rl := newRateLimiter(1, window)

	if !rl.allow("192.0.2.1") {
		t.Fatal("first attempt refused")
	}
	if rl.allow("192.0.2.1") {
		t.Fatal("second attempt inside the window allowed")
	}

	time.Sleep(window * 2)

	if !rl.allow("192.0.2.1") {
		t.Error("still refused after the window elapsed — the limit is permanent, not a rate")
	}
}

// The sweep is what keeps the map from growing without bound off spoofed source
// addresses. It runs once per window now rather than on every call, so this
// asserts it still actually happens.
func TestRateLimiterSweepsExpiredWindows(t *testing.T) {
	const window = 30 * time.Millisecond
	rl := newRateLimiter(1, window)

	for _, key := range []string{"a", "b", "c", "d", "e"} {
		rl.allow(key)
	}
	if got := len(rl.hits); got != 5 {
		t.Fatalf("%d keys tracked, want 5", got)
	}

	// Past the window, so every entry above is expired and the next call is
	// also past lastSweep.
	time.Sleep(window * 2)
	rl.allow("f")

	// Only the key just used should remain. A map that still holds the first
	// five means the sweep is not running at all.
	if got := len(rl.hits); got != 1 {
		t.Errorf("%d keys tracked after the sweep, want 1", got)
	}
}

// The whole point of moving the sweep off the hot path: it must not run on
// every call, or the O(n) scan under the mutex is still there.
func TestRateLimiterDoesNotSweepEveryCall(t *testing.T) {
	rl := newRateLimiter(100, time.Minute)

	rl.allow("first")
	first := rl.lastSweep

	// Same window, so no further sweep is due.
	for range 50 {
		rl.allow("second")
	}

	if !rl.lastSweep.Equal(first) {
		t.Error("the map was swept again inside one window — the sweep is still on the hot path")
	}
}
