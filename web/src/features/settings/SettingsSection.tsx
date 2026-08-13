import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * One settings screen: a heading, a line saying what it is for, and the panels.
 *
 * An `h2`, not an `h1` — the shell above it already says Pengaturan, and two
 * top-level headings on one page is the sort of thing that reads fine and
 * sounds wrong to a screen reader.
 */
export function SettingsSection({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  /** Page-level actions for this section, e.g. the Tambah button. */
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lg font-semibold text-surface-fg">{title}</h2>
          {description && (
            <p className="max-w-prose text-sm text-muted-fg">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

/**
 * The shape every settings action turned out to be: what it does, one quiet
 * line of consequence, and the control on the right.
 *
 * It was written out by hand four times — logout, export, revoke-others,
 * delete-account — with four slightly different paddings and all four squeezing
 * the button against the text on a phone. Here it stacks below `sm` instead.
 */
export function SettingsRow({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: ReactNode
  action: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-card-fg">{title}</p>
        {description && (
          <p className="max-w-prose text-xs text-muted-fg">{description}</p>
        )}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}

/** A read-only fact about the account. Not an input — nothing here writes yet. */
export function SettingsField({
  label,
  value,
  empty = 'Belum diisi',
}: {
  label: string
  value: string
  /**
   * Shown when there is no value. Blank rather than the address repeated under
   * a label that says Nama: an account created before signup asked for one
   * genuinely has no name, and saying so is more honest than filling the gap.
   */
  empty?: string
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-28 shrink-0 text-xs font-medium text-muted-fg">{label}</dt>
      <dd
        className={cn(
          'min-w-0 truncate text-sm',
          value ? 'text-card-fg' : 'text-subtle-fg italic',
        )}
      >
        {value || empty}
      </dd>
    </div>
  )
}
