import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { STORAGE_KEY, THEME_COLOR, ThemeProvider, useTheme } from './useTheme'

/*
 * The theme has to be on the page before the first paint, and only the
 * blocking script in <head> can do that (F-07). This file guards the seam
 * between that script and this module: they hold the same three constants and
 * cannot import from each other, because a module script is deferred by
 * definition and would be back after the paint.
 */

const themeJs = readFileSync('public/theme.js', 'utf8')
const indexHtml = readFileSync('index.html', 'utf8')

/** jsdom has no matchMedia at all, so the OS has to be stated. */
function osPrefersDark(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: dark,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

beforeEach(() => {
  document.documentElement.className = ''
  document.documentElement.style.colorScheme = ''
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">'
  osPrefersDark(false)
})

it('reads the same storage key the app writes', () => {
  expect(themeJs).toContain(`'${STORAGE_KEY}'`)
})

it('paints the same two colours the app does', () => {
  expect(themeJs).toContain(THEME_COLOR.light)
  expect(themeJs).toContain(THEME_COLOR.dark)
})

it('is loaded from <head>, blocking, before the app', () => {
  const script = indexHtml.indexOf('<script src="/theme.js"></script>')
  expect(script).toBeGreaterThan(-1)

  // Not a module and not deferred: either one runs after the document is
  // parsed, which is the flash this file exists to prevent.
  expect(indexHtml).not.toMatch(/<script[^>]*theme\.js[^>]*(defer|type="module")/)

  // And the meta it rewrites has to exist by the time it runs.
  expect(indexHtml.indexOf('name="theme-color"')).toBeLessThan(script)
  expect(script).toBeLessThan(indexHtml.indexOf('/src/main.tsx'))
})

function Screen() {
  const { theme, resolved, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="state">{`${theme}/${resolved}`}</span>
      <button onClick={() => setTheme('dark')}>Gelap</button>
    </div>
  )
}

it('applies a choice to the class, the colour scheme and the chrome', async () => {
  render(
    <ThemeProvider>
      <Screen />
    </ThemeProvider>,
  )

  await userEvent.click(screen.getByRole('button', { name: 'Gelap' }))

  expect(document.documentElement).toHaveClass('dark')
  expect(document.documentElement.style.colorScheme).toBe('dark')
  expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    THEME_COLOR.dark,
  )
  expect(screen.getByTestId('state')).toHaveTextContent('dark/dark')
  expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
})

it('resolves "system" against the OS, and says which it landed on', () => {
  // theme.js has already put this class on <html> from the same query; the
  // provider agreeing with it is what keeps the appearance screen from
  // showing the wrong option as current.
  osPrefersDark(true)

  render(
    <ThemeProvider>
      <Screen />
    </ThemeProvider>,
  )

  expect(document.documentElement).toHaveClass('dark')
  expect(screen.getByTestId('state')).toHaveTextContent('system/dark')
})
