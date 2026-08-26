import { pluralFor } from '../../plural'
import type { SettingsCopy } from './types'

const n = pluralFor('en')

/** English — translated from `id.ts`, same claims in the same order. */
export const settings: SettingsCopy = {
  shell: {
    title: 'Settings',
    description: 'Your account, labels, appearance and data.',
    navLabel: 'Settings sections',
  },

  nav: {
    groups: {
      account: 'Account',
      labels: 'Labels',
      app: 'App',
    },
    profile: 'Profile',
    // Indonesian nouns do not mark number, so "Perangkat", "Domain" and
    // "Kategori" are each one word covering a screen that lists many. English
    // has to choose, and a nav entry that opens a list is plural here — the
    // same call the primary nav's own entries make.
    devices: 'Devices',
    domains: 'Domains',
    categories: 'Categories',
    preferences: 'Preferences',
    appearance: 'Appearance',
    data: 'Data & privacy',
    about: 'About',
  },

  field: {
    empty: 'Not set',
  },

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

  cancel: 'Cancel',

  account: {
    title: 'Profile',
    description: 'This account and its password. Your name and email cannot be changed here yet.',
    emailVerified: 'Email verified',
    // "not verified yet", not "unverified" or "pending": the Indonesian
    // "belum" is the ordinary word for something that has not happened so far,
    // and it carries no suggestion that anybody is late (hard rule 6).
    emailUnverified: 'Email not verified yet',
    nameLabel: 'Name',
    emailLabel: 'Email',
    signOut: {
      title: 'Sign out of this device',
      description:
        'This device’s session ends. Other devices stay signed in, and you can sign in again whenever you like.',
      action: 'Sign out',
    },
  },

  password: {
    title: 'Change password',
    rowDescription: 'Other signed-in devices are signed out. This device stays signed in.',
    action: 'Change',
    dialogDescription:
      'Enter your current password, then the new one. Once it is changed, other signed-in devices are signed out.',
    currentLabel: 'Current password',
    newLabel: 'New password',
    newHint: (min) =>
      `${n(min, { one: 'At least # character.', other: 'At least # characters.' })} A long sentence is both safer and easier to remember.`,
    confirmLabel: 'Repeat the new password',
    confirmPlaceholder: 'Type the password above again',
    saving: 'Saving…',
    save: 'Save password',
  },

  appearance: {
    title: 'Appearance',
    description: 'Stored on this device, not on your account. Other devices do not change with it.',
    themeLabel: 'Theme',
    themes: {
      light: 'Light',
      dark: 'Dark',
      system: 'Follow the system',
    },
  },

  preferences: {
    title: 'Preferences',
    description:
      'Stored on your account, so it follows you to other devices. The theme is set separately under Appearance, because that one belongs to this device.',
    focusDuration: {
      title: 'Default focus length',
      description:
        'The timer opens at this length. You can still change it before starting a session.',
      minutes: (count) => n(count, { one: '# minute', other: '# minutes' }),
    },
    loading: 'Loading preferences…',
    // The Indonesian ends in a softening particle English has no word for. A
    // plain sentence carries the same absence of blame, which is the part that
    // matters: a failed request is not the reader's doing.
    loadError: 'Settings could not be loaded. Try reloading this page.',
  },

  about: {
    title: 'About',
    description: 'What Konku stores, and the documents that say so.',
    stores:
      'Konku stores what you write and your email address. It is not sold, not used for advertising, and not used to train AI models.',
    notAggregated:
      'Your learning history is never combined with anyone else’s — every number in this app is worked out for your account alone.',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
  },

  export: {
    title: 'Download your data',
    description: 'Everything stored on this account, in one archive.',
    formats:
      'Notes and cards as plain markdown files, the rest as JSON — review schedules, review history, focus sessions, domains, categories and practice sets are all in there.',
    portable:
      'It opens in Obsidian or any text editor. Nothing is locked into a special format.',
    row: {
      title: 'Download the archive',
      description: 'Passwords and signed-in sessions are not included.',
    },
    action: 'Download',
  },

  delete: {
    title: 'Delete account',
    description: 'If you want to stop. Download your data first if you want it.',
    action: 'Delete account',
    rowTitle: 'Delete this account permanently',
    // "cannot be brought back" for "tidak bisa dikembalikan", and nothing
    // softer. There is no thirty-day window on this screen — D-069's window is
    // notes and cards — so no word here may leave room for one.
    rowDescription:
      'Every note, card and review record goes with it. It cannot be brought back.',
    dialogDescription:
      'Your notes, cards, review schedules, review history, focus sessions and practice sets will be permanently deleted. This cannot be undone.',
    exportPrompt: 'Would you like to keep a copy first?',
    passwordLabel: 'Enter your password to confirm',
    deleting: 'Deleting…',
    confirm: 'Delete my account',
  },
}
