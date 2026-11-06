import { afterEach, describe, expect, it, vi } from 'vitest'
import { rememberPendingPath, rememberTaxYear, rememberedPendingPath, rememberedTaxYear } from './sessionMemory'

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('sessionMemory — the chosen year and the pending path survive registration (F12)', () => {
  it('remembers the tax year, but only one the cockpit offers', () => {
    expect(rememberedTaxYear(2026, [2026, 2025])).toBe(2026)
    rememberTaxYear(2025)
    expect(rememberedTaxYear(2026, [2026, 2025])).toBe(2025)
    rememberTaxYear(1999)
    expect(rememberedTaxYear(2026, [2026, 2025])).toBe(2026)
  })

  it('remembers and clears the pending funnel path, ignoring unknown values', () => {
    rememberPendingPath('ch')
    expect(rememberedPendingPath()).toBe('ch')
    rememberPendingPath(null)
    expect(rememberedPendingPath()).toBeNull()
    sessionStorage.setItem('steuereule.pendingPath', 'irgendwas')
    expect(rememberedPendingPath()).toBeNull()
  })

  it('falls back to the defaults when storage is blocked', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => rememberTaxYear(2025)).not.toThrow()
    expect(rememberedTaxYear(2026, [2026, 2025])).toBe(2026)
    expect(rememberedPendingPath()).toBeNull()
  })
})
