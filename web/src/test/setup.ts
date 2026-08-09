import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Unmount between tests. Without it, a component from an earlier test keeps
// its timers and its subscriptions, and the failure surfaces somewhere else
// entirely.
afterEach(() => {
  cleanup()
  localStorage.clear()
})
