-- Purging what Terhapus is holding.
--
-- Soft delete means nothing ever left the database. That was fine for one
-- account and is not fine once anyone can sign up: the quota in 07 L8 counts
-- *live* rows, so a create-and-delete loop grows the tables without ever
-- meeting a limit. The write rate limiter bounds how fast; nothing bounded the
-- total.
--
-- The window is generous and, more importantly, **stated in the UI**. A trash
-- that empties itself is ordinary; a trash that empties itself without saying
-- so would be the silent disappearance this whole product exists to prevent.

-- name: ListUserIDs :many
-- The purge runs per account rather than as one global DELETE.
--
-- Not a stylistic choice: notes and cards carry the strict RLS policy, so a
-- delete on the pool with no app.user_id set matches no rows at all and would
-- purge nothing while reporting success (D-059). Each account gets its own
-- scoped transaction.
SELECT id FROM users ORDER BY created_at;

-- name: PurgeDeletedNotes :execrows
-- Notes are referenced only by note_categories, which cascades, so a note that
-- has been in Terhapus past the window can go.
DELETE FROM notes
WHERE user_id = $1
  AND deleted_at IS NOT NULL
  AND deleted_at < $2;

-- name: PurgeDeletedCards :execrows
-- A card only goes if it carries no learning history.
--
-- The two NOT EXISTS clauses are the whole design. review_logs and
-- exam_attempt_cards deliberately have no foreign key to cards (D-050), so
-- deleting a card cannot erase the evidence that it was studied — but that
-- also means a purge would leave those rows pointing at nothing, and a
-- finished exam attempt would render a question with no text.
--
-- So a card that was ever reviewed, or ever sat in an exam attempt, is kept
-- indefinitely even after the window. That is not a hedge: the history is the
-- part of a card that matters, and this app's thesis is that it does not
-- vanish. What the purge is actually for is the other kind of card — created,
-- never studied, deleted — which is exactly the churn an abusive script
-- produces and exactly the card nobody will miss.
DELETE FROM cards c
WHERE c.user_id = $1
  AND c.deleted_at IS NOT NULL
  AND c.deleted_at < $2
  AND NOT EXISTS (
        SELECT 1 FROM review_logs rl
        WHERE rl.user_id = c.user_id AND rl.card_id = c.id)
  AND NOT EXISTS (
        SELECT 1 FROM exam_attempt_cards ac
        WHERE ac.user_id = c.user_id AND ac.card_id = c.id);
