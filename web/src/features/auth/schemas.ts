import { z } from 'zod'

/**
 * What the signed-out forms accept.
 *
 * These are **not** a security boundary and must not be read as one. Every
 * rule here is enforced again in Go, by handlers that assume the request came
 * from a hostile client because it might have — `internal/api/signup.go`
 * parses the address, bounds the password, trims and length-checks the names,
 * and rejects control characters. Anyone can POST to `/api/auth/signup` with
 * curl and never load this file at all.
 *
 * What these buy is the other thing: an error next to the field, before a
 * round trip, in the same words the server would have used. A form that only
 * learns it is wrong from a 400 tells you one problem at a time and forgets
 * what you typed in the process.
 *
 * So the messages are duplicated between here and the handlers on purpose, and
 * they have to be kept saying the same thing. Where they differ, the server is
 * right — it is the one that decides.
 *
 * **What this costs, measured rather than assumed:** the classic chainable API
 * adds ~17 kB gzipped to the bundle (213.7 → 230.8). `zod/mini` would be ~4 kB
 * for the same rules, and was weighed and not taken: its `check(minLength(12))`
 * form is harder to read than `.min(12)`, and these five schemas are the file
 * anyone touching the auth copy will open. If the bundle ever becomes the
 * constraint, this is a mechanical swap in one file — which is exactly why the
 * schemas live here and not spread across the pages (D-070).
 */

/** Matches minPasswordLength in the API and in `konku seed-user`. */
export const MIN_PASSWORD = 12

/** Matches maxNameLength in the API and the CHECK in migration 00010. */
export const MAX_NAME = 80

/*
 * Deliberately not a stricter address pattern than zod's.
 *
 * The server parses with net/mail and then sends a message; the only real
 * proof an address works is that mail to it arrives, which is exactly what
 * verification is for. A regex that rejects a valid address is a person who
 * cannot sign up, and it fails closed in the direction that costs a user.
 */
const email = z
  .string()
  .trim()
  .min(1, 'Email wajib diisi.')
  .pipe(z.email('Format email belum benar. Contoh: nama@email.com'))

/*
 * Length only, and that is the whole rule (D-058's reasoning, restated).
 *
 * No "must contain a number and a symbol": complexity rules push people toward
 * Password1! and away from the long passphrase that is actually stronger. The
 * hint under the field says so rather than leaving it to be discovered by
 * being rejected.
 */
const password = z
  .string()
  .min(1, 'Kata sandi wajib diisi.')
  .min(MIN_PASSWORD, `Kata sandi minimal ${MIN_PASSWORD} karakter.`)

/*
 * A name is bounded and must not contain control characters. It is not
 * pattern-matched against letters.
 *
 * There is no character class that spans the names people actually have —
 * apostrophes, hyphens, spaces, non-Latin scripts, single-word names — and
 * every attempt at one rejects somebody real. The control-character rule is
 * the one with a security edge rather than a cosmetic one: a name is the
 * obvious thing to greet someone by in mail, and a CR or LF in a value that
 * reaches a header is header injection. The server rejects it too, which is
 * the mechanism that matters; this one just says so before the round trip.
 */
// Written as escapes rather than as literal characters: a literal NUL or DEL
// in a source file is invisible in every editor and survives exactly one
// careless copy-paste.
const CONTROL = /[\u0000-\u001f\u007f]/

const name = z
  .string()
  .trim()
  .max(MAX_NAME, `Maksimal ${MAX_NAME} karakter.`)
  .refine((v) => !CONTROL.test(v), 'Nama tidak boleh berisi karakter aneh.')

export const loginSchema = z.object({
  // Login checks only that something was typed. A stricter rule here would
  // reject an old account whose address predates whatever the rule became,
  // and the server answers "email atau kata sandi salah" either way.
  email: z.string().trim().min(1, 'Email wajib diisi.'),
  password: z.string().min(1, 'Kata sandi wajib diisi.'),
})

export const signupSchema = z
  .object({
    firstName: name.min(1, 'Nama depan wajib diisi.'),
    // Optional, and it stays optional. Plenty of people have one name, and a
    // form that refuses to accept that tells them they are wrong about their
    // own name.
    lastName: name,
    email,
    password,
    confirmPassword: z.string().min(1, 'Ulangi kata sandi kamu.'),
  })
  /*
   * The mismatch is reported on the confirm field, not on the form.
   *
   * `path` is what puts it there. Without it the message lands at the form
   * level, above a pair of fields that both look fine, and the reader has to
   * work out which of the two to change.
   */
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Kata sandinya belum sama.',
    path: ['confirmPassword'],
  })

export const forgotSchema = z.object({ email })

export const resetSchema = z
  .object({
    password,
    confirmPassword: z.string().min(1, 'Ulangi kata sandi kamu.'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Kata sandinya belum sama.',
    path: ['confirmPassword'],
  })

/*
 * The one schema here that is not a signed-out form.
 *
 * It lives with the others anyway, because it is the same rule about the same
 * field and splitting it out is how the password copy drifts into saying two
 * things. `resetSchema` is its shape minus the current password: reset proves
 * control of the mailbox, this proves control of the password.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi.'),
    password,
    confirmPassword: z.string().min(1, 'Ulangi kata sandi kamu.'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Kata sandinya belum sama.',
    path: ['confirmPassword'],
  })
  /*
   * Refused rather than accepted as a no-op, and reported on the new-password
   * field because that is the one to change.
   *
   * Someone doing this believes they have changed something. The usual reason
   * they are on this screen is that they think the old password is compromised,
   * so silently succeeding would leave them safer in their own estimation and
   * no safer in fact. The server refuses it too.
   */
  .refine((v) => v.password !== v.currentPassword, {
    message: 'Kata sandi baru masih sama dengan yang lama.',
    path: ['password'],
  })

export type LoginValues = z.infer<typeof loginSchema>
export type SignupValues = z.infer<typeof signupSchema>
export type ForgotValues = z.infer<typeof forgotSchema>
export type ResetValues = z.infer<typeof resetSchema>
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
