import { defineConfig } from 'vitest/config'
import base from './vitest.config'

// The suite again, with React's scheduler slowed down (`src/test-scheduler-delay.ts`): a test that
// acts before React has run its queued work fails here every time. Setup files run in order, and
// the delay must be in place before `src/test-setup.ts` loads react-dom, so it goes first — Vite's
// `mergeConfig` would append it. No coverage: the plain run measures that.
const baseSetupFiles = base.test?.setupFiles ?? []

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    setupFiles: ['./src/test-scheduler-delay.ts', ...(Array.isArray(baseSetupFiles) ? baseSetupFiles : [baseSetupFiles])],
    coverage: { ...base.test?.coverage, enabled: false },
  },
})
