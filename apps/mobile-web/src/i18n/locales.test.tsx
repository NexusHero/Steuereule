import { describe, expect, it } from 'vitest'
import de from './locales/de.json'
import en from './locales/en.json'

/** A text, a list of texts (read with `returnObjects`), or a nested group. */
type Tree = { readonly [key: string]: string | readonly string[] | Tree }

/** Every leaf as `path → text`, e.g. `ausdruck.direkteingabe.gespeichert → "Gespeichert."`. */
function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else if (Array.isArray(value)) value.forEach((text, index) => out.set(`${path}[${index}]`, text))
    else for (const [p, v] of leaves(value as Tree, path)) out.set(p, v)
  }
  return out
}

const placeholders = (text: string): string[] => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!).sort()

describe('translation files', () => {
  const german = leaves(de)
  const english = leaves(en)

  it('have the same keys in German and English', () => {
    expect([...english.keys()].filter((k) => !german.has(k)), 'only in en.json').toEqual([])
    expect([...german.keys()].filter((k) => !english.has(k)), 'only in de.json').toEqual([])
  })

  it('use the same placeholders in both languages', () => {
    const mismatched = [...german].filter(([key, text]) => english.has(key) && placeholders(text).join() !== placeholders(english.get(key)!).join())
    expect(mismatched.map(([key]) => key)).toEqual([])
  })
})
