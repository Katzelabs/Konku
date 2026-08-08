import CaptureDialog from './CaptureDialog'
import { useFocusTimer } from './TimerProvider'

/**
 * Opens the capture prompt the moment a session finishes, from anywhere in the
 * app.
 *
 * It used to be rendered by TimerPage, so a session that ended while you were
 * reading a note simply passed without asking. That is the single mechanism the
 * MVP exists to test (D-036) — it cannot be conditional on which screen you
 * were looking at.
 */
export function CaptureGate() {
  const timer = useFocusTimer()
  if (timer.status !== 'done') return null
  return <CaptureDialog domainId={timer.domainId} onClose={timer.reset} />
}
