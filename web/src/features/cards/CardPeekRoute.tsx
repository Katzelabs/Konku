import { useParams } from 'react-router-dom'
import { usePeekMode } from '../../components/ui/peek-panel'
import { usePeekBackground, usePeekNavigation } from '../../lib/peek-route'
import { CardPeek } from './CardPeek'

/** The card half of the peek routes. See NotePeekRoute. */
export default function CardPeekRoute() {
  const { id = '' } = useParams()
  const background = usePeekBackground()
  const [mode, setMode] = usePeekMode()
  const peek = usePeekNavigation()

  if (!id) return null

  return (
    <CardPeek
      cardId={id}
      mode={mode === 'full' ? 'side' : mode}
      onModeChange={(next) => {
        if (next === 'full') peek.openFull(`/cards/${id}`)
        else setMode(next)
      }}
      onClose={() => peek.close(background)}
    />
  )
}
