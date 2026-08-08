import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/ui/page-header'
import DomainSettings from './DomainSettings'

/**
 * Domain management on its own route.
 *
 * Reachable from Pengaturan rather than the nav — it is settings-shaped, not
 * somewhere you go daily — but it is a real page with a real URL, so it can be
 * linked to and bookmarked. Per-user domains made a UI for them non-optional
 * (D-046, D-053).
 */
export default function DomainsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button asChild variant="link" size="inline" className="self-start">
          <Link to="/settings">
            <ArrowLeft />
            Pengaturan
          </Link>
        </Button>
        <PageHeader
          title="Domain"
          description="Domain menandai catatan dan sesi fokus, dan jadi dasar rotasi mingguan."
        />
      </div>

      <DomainSettings />
    </div>
  )
}
