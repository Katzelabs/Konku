import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/ui/page-header'
import CategorySettings from './CategorySettings'

/**
 * Category management on its own route, the same shape as /domains.
 *
 * Reached from Pengaturan rather than the nav — it is settings-shaped, not
 * somewhere you go daily — but it is a real page with a real URL, so it can be
 * linked to and bookmarked.
 */
export default function CategoriesPage() {
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
          title="Kategori"
          description="Satu kosakata yang dipakai bersama oleh catatan dan kartu."
        />
      </div>

      <CategorySettings />
    </div>
  )
}
