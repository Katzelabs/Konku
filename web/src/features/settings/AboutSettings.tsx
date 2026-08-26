import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/card'
import { useCopy } from '../../i18n'
import { SettingsSection } from './SettingsSection'

/**
 * What this app does with what you give it, and the two documents that say so
 * in full.
 *
 * Kept short here and linked rather than inlined: `/privacy` and `/terms` are
 * written against what the code actually stores and there is a test that fails
 * when a new feature stores something they do not mention (07 L9). A summary
 * that drifts from them would be worse than no summary.
 */
export default function AboutSettings() {
  const c = useCopy().settings.about

  return (
    <SettingsSection title={c.title} description={c.description}>
      <Card className="flex flex-col gap-3 p-5 text-sm">
        <p className="text-secondary-fg">{c.stores}</p>
        <p className="text-muted-fg">{c.notAggregated}</p>
      </Card>

      <div className="flex flex-col gap-2">
        <LegalLink to="/privacy" label={c.privacy} />
        <LegalLink to="/terms" label={c.terms} />
      </div>
    </SettingsSection>
  )
}

/**
 * A row, not a sentence of links. Both documents open outside the app shell
 * (they are reachable signed out), so they are destinations rather than
 * inline references, and a row is what a destination looks like everywhere
 * else in this app.
 */
function LegalLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="block">
      <Card className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-muted">
        <span className="text-sm font-medium text-card-fg">{label}</span>
        <ExternalLink className="size-4 shrink-0 text-subtle-fg" />
      </Card>
    </Link>
  )
}
