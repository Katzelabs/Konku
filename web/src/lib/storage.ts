/**
 * The localStorage this app writes, and how it ends.
 *
 * Signing out used to clear the query cache and nothing else, so the theme,
 * the sidebar, both view-mode preferences, the resend cooldown and the running
 * timer's whole state carried into the next account on a shared browser
 * (F-10). `konku.timer` is the one with actual content in it, and the cooldown
 * key had an email address in its name.
 *
 * An allowlist rather than a list of things to remove, deliberately: a key
 * added next year is swept by default and has to argue its way onto the keep
 * list, instead of leaking by default because nobody remembered this file.
 */
const PREFIXES = ['konku.', 'konku:']

/**
 * Kept across a sign-out. The theme is a property of the screen you are
 * looking at, not of the account looking at it — clearing it would repaint the
 * login page white on a device someone deliberately set to dark.
 */
const KEEP = new Set(['konku.theme'])

/** Remove everything this app stored for the account that is leaving. */
export function clearAccountStorage() {
  try {
    // Snapshot first: removing while iterating by index reindexes the store
    // under the loop and silently skips every other key.
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key !== null) keys.push(key)
    }

    for (const key of keys) {
      if (KEEP.has(key)) continue
      if (PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key)
    }
  } catch {
    // Private mode or storage disabled. There was nothing to clear.
  }
}

/**
 * A short, stable, non-reversible-in-practice stand-in for a string that
 * should not be readable in a storage key.
 *
 * FNV-1a, not a cryptographic hash, and the difference matters enough to say:
 * this is not protecting a secret from an attacker who has the device — it
 * stops an address being *displayed* in devtools, in a key that outlives the
 * session and even the account. Hard rule 10 keeps addresses out of logs for
 * the same reason. A real digest would need SubtleCrypto, which is async, and
 * an async hash cannot produce the key that the first synchronous read needs.
 */
export function shortHash(value: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    // The FNV prime, as shifts: `h * 16777619` overflows into a float and
    // stops being the same function.
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0
  }
  return h.toString(36)
}
