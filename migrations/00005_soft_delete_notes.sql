-- +goose Up
-- +goose StatementBegin

-- ---------------------------------------------------------------------------
-- Notes become deletable, and deletable means recoverable.
--
-- Until now a note could be created and edited but never removed, and the only
-- DELETE in notes.sql was a hard one that nothing called. Shipping that hard
-- delete would have put a button in the UI that destroys writing permanently
-- on one click — in an app whose whole thesis is that nothing you learn
-- disappears silently.
--
-- So notes get the same soft delete cards have carried since 00001. The reason
-- differs: a card is soft-deleted because a finished exam attempt renders its
-- questions by joining `cards`, so a hard delete would blank out past results.
-- A note is pointed at by nothing but its own labels. Here the reason is
-- purely the user's: deletion on a CRUD screen should be undoable, and the
-- Terhapus view is what makes "undoable" survive a page navigation rather than
-- lasting only as long as a toast.
--
-- note_categories is deliberately left alone. Its FK is ON DELETE CASCADE, but
-- nothing is being deleted, so a restored note comes back still wearing its
-- labels.
-- ---------------------------------------------------------------------------
ALTER TABLE notes ADD COLUMN deleted_at timestamptz;

-- The live list is the query that runs constantly; the Terhapus view is rare
-- and small. So the index becomes partial, mirroring cards_user_idx, rather
-- than a second index sitting beside the full one covering the same column.
DROP INDEX notes_user_id_idx;
CREATE INDEX notes_user_id_idx ON notes (user_id) WHERE deleted_at IS NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Rows soft-deleted while this migration was applied come back as live notes
-- rather than vanishing: down-migrating is meant to undo a schema change, not
-- to destroy writing that the column was protecting.
DROP INDEX notes_user_id_idx;
CREATE INDEX notes_user_id_idx ON notes (user_id);

ALTER TABLE notes DROP COLUMN deleted_at;

-- +goose StatementEnd
