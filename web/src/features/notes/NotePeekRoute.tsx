import { useParams } from 'react-router-dom'
import { usePeekMode } from '../../components/ui/peek-panel'
import { usePeekBackground, usePeekNavigation } from '../../lib/peek-route'
import { NotePeek } from './NotePeek'

/**
 * Mounts the note peek from the router rather than from the list.
 *
 * The panel is a route now, so it renders against the real location while the
 * list underneath renders against the background one. That is what lets the
 * URL read `/notes/:id` with the list still on screen behind it.
 */
export default function NotePeekRoute() {
  const { id = '' } = useParams()
  const background = usePeekBackground()
  const [mode, setMode] = usePeekMode()
  const peek = usePeekNavigation()

  if (!id) return null

  return (
    <NotePeek
      noteId={id}
      // 'full' never reaches PeekPanel: choosing it means leaving the peek,
      // which is a navigation, not a rendering mode.
      mode={mode === 'full' ? 'side' : mode}
      onModeChange={(next) => {
        if (next === 'full') peek.openFull(`/notes/${id}`)
        else setMode(next)
      }}
      onClose={() => peek.close(background)}
    />
  )
}
