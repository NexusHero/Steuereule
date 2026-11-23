import { describe, expect, it } from 'vitest'
import { containsControlOrBrokenUnicode } from '../src/common/no-control-characters.validator.js'

// ADR-0104 L4 — free-text profile fields must reject control bytes and broken Unicode.
describe('containsControlOrBrokenUnicode', () => {
  it('flags a null byte and other C0/C1 control chars + DEL', () => {
    expect(containsControlOrBrokenUnicode('a\u0000b')).toBe(true)
    expect(containsControlOrBrokenUnicode('tab\there')).toBe(true)
    expect(containsControlOrBrokenUnicode('new\nline')).toBe(true)
    expect(containsControlOrBrokenUnicode('del\u007f')).toBe(true)
    expect(containsControlOrBrokenUnicode('c1\u0085')).toBe(true)
  })

  it('flags unpaired UTF-16 surrogates', () => {
    expect(containsControlOrBrokenUnicode('\uD800')).toBe(true) // lone high
    expect(containsControlOrBrokenUnicode('\uDC00')).toBe(true) // lone low
    expect(containsControlOrBrokenUnicode('a\uD800b')).toBe(true)
  })

  it('accepts ordinary text, accents, and valid astral characters (surrogate pairs)', () => {
    expect(containsControlOrBrokenUnicode('Anna Beispiel')).toBe(false)
    expect(containsControlOrBrokenUnicode('Müller-Lüdenscheidt')).toBe(false)
    expect(containsControlOrBrokenUnicode('𝕏 👾💥')).toBe(false) // valid surrogate pairs
    expect(containsControlOrBrokenUnicode('')).toBe(false)
  })
})
