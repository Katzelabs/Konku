import type { User } from './useAuth'

/**
 * What to call someone on screen.
 *
 * Both name columns are `NOT NULL DEFAULT ''` (migration 00010), so "" is the
 * honest value for an account created by `konku seed-user` and for anyone who
 * signed up before the form asked. Every caller therefore needs a fallback,
 * and it must be the same one everywhere or the same person is greeted two
 * ways on two screens.
 *
 * The fallback is the address itself, not a name guessed from its local part.
 * Deciding that "hrofiyani" is somebody's first name and then greeting them by
 * it is worse than showing what they actually typed to sign in.
 */
export function displayName(user: Pick<User, 'email' | 'firstName' | 'lastName'>): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return full || user.email
}

/** Just the given name, for a greeting. Falls back the same way. */
export function greetingName(user: Pick<User, 'email' | 'firstName'>): string {
  return user.firstName.trim() || user.email
}

/**
 * Two letters for the avatar.
 *
 * From the name when there is one, from the address when there is not — which
 * is the same split as everywhere else, so an account with a name never shows
 * initials derived from its email.
 */
export function initialsFor(
  user: Pick<User, 'email' | 'firstName' | 'lastName'>,
): string {
  const parts = [user.firstName, user.lastName].map((p) => p.trim()).filter(Boolean)
  if (parts.length > 0) {
    return parts
      .slice(0, 2)
      .map((p) => [...p][0] ?? '')
      .join('')
      .toUpperCase()
  }

  // No name: fall back to the local part, split on the separators people
  // actually use in an address.
  const local = user.email.split('@')[0] ?? ''
  const fromEmail = local
    .split(/[._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return fromEmail || user.email.slice(0, 2).toUpperCase()
}
