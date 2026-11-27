// Drift guard + integration: regenerate the outputs from the REAL checked-in manifest and assert
// the committed dist/ is in sync. If this fails, run `pnpm --filter @steuereule/tokens build`.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { manifestToTokens, type Manifest } from './manifest-to-tokens'
import { renderCss } from './render-css'
import { renderRnTheme } from './render-rn'

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string): string => readFileSync(resolve(here, rel), 'utf8')

const manifest = JSON.parse(
  read('../../../finanzo-funke-design-system/project/_ds_manifest.json'),
) as Manifest
const normalized = manifestToTokens(manifest)

describe('generated dist is in sync with the manifest', () => {
  it('dist/tokens.css matches a fresh render', () => {
    expect(read('../dist/tokens.css')).toBe(renderCss(normalized))
  })

  it('dist/theme.ts matches a fresh render', () => {
    expect(read('../dist/theme.ts')).toBe(renderRnTheme(normalized))
  })
})

describe('real manifest sanity', () => {
  it('carries the brand lime as the one accent; KI output is neutral (Graphit)', () => {
    const light = new Map(normalized.base.color.map((t) => [t.key, t.value]))
    expect(light.get('funke')).toBe('#c9f229')
    // No second accent: the KI tokens are greys, so violet cannot come back through a token.
    for (const key of ['ki', 'kiWeich', 'kiLinie', 'kiTinte']) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(light.get(key)!.slice(i, i + 2), 16))
      expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!), `${key} is not neutral`).toBeLessThanOrEqual(12)
    }
  })

  it('light mode is white on white with hairlines; dark mode lifts cards one step', () => {
    const light = new Map(normalized.base.color.map((t) => [t.key, t.value]))
    const dark = new Map(normalized.darkColors.map((t) => [t.key, t.value]))
    expect(light.get('grund')).toBe('#ffffff')
    expect(light.get('karte')).toBe('#ffffff')
    expect(dark.get('grund')).toBe('#0f0f14')
    expect(dark.get('karte')).toBe('#191920')
  })

  it('every dark override is also a base colour', () => {
    const baseKeys = new Set(normalized.base.color.map((t) => t.key))
    for (const t of normalized.darkColors) expect(baseKeys.has(t.key)).toBe(true)
  })
})
