import { useLegalCopy } from '../../i18n/legal'
import { TERMS_SECTIONS } from '../../i18n/legal/types'
import { LegalPage } from './LegalPage'

/**
 * Terms of service (07 L9, bilingual and rescoped in ticket 11 I4).
 *
 * The document is in `web/src/i18n/legal/{id,en}.ts`. Two things about it that
 * belong next to the route rather than inside the copy:
 *
 *   - **Short, and honest about what this is:** a free service run by one
 *     person on a rented server, with no uptime guarantee. Promising an SLA
 *     nobody is staffed to meet would be the same failure as a copy-pasted
 *     privacy policy — a document describing a product that does not exist.
 *   - **The free section is D-096 and is not decoration.** Free is a permanent
 *     property rather than a launch price: no billing code, no tier, no feature
 *     gating, ever, with self-hosting as the pressure valve if hosting cost
 *     outgrows the operator. The section links `docs/SELF-HOSTING.md`, which
 *     exists, in a repository that is public — which is the difference between
 *     asserting the escape hatch and pointing at it.
 *
 * The tone rule holds here as much as in the app (hard rule 6). Terms are where
 * products go to sound threatening; these state what is expected and what
 * happens if it is not, without the posturing.
 */
export default function TermsPage() {
  return <LegalPage doc={useLegalCopy().terms} order={TERMS_SECTIONS} />
}
