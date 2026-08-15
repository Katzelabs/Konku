/*
 * The theme, applied before the first paint.
 *
 * This runs as a blocking classic script in <head>, which is the only place
 * that is true. `ThemeProvider` used to be the only thing that applied the
 * choice, and it does so in an effect — an effect is after paint by
 * definition, so every reload for a dark-theme user painted the light palette
 * and then flipped (F-07).
 *
 * A file rather than an inline <script>: the CSP has no 'unsafe-inline' and is
 * not going to grow one for a theme (internal/api/security.go). A same-origin
 * file satisfies script-src 'self' with no policy change at all. It also
 * cannot be type="module" — a module script is deferred by definition, which
 * would put it back after the paint it exists to precede.
 *
 * The three constants below are duplicated in features/settings/useTheme.tsx,
 * because a classic script cannot import. useTheme.test.ts reads this file and
 * fails if they drift apart.
 */
;(function () {
  var STORAGE_KEY = 'konku.theme'
  var LIGHT = '#f9fafb'
  var DARK = '#111115'

  try {
    var stored = localStorage.getItem(STORAGE_KEY)
    var theme = stored === 'light' || stored === 'dark' ? stored : 'system'
    var dark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    var root = document.documentElement
    root.classList.toggle('dark', dark)
    // Scrollbars, form controls and the flash of the page background before
    // the stylesheet lands are all the browser's own, and this is what tells
    // it which way round they go.
    root.style.colorScheme = dark ? 'dark' : 'light'

    var meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', dark ? DARK : LIGHT)
  } catch (e) {
    // Storage disabled, or a browser without matchMedia. The app still paints;
    // it paints light, which is the same default the provider falls back to.
  }
})()
