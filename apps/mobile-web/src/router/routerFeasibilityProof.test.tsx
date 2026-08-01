// Task 1a's proving test (#238, AC-1's mechanism, Musti's condition (iii)): the browser URL is
// set via `history.pushState` *before* mount, and the screen that URL maps to is asserted to
// render — not `setStage(...)`, and not RN-Web's `Linking` (it never observes `popstate`, see
// ADR-0023's context). This is deliberately the only test for `routerFeasibilityProof.tsx`; it
// does not join `App.test.tsx` or any of the 15 pre-existing test files, per task 1a's condition
// (i) that those stay unchanged.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { RouterFeasibilityProof } from './routerFeasibilityProof'

afterEach(() => {
  cleanup()
  window.history.pushState({}, '', '/')
})

describe('router feasibility proof (task 1a)', () => {
  it('resolves the root URL to the first screen', async () => {
    window.history.pushState({}, '', '/')
    render(<RouterFeasibilityProof />)
    expect(await screen.findByText('proof-screen-a')).toBeTruthy()
    expect(screen.queryByText('proof-screen-b')).toBeNull()
  })

  it('resolves a real URL, set before mount, to the mapped screen — not `setStage`', async () => {
    window.history.pushState({}, '', '/nav-proof')
    render(<RouterFeasibilityProof />)
    expect(await screen.findByText('proof-screen-b')).toBeTruthy()
    expect(screen.queryByText('proof-screen-a')).toBeNull()
  })
})
