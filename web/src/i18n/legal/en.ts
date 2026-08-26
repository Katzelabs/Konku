import { CONTACT_EMAIL, SELF_HOSTING_URL, type LegalCopy } from './types'

/**
 * English — translated from `id.ts`, which is the original.
 *
 * The same claims, in the same order. Nothing added because an English sentence
 * wanted one more point, nothing dropped because it read awkwardly. Everywhere
 * else in this catalog that rule is about the two languages saying the same
 * thing; here it is stronger than that, because a claim that exists in one
 * language and not the other is *two policies*, and whoever read the shorter
 * one was never told what the other one said.
 *
 * If a line genuinely cannot be said this way in English, change the Indonesian
 * first and translate the new version.
 *
 * ## Two words chosen deliberately
 *
 * **Deleted, not Trash**, for *Terhapus* — the decision recorded in `en.ts` and
 * originally made against this document. Terhapus literally means deleted, this
 * page bolds it as the *recoverable* state and reserves "permanently deleted"
 * for the other one, and "Trash" would import a discarded-and-gone metaphor the
 * Indonesian never had. D-069 is thirty days and recoverable, which is the
 * opposite claim.
 *
 * **Suspended, not banned or disabled.** The Indonesian is *ditangguhkan*, the
 * ordinary word for putting something on hold, and the mechanism is reversible
 * by construction (migration 00013 is deliberately not the `deleted_at` that
 * 00009 removed). "Banned" is a verdict and "disabled" sounds like a fault;
 * both would describe a different thing from what the code does.
 *
 * ## Never punitive still applies (hard rule 6)
 *
 * Terms pages are where products go to sound threatening, and English has far
 * more ways to do it than Indonesian. State the fact, then what happens. No
 * warnings, no capitals, no exclamation marks.
 */
export const en: LegalCopy = {
  frame: {
    back: 'Back',
    updatedPrefix: (date) => `Last updated: ${date}`,
    contact: 'Anything unclear? Write to',
  },

  privacy: {
    title: 'Privacy Policy',
    updated: '26 August 2026',

    intro: [
      {
        kind: 'p',
        text:
          '*In short:* Konku stores what you write, your name, and your email ' +
          'address. It is not sold, not used for advertising, and not used to train ' +
          'any AI model. There are no third-party trackers in this app.',
      },
    ],

    sections: {
      stored: {
        heading: 'What is stored',
        blocks: [
          {
            kind: 'ul',
            items: [
              '*Email address.* To sign in, to verify the account, and to send ' +
                'password reset links.',
              '*Name.* Your first name, and your last name if you fill it in. Used to ' +
                'address you inside the app — not sent to anyone, and not visible to ' +
                'other users, because no page in Konku shows anybody else’s account.',
              '*Password.* Stored as an argon2id hash, not as text. It cannot be read ' +
                'back — by us either.',
              '*Account dates.* When the account was created, and when its email ' +
                'address was verified.',
              '*Account status.* If we have ever suspended this account, that column ' +
                'holds since when. See “If an account is suspended” below.',
              '*Notes.* The title, the body, the domain you chose, the categories you ' +
                'attached, and when it was created and last changed.',
              '*Cards.* The front and the back, plus the same domain and categories as ' +
                'notes.',
              '*Categories and domains.* Their names, their colours, their order, each ' +
                'domain’s weekly quota, and the ones you have archived.',
              '*Each card’s schedule.* Its stage, when it is next due, how many times ' +
                'you have forgotten it, and the card’s state.',
              '*Review history.* Every time you review a card: how you rated it, the ' +
                'interval before and after, the time, whether it came from the daily ' +
                'queue or from a practice set, and whether it was free recall or ' +
                'multiple choice.',
              '*Focus sessions.* How many minutes, the date, when it finished, and the ' +
                'domain you worked on.',
              '*Practice sets.* The title, the description, how the cards are chosen, ' +
                'the number of questions, the time limit, the format, and the ones you ' +
                'have archived.',
              '*The result of each sitting.* When it started, when it finished, the ' +
                'date, the number of questions, and how many were right. For a ' +
                'multiple-choice set the options that appeared on screen are stored ' +
                'too — without them an old result can no longer be read back as the ' +
                'question you actually answered.',
              '*Signed-in sessions.* When you signed in, when the session was last ' +
                'active, when it expires, the IP address, and which browser. This is ' +
                'what makes the “Signed-in devices” page possible, so you can end a ' +
                'session you do not recognise.',
              '*Verification and reset links.* The link itself is not stored — what is ' +
                'stored is a hash of it, usable once, and dead after it is used or ' +
                'after it runs out of time.',
              '*Account settings.* The default timer duration, the focus step, ' +
                'whether domain rotation is on, and the language you chose.',
            ],
          },
        ],
      },

      notStored: {
        heading: 'What is not stored',
        blocks: [
          {
            kind: 'ul',
            items: [
              'No analytics, no advertising cookies, no third-party trackers.',
              'No location data.',
              'Request bodies, tokens, password hashes and email addresses never reach ' +
                'the server log. The log holds an account id and a request id.',
              'No aggregate statistics across accounts. Every number in this app is ' +
                'computed per account, for that account. The server does count ' +
                'operational things — requests per route, how many failed — but those ' +
                'numbers carry no account identity at all, so they cannot be broken ' +
                'down per person.',
            ],
          },
        ],
      },

      processors: {
        heading: 'Who else receives anything',
        blocks: [
          {
            kind: 'p',
            text:
              'Your data is not shared with anyone for their own purposes. Four ' +
              'parties receive some of it so that the service can run:',
          },
          {
            kind: 'ul',
            items: [
              '*Resend* — sends the mail. Receives your email address and the contents ' +
                'of a verification or password reset message. It does not receive your ' +
                'notes.',
              '*Sentry* — error reports. Receives the error message and an account id, ' +
                'and nothing else. The request body, the email address and the IP ' +
                'address are dropped before anything is sent.',
              '*The server provider* — where the database runs, as it does for every ' +
                'service that runs somewhere.',
              '*Cloudflare R2* — where the off-box copy of the backups is kept. Those ' +
                'are database dumps, so everything in the list above is in them.',
            ],
          },
        ],
      },

      browser: {
        heading: 'Cookies and browser storage',
        blocks: [
          {
            kind: 'p',
            text:
              'One cookie, and it does one thing: mark that you are signed in. It is ' +
              'locked to a single site address, cannot be read by JavaScript, and is ' +
              'not sent to other sites. There are no advertising cookies and no ' +
              'third-party cookies, which is why there is no cookie consent banner ' +
              'here — there is nothing for you to consent to.',
          },
          {
            kind: 'p',
            text:
              'The app also keeps a few things in your own browser rather than on the ' +
              'server: light or dark theme, the language to paint the page in, the ' +
              'state of a running timer, how the note and card lists are displayed, ' +
              'and the wait on the “resend” button. All of it goes when you sign out, ' +
              'except the theme and the language. The theme really does live only on ' +
              'this screen. The language is different: what the browser keeps is only ' +
              'a note so the page can paint in the right language straight away — the ' +
              'actual choice is on your account and follows you to other devices.',
          },
        ],
      },

      retention: {
        heading: 'How long it is kept',
        blocks: [
          {
            kind: 'ul',
            items: [
              'For as long as your account exists.',
              'Notes and cards you delete move to *Deleted* and can be restored for ' +
                '*30 days*. After that they are permanently deleted. A card you have ' +
                'reviewed, or that came up in a practice sitting you actually ran, is ' +
                'exempt — it is kept so that your review history does not point at ' +
                'something that is no longer there.',
              'If you *delete your account*, every row it owns goes at that moment — ' +
                'not marked as deleted, actually deleted. The email address can be ' +
                'used to sign up again afterwards.',
              'There is a daily backup on the server, and a copy of it is sent to ' +
                'storage off the server (Cloudflare R2). It travels over an encrypted ' +
                'connection and the copy in R2 is encrypted where it is stored, but the ' +
                'backup file itself is *not encrypted by us* — what protects it is ' +
                'that access to the server and to that storage is restricted. Backups ' +
                'are kept for at most *30 days*, so at most 30 days after you delete ' +
                'your account the data is gone from the backups too.',
              'Signed-in sessions expire after 30 days. A verification link is valid ' +
                'for 24 hours, a password reset link for 1 hour.',
            ],
          },
        ],
      },

      suspension: {
        heading: 'If an account is suspended',
        blocks: [
          {
            kind: 'p',
            text:
              'We can suspend an account that is clearly being used to abuse this ' +
              'service — pointing the verification mailer at somebody else, for ' +
              'instance. The grounds are in the [Terms of Service](/terms).',
          },
          {
            kind: 'ul',
            items: [
              '*Nothing is deleted.* A suspension records exactly one thing: since ' +
                'when. Everything you wrote stays exactly as it was.',
              '*It can be undone.* Lifting a suspension puts the account back as it ' +
                'was — this is not deletion, and it does not turn into deletion after ' +
                'some length of time.',
              '*While it is in force the account cannot be used* — including to export ' +
                'your data and to delete the account, because both go through the same ' +
                'door. Open sessions are ended as well. If you need the data, write to ' +
                `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}) and we will open access ` +
                'for that.',
            ],
          },
        ],
      },

      rights: {
        heading: 'Your rights',
        blocks: [
          {
            kind: 'ul',
            items: [
              '*Take all of it.* Settings → Your data → Download. Notes and cards as ' +
                'ordinary markdown files, the rest as JSON. It holds everything in the ' +
                '“What is stored” list except the credentials — signed-in sessions, ' +
                'the password hash and the link hashes are left out, because a file ' +
                'that gets emailed around is not the place for them. Nothing is locked.',
              '*Delete all of it.* Settings → Delete account.',
              '*Correct it.* Everything stored can be changed directly in the app.',
            ],
          },
        ],
      },

      incidents: {
        heading: 'If something goes wrong',
        blocks: [
          {
            kind: 'p',
            text:
              'If there is an outage or data is affected, we tell you by email, at the ' +
              'address of every account involved. We do not wait for you to ask first.',
          },
        ],
      },

      changes: {
        heading: 'Changes',
        blocks: [
          {
            kind: 'p',
            text:
              'If this policy changes in a way that affects you, we send an email ' +
              'before the change takes effect. The date above always shows the current ' +
              'version.',
          },
        ],
      },
    },

    outro: [{ kind: 'p', text: 'See also the [Terms of Service](/terms).' }],
  },

  terms: {
    title: 'Terms of Service',
    updated: '26 August 2026',

    intro: [
      {
        kind: 'p',
        text:
          'Konku is a free service run by one person. These terms are deliberately ' +
          'short — if anything is unclear, just ask.',
      },
    ],

    sections: {
      free: {
        heading: 'Free, and staying free',
        blocks: [
          {
            kind: 'ul',
            items: [
              '*There is no charge, and there will not be one.* No paid plan, no ' +
                'tiers, and no feature locked until you pay — not now and not later. ' +
                'The limits on notes and cards below are a capacity control, not a ' +
                'price.',
              '*Best effort, not a guarantee.* What is free here is the service, and ' +
                'what comes with it is one person’s best effort — not an availability ' +
                'promise. There is more under “Availability” below.',
              '*You can take your data and leave at any time.* One button, one file, ' +
                'no need to ask first. That is what keeps the line above from being a ' +
                'trap: a free service that holds your data is a price charged later.',
              '*If the cost grows too large, the answer is not to start charging.* The ' +
                'code is open and you can run your own copy — the [self-hosting ' +
                `guide](${SELF_HOSTING_URL}) is how. That is what lets “free” be ` +
                'written here without conditions.',
            ],
          },
        ],
      },

      account: {
        heading: 'Your account',
        blocks: [
          {
            kind: 'ul',
            items: [
              'One account per person. Look after your password.',
              'The email address has to be one you can reach. It is the only way to ' +
                'recover an account whose password is gone.',
              'You are responsible for what happens through your account. If something ' +
                'looks off, the “Signed-in devices” page ends sessions.',
            ],
          },
        ],
      },

      yourContent: {
        heading: 'What you write',
        blocks: [
          {
            kind: 'ul',
            items: [
              '*It is yours.* We claim no ownership of your notes, your cards, or ' +
                'anything else you make.',
              'We do not read the contents of your account, unless you ask us to in ' +
                'order to sort out a problem.',
              'You can download all of it at any time, without asking first.',
            ],
          },
        ],
      },

      notAllowed: {
        heading: 'What is not allowed',
        blocks: [
          {
            kind: 'ul',
            items: [
              'Trying to get into somebody else’s account.',
              'Loading the service on purpose. There are limits on the number of ' +
                'notes, the number of cards, and changes per minute — the figures are ' +
                'far above normal use, so you will not meet them using the app for ' +
                'what it is for.',
              'Using this service for anything unlawful.',
            ],
          },
          {
            kind: 'p',
            text:
              'An account that is clearly being abused can be *suspended*. A ' +
              'suspension deletes nothing and can be undone — but while it is in ' +
              'force, that account cannot be used, including to download its data. If ' +
              `you need the data, write to [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}) ` +
              'and we will open access for that. What is stored during a suspension is ' +
              'in the [Privacy Policy](/privacy).',
          },
        ],
      },

      availability: {
        heading: 'Availability',
        blocks: [
          {
            kind: 'ul',
            items: [
              'The service is provided *as is*, with *no guarantee* of uptime. It may ' +
                'go down briefly for maintenance, or go down because something broke.',
              'There is a daily backup and a recovery procedure that has been ' +
                'rehearsed, but no system is without risk. If the data matters, ' +
                'download a copy now and then — that is what the feature is for.',
            ],
          },
        ],
      },

      closing: {
        heading: 'If this service stops',
        blocks: [
          {
            kind: 'p',
            text:
              'If Konku closes, you are told by email *at least 30 days* beforehand, ' +
              'and the download keeps working for that whole period. No data goes ' +
              'without notice — that is the most basic promise this app makes.',
          },
        ],
      },

      liability: {
        heading: 'Liability',
        blocks: [
          {
            kind: 'p',
            text:
              'Because this service is free and provided as is, there is no liability ' +
              'for losses arising from its use, as far as the applicable law allows. ' +
              'What we can promise is what is written above: notice when something ' +
              'goes wrong, and your data always available to take.',
          },
        ],
      },

      changes: {
        heading: 'Changes',
        blocks: [
          {
            kind: 'p',
            text:
              'If these terms change in a way that affects you, we send an email ' +
              'before the change takes effect.',
          },
        ],
      },
    },

    outro: [{ kind: 'p', text: 'See also the [Privacy Policy](/privacy).' }],
  },
}
