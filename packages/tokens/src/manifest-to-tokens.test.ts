import { describe, it, expect } from 'vitest'
import { classify, camel, manifestToTokens, type Manifest } from './manifest-to-tokens'

describe('camel', () => {
  it('hyphenated_becomes_camelCase', () => {
    expect(camel('funke-hell')).toBe('funkeHell')
    expect(camel('tinte-2')).toBe('tinte2')
    expect(camel('hart-s')).toBe('hartS')
  })

  it('single_word_unchanged', () => {
    expect(camel('grund')).toBe('grund')
  })
})

describe('classify', () => {
  it.each([
    ['--grund', 'color', 'grund'],
    ['--tinte-2', 'color', 'tinte2'],
    ['--nacht-text', 'color', 'nachtText'], // manifest mislabels kind=font; name wins
    ['--schatten-hart', 'shadow', 'hart'],
    ['--schatten-hart-l', 'shadow', 'hartL'],
    ['--schrift-display', 'font', 'display'],
    ['--text-2xl', 'size', '2xl'],
    ['--gewicht-schwer', 'weight', 'schwer'],
    ['--zeile-eng', 'leading', 'eng'],
    ['--spationierung-label', 'tracking', 'label'],
    ['--radius', 'radius', 'm'],
    ['--radius-pille', 'radius', 'pille'],
    ['--s4', 'space', 's4'],
    ['--kontur', 'space', 'kontur'],
    ['--t-schnell', 'duration', 'schnell'],
    ['--feder', 'easing', 'feder'],
  ])('%s -> %s.%s', (cssVar, group, key) => {
    expect(classify(cssVar)).toStrictEqual({ group, key })
  })
})

describe('manifestToTokens', () => {
  const manifest: Manifest = {
    tokens: [
      { name: '--grund', value: '#f4f2e9' },
      { name: '--funke', value: '#c9f229' },
      { name: '--s4', value: '16px' },
      { name: '--radius', value: '20px' },
      { name: '--schatten-hart', value: '4px 4px 0 var(--tinte)' },
      { name: '--tinte', value: '#191b12' },
      // dark overrides
      { name: '--grund', value: '#12140c', scope: '[data-theme="dunkel"]' },
      { name: '--tinte', value: '#f2f0e3', scope: '[data-theme="dunkel"]' },
    ],
  }

  it('routes_light_tokens_into_grouped_base', () => {
    const n = manifestToTokens(manifest)
    expect(n.base.color).toContainEqual({ key: 'grund', value: '#f4f2e9', cssVar: '--grund' })
    expect(n.base.space).toContainEqual({ key: 's4', value: '16px', cssVar: '--s4' })
    expect(n.base.radius).toContainEqual({ key: 'm', value: '20px', cssVar: '--radius' })
    expect(n.base.shadow).toHaveLength(1)
  })

  it('routes_scoped_tokens_into_dark_overrides', () => {
    const n = manifestToTokens(manifest)
    expect(n.darkColors).toContainEqual({ key: 'grund', value: '#12140c', cssVar: '--grund' })
    expect(n.darkColors).toContainEqual({ key: 'tinte', value: '#f2f0e3', cssVar: '--tinte' })
    expect(n.darkColors).toHaveLength(2)
  })
})
