import { Card } from '../../components/ui/card'

/** The right pane at /notes on desktop. Never shown on phones. */
export default function NoNoteSelected() {
  return (
    <Card className="hidden h-full min-h-96 items-center justify-center md:flex">
      <p className="text-sm text-subtle-fg">Pilih catatan, atau buat yang baru.</p>
    </Card>
  )
}
