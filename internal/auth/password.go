// Package auth handles password hashing and session lifecycle.
//
// HTTP concerns — cookies, middleware, handlers — live in internal/api. This
// package knows nothing about requests.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"runtime"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Tuning. These are encoded into every hash, so raising them later does not
// invalidate existing passwords — old hashes keep verifying with their own
// stored parameters, and can be re-hashed on next successful login.
const (
	argonTime    uint32 = 3
	argonMemory  uint32 = 64 * 1024 // 64 MiB
	argonKeyLen  uint32 = 32
	argonSaltLen        = 16
)

var (
	ErrInvalidHash        = errors.New("auth: malformed password hash")
	ErrIncompatibleParams = errors.New("auth: incompatible argon2 version")
)

// hashSlots bounds how many argon2 computations run at once.
//
// The parameters above are correct per hash and say nothing about how many
// hashes there are. Every limiter in front of a hashing endpoint is per-IP or
// per-address, so 100 source addresses buy 100 concurrent verifications —
// 6.4 GB resident — and /auth/signup, /auth/reset and DELETE /account each
// carry their own budget, so the budgets add rather than sharing a ceiling.
// On a shared VPS that is an OOM for every co-tenant project, the same
// reasoning that caps the pgx pool at 10 (D-028).
//
// Four slots is 256 MiB of peak hashing against the container's mem_limit of
// 512m, so the bound is stated twice and neither statement is the only one
// (hard rule 9).
//
// Acquisition blocks rather than taking a context, and that is deliberate.
// Requests queue behind chi's 30s Timeout middleware instead of the box
// swapping, and a queued goroutine costs ~8 KiB — the bound that matters is
// memory, not goroutines. Threading a context through Hash and Verify would
// change every call site to solve a problem this does not have.
var hashSlots = make(chan struct{}, maxConcurrentHashes)

const maxConcurrentHashes = 4

func acquireHashSlot() { hashSlots <- struct{}{} }
func releaseHashSlot() { <-hashSlots }

// argonThreads is capped at 4: more parallelism costs memory per login
// without meaningfully raising the bar for an attacker with a GPU.
func argonThreads() uint8 {
	n := runtime.NumCPU()
	if n > 4 {
		n = 4
	}
	if n < 1 {
		n = 1
	}
	return uint8(n)
}

// Hash returns a PHC-encoded argon2id hash with a fresh random salt.
//
// Format: $argon2id$v=19$m=65536,t=3,p=2$<salt>$<hash>
func Hash(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("auth: generating salt: %w", err)
	}

	threads := argonThreads()

	acquireHashSlot()
	sum := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, threads, argonKeyLen)
	releaseHashSlot()

	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, threads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(sum),
	), nil
}

// Verify reports whether password matches the encoded hash.
//
// Comparison is constant-time: a byte-wise early return would leak how much of
// the hash matched, which is enough to reconstruct it one byte at a time.
func Verify(encoded, password string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" {
		return false, ErrInvalidHash
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false, ErrInvalidHash
	}
	if version != argon2.Version {
		return false, ErrIncompatibleParams
	}

	var memory, time uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads); err != nil {
		return false, ErrInvalidHash
	}
	if memory == 0 || time == 0 || threads == 0 {
		return false, ErrInvalidHash
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, ErrInvalidHash
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, ErrInvalidHash
	}

	// Use the stored parameters, not the current constants, so hashes written
	// before a tuning change still verify.
	//
	// Bounded like Hash is, and for a stronger reason: the parameters here come
	// off the stored hash rather than from the constants above, so a row written
	// under a future tuning could cost more memory than argonMemory says.
	acquireHashSlot()
	got := argon2.IDKey([]byte(password), salt, time, memory, threads, uint32(len(want)))
	releaseHashSlot()

	return subtle.ConstantTimeCompare(got, want) == 1, nil
}
