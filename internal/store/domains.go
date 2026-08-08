package store

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/Katzelabs/Konku/internal/store/gen"
)

// DefaultDomain is one entry in the starter set every new account gets.
//
// These used to be rows in the first migration, seeded once and shared by
// everyone. Domains became per-user in D-046, so they cannot live in a
// migration any more — a domain row has no meaning without an owner.
type DefaultDomain struct {
	Slug        string
	Label       string
	Color       string
	WeeklyQuota int32
}

// DefaultDomains is the starter set, in the priority order from GOALS.md.
//
// Coding sits last on quota 0: a valid tag that accumulates Go and Postgres
// cards while this gets built, but outside the weekly rota, because it is
// already the day job and would crowd out the four domains actually being
// grown (D-034).
var DefaultDomains = []DefaultDomain{
	{"general", "Pengetahuan Umum", "#4F7CAC", 3},
	{"math", "Matematika", "#6A8D73", 2},
	{"psychology", "Psikologi", "#B08968", 1},
	{"music", "Musik", "#8E7DBE", 1},
	{"coding", "Coding", "#5C6B73", 0},
}

// SeedDefaultDomains gives a new account its starter domains.
//
// It takes a *gen.Queries rather than reaching for the pool so the caller can
// run it inside the same transaction as the user insert. An account that
// exists with no domains would have a note editor whose domain picker is
// empty, and nothing would ever repair it.
func SeedDefaultDomains(ctx context.Context, q *gen.Queries, userID uuid.UUID) error {
	for i, d := range DefaultDomains {
		if _, err := q.CreateDomain(ctx, gen.CreateDomainParams{
			UserID:      userID,
			Slug:        d.Slug,
			Label:       d.Label,
			Color:       d.Color,
			WeeklyQuota: d.WeeklyQuota,
			SortOrder:   int32(i + 1),
		}); err != nil {
			return fmt.Errorf("store: seeding domain %q: %w", d.Slug, err)
		}
	}
	return nil
}
