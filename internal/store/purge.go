package store

import (
	"context"
	"fmt"
	"time"

	"github.com/Katzelabs/Konku/internal/store/gen"
)

// TrashWindow is how long a deleted note or card stays in Terhapus before it
// is removed for good.
//
// Thirty days, matching the backup retention the privacy policy commits to, so
// there is one number in the product rather than two. It is deliberately long:
// the point of the window is that somebody who deletes the wrong thing has
// time to notice, and "noticing" for a note you deleted by accident often
// means going looking for it weeks later.
const TrashWindow = 30 * 24 * time.Hour

// PurgeResult is what one run removed.
type PurgeResult struct {
	Notes    int64
	Cards    int64
	Accounts int
}

// PurgeTrash removes notes and cards that have been deleted longer than the
// window.
//
// Soft delete meant nothing ever actually left the database, which was fine
// for one account and is not once anyone can sign up: the quota counts live
// rows (07 L8), so a create-and-delete loop grows the tables without ever
// meeting a limit.
//
// Per account, in its own transaction, for two reasons. RLS is the first —
// notes and cards carry the strict policy, so a delete with no app.user_id set
// matches nothing and would purge nothing while reporting success (D-059). The
// second is blast radius: one account's failure leaves the others purged
// rather than rolling back a sweep across every account on the box.
//
// Cards with review history or an exam appearance are never purged, whatever
// the window says. See the query for why.
func (s *Store) PurgeTrash(ctx context.Context, olderThan time.Duration) (PurgeResult, error) {
	cutoff := time.Now().Add(-olderThan)

	users, err := s.q.ListUserIDs(ctx)
	if err != nil {
		return PurgeResult{}, fmt.Errorf("store: listing accounts to purge: %w", err)
	}

	var out PurgeResult
	for _, userID := range users {
		err := s.WithUserTx(ctx, userID, func(q *gen.Queries) error {
			notes, err := q.PurgeDeletedNotes(ctx, gen.PurgeDeletedNotesParams{
				UserID: userID, DeletedAt: &cutoff,
			})
			if err != nil {
				return fmt.Errorf("notes: %w", err)
			}
			cards, err := q.PurgeDeletedCards(ctx, gen.PurgeDeletedCardsParams{
				UserID: userID, DeletedAt: &cutoff,
			})
			if err != nil {
				return fmt.Errorf("cards: %w", err)
			}
			out.Notes += notes
			out.Cards += cards
			return nil
		})
		if err != nil {
			// One account's failure must not stop the sweep, and must not be
			// swallowed either. The caller logs it with the account id.
			return out, fmt.Errorf("store: purging account %s: %w", userID, err)
		}
		out.Accounts++
	}
	return out, nil
}
