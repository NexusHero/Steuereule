import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  rememberPendingPath,
  rememberReturnTo,
  rememberTaxYear,
  rememberedPendingPath,
  rememberedReturnTo,
  rememberedTaxYear,
} from './sessionMemory'

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

  it('remembers and clears returnTo only for /app/ paths', () => {
    rememberReturnTo('/app/steuerjahr/2025/kapital')
    expect(rememberedReturnTo()).toBe('/app/steuerjahr/2025/kapital')
    rememberReturnTo('/login')
    expect(rememberedReturnTo()).toBe('/app/steuerjahr/2025/kapital')
    rememberReturnTo('https://evil.example/app/x')
    expect(rememberedReturnTo()).toBe('/app/steuerjahr/2025/kapital')
    rememberReturnTo(null)
    expect(rememberedReturnTo()).toBeNull()
    sessionStorage.setItem('steuereule.returnTo', '/rechtliches/impressum')
    expect(rememberedReturnTo()).toBeNull()
  })

  it('falls back to the defaults when storage is blocked', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => rememberTaxYear(2025)).not.toThrow()
    expect(() => rememberReturnTo('/app/steuerjahr/2025/kapital')).not.toThrow()
    expect(rememberedTaxYear(2026, [2026, 2025])).toBe(2026)
    expect(rememberedPendingPath()).toBeNull()
    expect(rememberedReturnTo()).toBeNull()
  })
})
