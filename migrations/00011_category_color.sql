-- A colour on a category.
--
-- This reverses a stated design decision, so it is worth writing down why
-- rather than letting the column appear unexplained. D-054 gave categories no
-- colour on purpose: domain colour was to be the one colour signal in a row,
-- and a second palette next to it turns a list into confetti. That reasoning
-- was about *list rows*, and it still holds there.
--
-- What it did not survive is management. Domains got a settings screen where
-- they are named, coloured, given a quota and archived; categories got a
-- create-on-type box and nothing else, so a vocabulary that grows by accident
-- had no screen where it could be tidied. Giving them the same shape as
-- domains — including a colour — is what makes one screen able to manage both
-- without one of them being the poor relation.
--
-- The confetti risk is answered in the UI, not here: a category wears its
-- colour as a dot, the same 10px mark a domain wears, rather than as a tinted
-- chip fill. See CategoryChip.

-- +goose Up
-- +goose StatementBegin

-- NOT NULL DEFAULT, matching 00010's reasoning about first_name: the
-- distinction a nullable column would carry is "never picked" vs "picked
-- nothing", and no screen would do anything different with the two. Every
-- category that exists today was created by typing a label at the picker and
-- has no colour to carry across, so they all backfill to the same neutral.
--
-- #5C6B73 is the slate entry in the starting palette the domain editor
-- offers. It is the least assertive of the six, which is the right default for
-- a label the user never chose a colour for — the row should look like it did
-- yesterday until someone decides otherwise.
ALTER TABLE categories ADD COLUMN color text NOT NULL DEFAULT '#5C6B73';

-- Two mechanisms, or it is a hope (hard rule 9). The handler's check is what
-- produces the readable Indonesian error; this one is what holds if a future
-- call site forgets to validate, and it is what stops a malformed value
-- reaching an inline `style` attribute in the browser.
--
-- domains.color has no equivalent constraint. That is a gap in 00001, not a
-- precedent to copy: the same rule applies to it and closing it is its own
-- migration, since it has to cope with whatever eight-year-old rows contain.
ALTER TABLE categories ADD CONSTRAINT categories_color_hex
    CHECK (color ~ '^#[0-9a-fA-F]{6}$');

-- No index, and no RLS change. Colour is displayed, never filtered or sorted
-- by, and 00006 already policies `categories` — this is a column on a table
-- that is already protected, not a new table needing a grant.

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_color_hex;
ALTER TABLE categories DROP COLUMN color;

-- +goose StatementEnd
