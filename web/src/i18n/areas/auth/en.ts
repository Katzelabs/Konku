import { pluralFor } from '../../plural'
import type { AuthCopy } from './types'

const n = pluralFor('en')

/**
 * English — translated from `id.ts`, same claims in the same order.
 *
 * These are the five screens a stranger meets before they have an account, and
 * the ones they land on when they cannot get in. That makes them the place
 * hard rule 6 is easiest to break in English: "don't forget to verify", "you
 * still haven't confirmed", "oops". None of that is in the Indonesian, so none
 * of it may appear here. `catalog.test.ts` fails on a list of those phrases and
 * on any exclamation mark, but a list only catches what is on it — the rule is
 * plain, direct, active voice, sentence case, and nothing that suggests the
 * reader is at fault for a mistyped password or an expired link.
 *
 * Spelling follows the settings area: British, "recognise".
 */
export const auth: AuthCopy = {
  legal: {
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
  },

  emailPlaceholder: 'name@email.com',

  password: {
    hint: (min) =>
      n(min, {
        one: 'At least # character. A long sentence is both safer and easier to remember.',
        other: 'At least # characters. A long sentence is both safer and easier to remember.',
      }),
    confirmPlaceholder: 'Type the password above again',
  },

  login: {
    subtitle: 'Sign in to continue.',
    email: 'Email',
    password: 'Password',
    submit: 'Sign in',
    // "Sebentar" is "a moment", not "loading". The button says what it is
    // doing to the reader, not what the machine is doing.
    submitting: 'One moment…',
    forgot: 'Forgotten your password?',
    noAccount: 'No account yet?',
    createAccount: 'Create account',
  },

  signup: {
    title: 'Create account',
    subtitle: 'Start keeping what you learn.',
    firstName: 'First name',
    // A short single given name, as "Sena" is in Indonesian. The example is
    // localised rather than carried over, because its whole job is to be
    // recognisable at a glance as one name rather than a full one.
    firstNamePlaceholder: 'Alex',
    lastName: 'Last name',
    lastNamePlaceholder: 'Optional',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Repeat password',
    submit: 'Create account',
    submitting: 'One moment…',
    haveAccount: 'Already have an account?',
    signIn: 'Sign in',
  },

  checkMail: {
    title: 'Check your email',
    subtitle: 'One step left.',
    sentTo: (email) =>
      `We have sent a verification link to *${email}*. Open it to activate your account.`,
    expiry: 'The link is valid for 24 hours. If it has not arrived, check your spam folder.',
    // Conditional, and it stays conditional: the endpoint answers the same 204
    // for an address with no account. This may not say a message went out.
    resent: 'A new link has been sent if the account is not verified yet.',
    resend: 'Send the link again',
    resending: 'Sending…',
    resendIn: (seconds) =>
      n(seconds, { one: 'Send again in # second', other: 'Send again in # seconds' }),
    resendWaitAnnounce: (seconds) =>
      n(seconds, {
        one: 'You can send again in # second.',
        other: 'You can send again in # seconds.',
      }),
    resendReadyAnnounce: 'You can send the link again now.',
    signOut: 'Sign out',
    backToLogin: 'Back to the sign-in page',
  },

  forgot: {
    title: 'Forgotten password',
    subtitle: 'We will send you a link to create a new password.',
    email: 'Email',
    emailHint: 'The address you used when you signed up.',
    submit: 'Send the link',
    submitting: 'Sending…',
    rememberedIt: 'Remembered your password?',
    signIn: 'Sign in',
    sent: {
      title: 'Check your email',
      body: (email) =>
        `If *${email}* is registered, we have sent a link there to reset the password.`,
      expiry: 'The link is valid for 1 hour. If it has not arrived, check your spam folder.',
      backToLogin: 'Back to the sign-in page',
    },
  },

  reset: {
    title: 'Create a new password',
    password: 'New password',
    confirmPassword: 'Repeat the new password',
    submit: 'Save password',
    submitting: 'Saving…',
    done: {
      title: 'Password updated',
      body: 'Your password has been changed. Every device that was signed in has been signed out, so sign in again with the new password.',
      signIn: 'Sign in',
    },
    failed: {
      title: 'The link is not valid',
      // "ya" softens the Indonesian and has no English equivalent that is not
      // filler. The sentence carries its own tone: it says what to do next.
      incompleteLink: 'This link is incomplete. Open the link from your email.',
      requestNew: 'Ask for a new link',
    },
  },

  verify: {
    loading: 'Loading…',
    pending: 'Verifying…',
    done: {
      title: 'Email verified',
      subtitle: 'Your account is active.',
      body: 'Thank you. You can sign in now and start writing.',
      signIn: 'Sign in',
    },
    failed: {
      title: 'The link is not valid',
      incompleteLink: 'This link is incomplete. Open the link from your email.',
      help: 'Sign in to your account to ask for a new link.',
      signIn: 'Go to the sign-in page',
    },
  },

  validation: {
    emailRequired: 'Email is required.',
    // "belum benar" is "not right yet" — a state, not a verdict on the reader.
    // English drops the "yet" because "is not right yet" reads as a promise
    // that it will become right on its own.
    emailFormat: 'The email format is not right. Example: name@email.com',
    passwordRequired: 'Password is required.',
    passwordMin: (min) =>
      n(min, {
        one: 'Password must be at least # character.',
        other: 'Password must be at least # characters.',
      }),
    nameMax: (max) =>
      n(max, { one: 'At most # character.', other: 'At most # characters.' }),
    nameControlChars: 'A name cannot contain unusual characters.',
    firstNameRequired: 'First name is required.',
    confirmRequired: 'Repeat your password.',
    confirmMismatch: 'The passwords do not match yet.',
    currentPasswordRequired: 'Your current password is required.',
    passwordUnchanged: 'The new password is still the same as the old one.',
  },
}
