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
  it('carries the brand lime and exclusive KI violet', () => {
    const light = new Map(normalized.base.color.map((t) => [t.key, t.value]))
    expect(light.get('funke')).toBe('#c9f229')
    expect(light.get('ki')).toBe('#7c5cff')
  })

  it('every dark override is also a base colour', () => {
    const baseKeys = new Set(normalized.base.color.map((t) => t.key))
    for (const t of normalized.darkColors) expect(baseKeys.has(t.key)).toBe(true)
  })
})
