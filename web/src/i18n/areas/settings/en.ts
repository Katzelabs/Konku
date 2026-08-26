import { pluralFor } from '../../plural'
import type { SettingsCopy } from './types'

const n = pluralFor('en')

/** English — translated from `id.ts`, same claims in the same order. */
export const settings: SettingsCopy = {
  language: {
    title: 'Language',
    description: 'Stored on your account, so it follows you to other devices.',
    auto: 'Follow the browser',
  },

  sessions: {
    title: 'Signed-in devices',
    description: 'Where this account is in use. End any you do not recognise.',
    currentDevice: '(this device)',
    unknownDevice: 'Unknown device',
    unknownAddress: 'address unknown',
    clientOn: (browser, platform) => `${browser} on ${platform}`,
    lastActive: (relative) => `active ${relative}`,
    signOutCurrent: 'Sign out',
    // "End", not "Revoke": the Indonesian is the ordinary word for finishing
    // something, and revoke is the language of a security incident.
    endSession: 'End',
    signOutOthers: {
      title: 'Sign out of other devices',
      description: 'This device stays signed in.',
      // Indonesian distinguishes Keluar (leave) from Keluarkan (put out).
      // English has no one-word pair, so the object carries it.
      action: 'Sign them out',
    },
    ago: {
      justNow: 'just now',
      minutes: (count) => n(count, { one: '# minute ago', other: '# minutes ago' }),
      hours: (count) => n(count, { one: '# hour ago', other: '# hours ago' }),
      yesterday: 'yesterday',
      // `one` is unreachable — the caller answers "yesterday" at one day —
      // but a plural form that exists only in the cases the current caller
      // happens to produce is a bug waiting for the next caller.
      days: (count) => n(count, { one: '# day ago', other: '# days ago' }),
      overAMonth: 'over a month ago',
    },
  },
}
