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
 * wrong first reason to add it. localStorage also means the choice applies
 * before the first paint, which a server round-trip could not do.
 */
export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'konku.theme'

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
  document.documentElement.classList.toggle('dark', dark)
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
  const [resolved, setResolved] = useState<'light' | 'dark'>('light')

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
