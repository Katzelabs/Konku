import { useSyncExternalStore } from 'react'

/**
 * Whether a CSS media query currently matches.
 *
 * The details drawer needs this in JavaScript rather than CSS: it is a static
 * column on a wide screen and a focus-trapping dialog on a narrow one, and
 * those are different components, not one component with different styles.
 * Rendering both and hiding one would put every field in the DOM twice and
 * break label association.
 *
 * useSyncExternalStore rather than useEffect + useState, so the first paint
 * already has the right answer instead of flashing the mobile branch.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    // Server snapshot. There is no SSR here (D-041 keeps Node out of
    // production entirely) but React asks for it, and false is the safe
    // answer: the dialog branch works at every width.
    () => false,
  )
}
