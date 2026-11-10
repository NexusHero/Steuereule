import { describe, it, expect } from 'vitest'
import { theme, modeTokens, type ThemeMode } from './index'

const MIN_WCAG_AA_CONTRAST = 4.5

function relativeLuminance(hex: string): number {
  const clean = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new RangeError(`Expected 6-digit hex colour, got ${hex}`)
  }
  const channels = [0, 2, 4].map((offset) => {
    const srgb = parseInt(clean.slice(offset, offset + 2), 16) / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground)
  const l2 = relativeLuminance(background)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function assertContrast(label: string, fg: string, bg: string): void {
  const ratio = contrastRatio(fg, bg)
  expect(ratio, `${label} (${fg} on ${bg}) = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_WCAG_AA_CONTRAST)
}

describe('WCAG 2.1 AA text-on-surface contrast (>= 4.5:1)', () => {
  for (const mode of ['light', 'dark'] as const satisfies readonly ThemeMode[]) {
    it(`${mode} mode passes all text-on-surface pairs used by the app`, () => {
      const c = modeTokens(mode).color
      const inkOnFunke = mode === 'dark' ? c.nacht : c.tinte

      assertContrast(`${mode}: tinte on grund`, c.tinte, c.grund)
      assertContrast(`${mode}: tinte2 on grund`, c.tinte2, c.grund)
      assertContrast(`${mode}: tinte on karte`, c.tinte, c.karte)
      assertContrast(`${mode}: tinte2 on karte`, c.tinte2, c.karte)

      assertContrast(`${mode}: nachtText on nacht`, c.nachtText, c.nacht)
      assertContrast(`${mode}: nachtText on nachtKarte`, c.nachtText, c.nachtKarte)
      assertContrast(`${mode}: funke on nacht`, c.funke, c.nacht)
      assertContrast(`${mode}: funkeHell on nacht`, c.funkeHell, c.nacht)

      assertContrast(`${mode}: ink on funke`, inkOnFunke, c.funke)

      assertContrast(`${mode}: tinte on funkeWeich`, c.tinte, c.funkeWeich)
      assertContrast(`${mode}: tinte on okWeich`, c.tinte, c.okWeich)
      assertContrast(`${mode}: tinte on warnWeich`, c.tinte, c.warnWeich)
      assertContrast(`${mode}: tinte on fehlerWeich`, c.tinte, c.fehlerWeich)

      assertContrast(`${mode}: funkeTinte on grund`, c.funkeTinte, c.grund)
      assertContrast(`${mode}: funkeTinte on karte`, c.funkeTinte, c.karte)
      assertContrast(`${mode}: funkeTinte on funkeWeich`, c.funkeTinte, c.funkeWeich)

      assertContrast(`${mode}: kiTinte on kiWeich`, c.kiTinte, c.kiWeich)
      assertContrast(`${mode}: kiTinte on grund`, c.kiTinte, c.grund)
      assertContrast(`${mode}: kiTinte on karte`, c.kiTinte, c.karte)
    })
  }

  it('dark mode passes semantic status text tokens and direct dark nacht ink pairs', () => {
    const c = theme.dark.color

    assertContrast('dark: tinte on nacht', c.tinte, c.nacht)
    assertContrast('dark: tinte2 on nacht', c.tinte2, c.nacht)
    assertContrast('dark: ok on grund', c.ok, c.grund)
    assertContrast('dark: ok on karte', c.ok, c.karte)
    assertContrast('dark: warn on grund', c.warn, c.grund)
    assertContrast('dark: warn on karte', c.warn, c.karte)
    assertContrast('dark: warn on nacht', c.warn, c.nacht)
    assertContrast('dark: fehler on grund', c.fehler, c.grund)
    assertContrast('dark: fehler on karte', c.fehler, c.karte)
    assertContrast('dark: fehler on fehlerWeich', c.fehler, c.fehlerWeich)
  })

  it('dark mode hard shadows use the dark ink border colour instead of dark-on-dark black', () => {
    expect(theme.dark.shadow.hart.shadowColor).toBe(theme.dark.color.tinte)
    expect(theme.dark.shadow.hartS.shadowColor).toBe(theme.dark.color.tinte)
    expect(theme.dark.shadow.hartL.shadowColor).toBe(theme.dark.color.tinte)
    expect(theme.dark.shadow.hart.shadowColor).not.toBe(theme.light.color.tinte)
    expect(theme.dark.shadow.hart.shadowColor).not.toBe('#000000')
  })
})
