import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  GraduationCap,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Avatar } from '../ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Input } from '../ui/input'
import { FocusPill } from './FocusPill'
import { crumbsFor } from './Nav'

/**
 * The bar across the top of every authenticated screen: where you are, a way
 * to find a note, the running session, and the account menu.
 *
 * It is sticky rather than fixed so it scrolls with a long note on a phone but
 * stays reachable on desktop, where the main column is its own scroll
 * container.
 */
export function TopBar({
  email,
  onLogout,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  email: string
  onLogout: () => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card px-1 py-2.5 md:px-gutter">
      <BrandMark />
      <button
        onClick={onToggleSidebar}
        aria-label={sidebarCollapsed ? 'Buka sidebar' : 'Tutup sidebar'}
        title={sidebarCollapsed ? 'Buka sidebar' : 'Tutup sidebar'}
        aria-expanded={!sidebarCollapsed}
        className="hidden shrink-0 rounded-md p-1.5 text-subtle-fg transition-colors hover:bg-muted hover:text-surface-fg md:block"
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="size-4" />
        ) : (
          <PanelLeftClose className="size-4" />
        )}
      </button>
      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <NoteSearch />
        <FocusPill />
        <AccountMenu email={email} onLogout={onLogout} />
      </div>
    </header>
  )
}

/** Only on phones, where there is no sidebar carrying the brand. */
function BrandMark() {
  return (
    <Link to="/home" className="flex items-center gap-2 md:hidden">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-fg">
        <GraduationCap className="size-3.5" />
      </span>
    </Link>
  )
}

function Breadcrumbs() {
  const { pathname } = useLocation()
  const crumbs = crumbsFor(pathname)

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
      <Link
        to="/home"
        className="shrink-0 text-muted-fg transition-colors hover:text-surface-fg"
      >
        Konku
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.label} className="flex min-w-0 items-center gap-1.5">
          <ChevronRight className="size-3.5 shrink-0 text-subtle-fg" aria-hidden />
          {crumb.to && i < crumbs.length - 1 ? (
            <Link
              to={crumb.to}
              className="truncate text-muted-fg transition-colors hover:text-surface-fg"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="truncate font-medium text-surface-fg" aria-current="page">
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

/**
 * Finds a note by title.
 *
 * Deliberately titles only, and the placeholder says so. Full-text search over
 * note bodies is still deferred to v0.2 (D-031) and a box that looks like it
 * searches everything would be a promise the server cannot keep. Submitting
 * hands the query to the notes list, which does the filtering.
 */
function NoteSearch() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)

  // Keep in step with the notes list when the query lives in the URL.
  useEffect(() => {
    if (pathname.startsWith('/notes')) setValue(params.get('q') ?? '')
  }, [pathname, params])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !isTyping(e.target)) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const q = value.trim()
    navigate(q ? `/notes?q=${encodeURIComponent(q)}` : '/notes')
  }

  return (
    <form onSubmit={submit} className="relative hidden sm:block">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-fg" />
      <Input
        ref={input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Cari judul catatan…"
        aria-label="Cari judul catatan"
        className="h-9 w-48 bg-surface pl-9 lg:w-64"
      />
    </form>
  )
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  )
}

function AccountMenu({ email, onLogout }: { email: string; onLogout: () => void }) {
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Akun"
        className="rounded-full transition-opacity hover:opacity-80"
      >
        <Avatar email={email} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings />
          Pengaturan
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onLogout}>
          <LogOut />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
