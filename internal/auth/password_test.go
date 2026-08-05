package auth

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"testing"

	"golang.org/x/crypto/argon2"
)

func TestHashVerifyRoundTrip(t *testing.T) {
	for _, pw := range []string{
		"correct horse battery staple",
		"pässwörd-with-ünicode",
		"kata sandi yang panjang sekali",
		strings.Repeat("x", 200),
	} {
		encoded, err := Hash(pw)
		if err != nil {
			t.Fatalf("Hash(%q): %v", pw, err)
		}
		ok, err := Verify(encoded, pw)
		if err != nil {
			t.Fatalf("Verify: %v", err)
		}
		if !ok {
			t.Errorf("password %q did not verify against its own hash", pw)
		}
	}
}

// A per-password random salt means the same password never produces the same
// hash. Without it, identical passwords are visible as identical rows.
func TestHashIsSalted(t *testing.T) {
	a, err := Hash("same password")
	if err != nil {
		t.Fatal(err)
	}
	b, err := Hash("same password")
	if err != nil {
		t.Fatal(err)
	}
	if a == b {
		t.Fatal("two hashes of the same password are identical — salt is not random")
	}

	for _, h := range []string{a, b} {
		ok, err := Verify(h, "same password")
		if err != nil || !ok {
			t.Errorf("hash %q failed to verify: ok=%v err=%v", h, ok, err)
		}
	}
}

func TestVerifyRejectsWrongPassword(t *testing.T) {
	encoded, err := Hash("the real password")
	if err != nil {
		t.Fatal(err)
	}

	for _, wrong := range []string{"", "the real passwore", "The real password", "the real password "} {
		ok, err := Verify(encoded, wrong)
		if err != nil {
			t.Errorf("Verify(%q) errored: %v", wrong, err)
		}
		if ok {
			t.Errorf("wrong password %q verified", wrong)
		}
	}
}

func TestVerifyRejectsMalformedHash(t *testing.T) {
	tests := []struct {
		name    string
		encoded string
	}{
		{"empty", ""},
		{"not a hash", "hunter2"},
		{"wrong algorithm", "$argon2i$v=19$m=65536,t=3,p=2$c2FsdA$aGFzaA"},
		{"missing fields", "$argon2id$v=19$m=65536,t=3,p=2$c2FsdA"},
		{"bad params", "$argon2id$v=19$m=a,t=b,p=c$c2FsdA$aGFzaA"},
		{"zero params", "$argon2id$v=19$m=0,t=0,p=0$c2FsdA$aGFzaA"},
		{"bad base64 salt", "$argon2id$v=19$m=65536,t=3,p=2$!!!$aGFzaA"},
		{"bcrypt hash", "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ok, err := Verify(tt.encoded, "anything")
			if ok {
				t.Error("malformed hash verified successfully")
			}
			if err == nil {
				t.Error("expected an error for a malformed hash")
			}
		})
	}
}

// hashWith encodes a hash using explicit parameters, standing in for a hash
// written before a tuning change.
func hashWith(password string, salt []byte, memory, time uint32, threads uint8) string {
	sum := argon2.IDKey([]byte(password), salt, time, memory, threads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, memory, time, threads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(sum),
	)
}

// A hash written with weaker tuning must still verify, so raising the
// parameters later does not lock everyone out of their own account.
func TestVerifyUsesStoredParams(t *testing.T) {
	// Deliberately weaker than the current constants.
	encoded := hashWith("legacy password", []byte("0123456789abcdef"), 32768, 2, 1)

	if !strings.HasPrefix(encoded, "$argon2id$v=19$m=32768,t=2,p=1$") {
		t.Fatalf("test setup produced unexpected encoding: %q", encoded)
	}

	ok, err := Verify(encoded, "legacy password")
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !ok {
		t.Error("a hash written with older parameters failed to verify")
	}

	// And it still rejects the wrong password under those parameters.
	if ok, _ := Verify(encoded, "wrong"); ok {
		t.Error("wrong password verified against a legacy-parameter hash")
	}
}

func TestIncompatibleVersionIsReported(t *testing.T) {
	_, err := Verify("$argon2id$v=16$m=65536,t=3,p=2$c2FsdA$aGFzaA", "x")
	if !errors.Is(err, ErrIncompatibleParams) {
		t.Errorf("got %v, want ErrIncompatibleParams", err)
	}
}
