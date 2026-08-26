import { Download } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { useCopy } from '../../i18n'
import { SettingsRow } from './SettingsSection'

/**
 * Download everything (07 L6).
 *
 * A plain anchor, not a fetch-and-blob. The archive is a file, the browser
 * already knows how to download one, and doing it through JavaScript would
 * mean holding the whole thing in memory to hand it back to the browser
 * anyway — and losing the progress indicator the browser gives for free.
 *
 * `download` is honoured because the response is same-origin; the server's
 * Content-Disposition supplies the dated filename, so there is nothing to keep
 * in sync here.
 */
export function ExportData() {
  const c = useCopy().settings.export

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <p className="text-sm text-secondary-fg">{c.formats}</p>
        <p className="mt-2 text-sm text-muted-fg">{c.portable}</p>
      </div>

      <SettingsRow
        className="border-t border-border pt-4"
        title={c.row.title}
        description={c.row.description}
        action={
          /*
            asChild so the anchor keeps the button's styling. A <button> firing
            a programmatic download would need JavaScript to do what an <a>
            does on its own.
          */
          <Button asChild variant="secondary" size="sm">
            <a href="/api/export" download>
              <Download />
              {c.action}
            </a>
          </Button>
        }
      />
    </Card>
  )
}
