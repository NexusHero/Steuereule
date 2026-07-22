import { describe, it, expect } from 'vitest'
import type { Manifest } from './manifest-to-tokens'
import { manifestToTokens } from './manifest-to-tokens'
import { renderCss } from './render-css'
import {
  pxToNumber,
  msToNumber,
  parseEasing,
  parseShadow,
  buildRnTheme,
  resolveColors,
} from './render-rn'

const manifest: Manifest = {
  tokens: [
    { name: '--grund', value: '#f4f2e9' },
    { name: '--tinte', value: '#191b12' },
    { name: '--ki', value: '#7c5cff' },
    { name: '--funke', value: '#c9f229' },
    { name: '--s4', value: '16px' },
    { name: '--radius', value: '20px' },
    { name: '--radius-pille', value: '999px' },
    { name: '--text-held', value: '60px' },
    { name: '--gewicht-schwer', value: '800' },
    { name: '--zeile-eng', value: '1.05' },
    { name: '--spationierung-display', value: '-0.03em' },
    { name: '--schrift-display', value: '"Bricolage Grotesque", sans-serif' },
    { name: '--schatten-hart', value: '4px 4px 0 var(--tinte)' },
    { name: '--schatten-ki', value: '4px 4px 0 var(--ki)' },
    { name: '--feder', value: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    { name: '--t-schnell', value: '120ms' },
    { name: '--tinte', value: '#f2f0e3', scope: '[data-theme="dunkel"]' },
    { name: '--grund', value: '#12140c', scope: '[data-theme="dunkel"]' },
  ],
}

describe('value transforms', () => {
  it('pxToNumber_strips_unit', () => {
    expect(pxToNumber('16px')).toBe(16)
    expect(pxToNumber('999px')).toBe(999)
  })

  it('pxToNumber_rejects_non_px', () => {
    expect(() => pxToNumber('16')).toThrow(RangeError)
    expect(() => pxToNumber('1rem')).toThrow(RangeError)
  })

  it('msToNumber_strips_unit', () => {
    expect(msToNumber('120ms')).toBe(120)
  })

  it('msToNumber_rejects_non_ms', () => {
    expect(() => msToNumber('120')).toThrow(RangeError)
  })

  it('parseShadow_rejects_non_shadow', () => {
    expect(() => parseShadow('none', () => '#000')).toThrow(RangeError)
  })

  it('parseShadow_throws_on_unresolvable_colour', () => {
    const resolve = (): string => {
      throw new RangeError('unknown')
    }
    expect(() => parseShadow('4px 4px 0 var(--nope)', resolve)).toThrow(RangeError)
  })

  it('parseEasing_returns_four_tuple', () => {
    expect(parseEasing('cubic-bezier(0.34, 1.56, 0.64, 1)')).toStrictEqual([0.34, 1.56, 0.64, 1])
  })

  it('parseEasing_rejects_malformed', () => {
    expect(() => parseEasing('ease-in-out')).toThrow(RangeError)
  })

  it('parseEasing_rejects_wrong_arity', () => {
    expect(() => parseEasing('cubic-bezier(1, 2, 3)')).toThrow(RangeError)
  })

  it('parseShadow_becomes_rn_object_with_resolved_colour', () => {
    const s = parseShadow('4px 4px 0 var(--tinte)', () => '#191b12')
    expect(s).toStrictEqual({
      shadowColor: '#191b12',
      shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: 4,
    })
  })
})

describe('resolveColors', () => {
  it('applies_dark_overrides_over_base', () => {
    const base = [{ key: 'tinte', value: '#191b12', cssVar: '--tinte' }]
    const dark = [{ key: 'tinte', value: '#f2f0e3', cssVar: '--tinte' }]
    expect(resolveColors(base, dark)['tinte']).toBe('#f2f0e3')
    expect(resolveColors(base, [])['tinte']).toBe('#191b12')
  })
})

describe('buildRnTheme', () => {
  const theme = buildRnTheme(manifestToTokens(manifest))

  it('scales_are_numbers', () => {
    expect(theme.space['s4']).toBe(16)
    expect(theme.radius['pille']).toBe(999)
    expect(theme.size['held']).toBe(60)
    expect(theme.leading['eng']).toBe(1.05)
    expect(theme.duration['schnell']).toBe(120)
  })

  it('strings_stay_strings', () => {
    expect(theme.weight['schwer']).toBe('800')
    expect(theme.tracking['display']).toBe('-0.03em')
    expect(theme.font['display']).toBe('"Bricolage Grotesque", sans-serif')
  })

  it('easing_is_a_bezier_tuple', () => {
    expect(theme.easing['feder']).toStrictEqual([0.34, 1.56, 0.64, 1])
  })

  it('hard_shadow_flips_colour_between_modes', () => {
    // light ink shadow -> dark ink; dark theme flips --tinte to light ink
    expect(theme.light.shadow['hart']!.shadowColor).toBe('#191b12')
    expect(theme.dark.shadow['hart']!.shadowColor).toBe('#f2f0e3')
    // --schatten-ki always points at --ki, unaffected by theme
    expect(theme.light.shadow['ki']!.shadowColor).toBe('#7c5cff')
  })

  it('dark_colours_override_light', () => {
    expect(theme.light.color['grund']).toBe('#f4f2e9')
    expect(theme.dark.color['grund']).toBe('#12140c')
  })
})

describe('renderCss', () => {
  const css = renderCss(manifestToTokens(manifest))

  it('emits_root_and_dark_blocks', () => {
    expect(css).toContain(':root {')
    expect(css).toContain('[data-theme="dunkel"] {')
  })

  it('keeps_values_verbatim_including_var_refs', () => {
    expect(css).toContain('  --funke: #c9f229;')
    expect(css).toContain('  --schatten-hart: 4px 4px 0 var(--tinte);')
    expect(css).toContain('  --grund: #12140c;') // dark override present
  })
})
