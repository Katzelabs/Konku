import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

/**
 * Light, dark, or follow the OS.
 *
 * Genuine client state and not a server preference (D-044): there is no
 * per-user settings table yet, and inventing one for a theme would be the
 * wrong first reason to add it. localStorage also means the choice *can*
 * apply before the first paint, which a server round-trip could not do — but
 * only because `public/theme.js` reads the same key from a blocking script in
 * <head>. This file cannot do it: the effect below is what applies the class,
 * and an effect is after paint by definition, so on its own it painted the
 * light palette and flipped it a frame later on every reload (F-07).
 *
 * The three constants are therefore in two places. This is the one that the
 * app reads; `theme.js` restates them because a blocking classic script cannot
 * import, and `useTheme.test.ts` fails if the two drift.
 */
export type Theme = 'light' | 'dark' | 'system'

export const STORAGE_KEY = 'konku.theme'

/**
 * What the browser paints outside the page: the status bar on a phone, and
 * the address bar on Android. Both hexes are `--surface` for their theme
 * (styles/theme.css), so the chrome continues the page rather than framing it.
 */
export const THEME_COLOR = { light: '#f9fafb', dark: '#111115' } as const

function load(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // Private mode: fall through to the default.
  }
  return 'system'
}

function apply(theme: Theme) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light)
}

interface ThemeApi {
  theme: Theme
  setTheme: (t: Theme) => void
  /** What is actually on screen right now, with `system` resolved. */
  resolved: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeApi | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(load)
  // Seeded from what is already on <html>, which theme.js set before this
  // component existed. Starting at 'light' would make the appearance screen
  // show the wrong option as current for one frame on a dark-theme load.
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    apply(theme)
    setResolved(document.documentElement.classList.contains('dark') ? 'dark' : 'light')

    if (theme !== 'system') return
    // Following the OS means following it while the app is open, not only at
    // load — macOS flips at sunset.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      apply('system')
      setResolved(mq.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      // The choice still applies for this tab.
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
