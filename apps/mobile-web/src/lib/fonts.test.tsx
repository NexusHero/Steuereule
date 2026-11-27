import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-asset', () => ({ Asset: { fromModule: (id: number) => ({ uri: `/assets/font-${id}.ttf` }) } }))

import { theme } from '@steuereule/tokens'
import { APP_FONT_FACES, APP_FONTS_STYLE_ID, fontFaceCss, installAppFonts } from './fonts'

afterEach(() => document.getElementById(APP_FONTS_STYLE_ID)?.remove())

describe('app fonts', () => {
  it('serves every family the tokens name first, from the bundle', () => {
    const families = new Set(APP_FONT_FACES.map((f) => f.family))
    for (const stack of [theme.font.display, theme.font.text, theme.font.mono]) {
      const first = stack.split(',')[0]!.trim().replace(/"/g, '')
      expect(families.has(first), `${first} has no bundled face`).toBe(true)
    }
  })

  it('has a face for every token weight of the text family', () => {
    const weights = new Set(APP_FONT_FACES.filter((f) => f.family === 'Geist').flatMap((f) => f.weight.split(' ')))
    for (const w of Object.values(theme.weight)) expect(weights.has(w), `Geist ${w}`).toBe(true)
  })

  it('writes one @font-face per face and resolves bundled asset ids', () => {
    const css = fontFaceCss([{ family: 'Geist', weight: '500', source: 7 }, { family: 'Geist Mono', weight: '400', source: '/m.ttf' }], (s) => (typeof s === 'string' ? s : `/assets/font-${s}.ttf`))
    expect(css.match(/@font-face/g)).toHaveLength(2)
    expect(css).toContain('font-family:"Geist";font-style:normal;font-weight:500')
    expect(css).toContain('url("/assets/font-7.ttf")')
    expect(css).toContain('url("/m.ttf")')
    expect(css).not.toMatch(/https?:\/\//)
  })

  it('installs the faces once', () => {
    installAppFonts()
    installAppFonts()
    expect(document.querySelectorAll(`#${APP_FONTS_STYLE_ID}`)).toHaveLength(1)
    expect(document.getElementById(APP_FONTS_STYLE_ID)!.textContent).toContain('"Geist Mono"')
  })
})
