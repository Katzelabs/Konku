import { expect, it } from 'vitest'
import { clearAccountStorage, shortHash } from './storage'

/*
 * What signing out takes with it.
 *
 * The bug was silent by construction: the next account's browser simply had
 * the previous one's timer, view modes and resend cooldown in it, and nothing
 * on screen said so (F-10).
 */

it('removes what the account left behind', () => {
  localStorage.setItem('konku.timer', '{"running":true}')
  localStorage.setItem('konku:notes-view', 'grid')
  localStorage.setItem('konku:resend-until:abc', '123')
  localStorage.setItem('konku.sidebar', 'collapsed')

  clearAccountStorage()

  expect(localStorage.getItem('konku.timer')).toBeNull()
  expect(localStorage.getItem('konku:notes-view')).toBeNull()
  expect(localStorage.getItem('konku:resend-until:abc')).toBeNull()
  expect(localStorage.getItem('konku.sidebar')).toBeNull()
})

it('keeps the theme, which belongs to the device', () => {
  localStorage.setItem('konku.theme', 'dark')

  clearAccountStorage()

  // Clearing it would repaint the login screen white on a device somebody
  // deliberately set to dark, in the name of privacy it does not provide.
  expect(localStorage.getItem('konku.theme')).toBe('dark')
})

it('leaves storage that is not ours alone', () => {
  localStorage.setItem('some-other-app', 'x')

  clearAccountStorage()

  expect(localStorage.getItem('some-other-app')).toBe('x')
})

it('sweeps every key, not every other one', () => {
  // Removing while iterating by index reindexes the store underneath the
  // loop. Four keys is enough for that mistake to leave two behind.
  for (const key of ['konku.a', 'konku.b', 'konku.c', 'konku.d']) {
    localStorage.setItem(key, '1')
  }

  clearAccountStorage()

  expect(localStorage.length).toBe(0)
})

it('hashes an address to something stable that does not contain it', () => {
  const address = 'sena@example.com'

  expect(shortHash(address)).toBe(shortHash(address))
  expect(shortHash(address)).not.toContain('sena')
  expect(shortHash(address)).not.toBe(shortHash('rani@example.com'))
})
