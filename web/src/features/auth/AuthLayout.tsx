import type { ReactNode } from 'react'
import { GraduationCap } from 'lucide-react'

/**
 * The frame every signed-out screen shares: mark, title, and a narrow column.
 *
 * Extracted when signup and verification arrived (07 L3) rather than left
 * duplicated three more times. It carries no state and makes no decisions —
 * the screens differ in their content, not in their chrome.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-fg">
            <GraduationCap className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-surface-fg">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-fg">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </main>
  )
}
