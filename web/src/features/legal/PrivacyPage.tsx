import { useLegalCopy } from '../../i18n/legal'
import { PRIVACY_SECTIONS } from '../../i18n/legal/types'
import { LegalPage } from './LegalPage'

/**
 * The privacy policy (07 L9, bilingual in ticket 11 I4).
 *
 * The document itself is in `web/src/i18n/legal/{id,en}.ts` — the header there
 * explains why it is data and why it is not in the main `Copy` catalog. What is
 * left here is the route.
 *
 * Two properties this page had before the copy moved, kept because they are the
 * reason the page is worth anything:
 *
 *   - **It is written against what the code does, not from a template.** L9's
 *     test is whether somebody who has never seen the code could read it and
 *     say what the app stores. `legal.test.tsx` now checks that column by
 *     column against `internal/store/gen/models.go`.
 *   - **"Shared with nobody" is not literally true and the page does not say
 *     it.** Mail goes through Resend, error reports go to Sentry, the database
 *     sits on a rented server, and the backups have a copy in R2. All four are
 *     named with exactly what each receives.
 */
export default function PrivacyPage() {
  return <LegalPage doc={useLegalCopy().privacy} order={PRIVACY_SECTIONS} />
}
