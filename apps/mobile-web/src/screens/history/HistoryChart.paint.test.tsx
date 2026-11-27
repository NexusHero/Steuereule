import { describe, expect, it } from 'vitest'
import { modeTokens, type ThemeMode } from '@steuereule/tokens'
import type { UiTheme } from '@steuereule/ui'
import { refundBarFill, segmentPaint } from './HistoryChart'
import type { SegmentKind } from './historyChartModel'

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

// The segments that share one chart, as its legend lists them.
const CHARTS: Readonly<Record<string, readonly SegmentKind[]>> = {
  netto: ['netto', 'steuern', 'sozialversicherung'],
  werbungskosten: ['fahrtweg', 'homeoffice', 'arbeitsmittel', 'sonstiges', 'summeLautBescheid'],
}

// The test build stubs react-native-svg, so the plot is checked as data: what each mark is painted with.
// Graphit draws money without red, green or violet, so a mark is told apart by ink step and texture,
// and it has to be seen at all (WCAG 1.4.11: 3:1 against the card it is drawn on).
describe.each(['light', 'dark'] as const satisfies readonly ThemeMode[])('history chart paint in %s mode', (mode) => {
  const t = { mode, color: modeTokens(mode).color } as unknown as UiTheme

  it.each(Object.values(CHARTS).flat())('"%s" has an edge that clears 3:1 on the card', (kind) => {
    const paint = segmentPaint(t, kind)
    const edge = paint.outline ?? paint.fill
    expect(contrast(edge, t.color.karte), `${kind}: ${edge} on ${t.color.karte}`).toBeGreaterThanOrEqual(3)
  })

  it.each(Object.entries(CHARTS))('no two segments of the %s chart are painted alike', (_chart, kinds) => {
    const looks = kinds.map((k) => {
      const p = segmentPaint(t, k)
      return `${p.texture}/${p.fill}`
    })
    expect(new Set(looks).size).toBe(kinds.length)
  })

  it('a refund bar is ink whether its year is picked or not; the picked one is the darkest', () => {
    const picked = refundBarFill(t, true)
    const other = refundBarFill(t, false)
    expect(contrast(other, t.color.karte)).toBeGreaterThanOrEqual(3)
    expect(contrast(picked, t.color.karte)).toBeGreaterThan(contrast(other, t.color.karte))
  })
})
