import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Unmount React trees between tests (Testing Library does not auto-clean under Vitest).
afterEach(cleanup)
