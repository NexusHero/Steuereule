import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ANNEXES } from '@steuereule/core'
import de from './locales/de.json'
import en from './locales/en.json'
import { GAP_LABEL } from '../screens/children/childrenModel'

// Every i18n key the app asks for exists in both languages (WEB-17, H2-3, H2-5): a missing key shows
// its raw id or a German inline default, also to an English user. Static keys are read from the source;
// keys built at run time are checked for the families whose members are known (annexes, printout
// fields, child gaps).
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = path.resolve(SRC, '../../..')

type Tree = { readonly [key: string]: unknown }

function has(tree: Tree, key: string): boolean {
  let node: unknown = tree
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in (node as Tree))) return false
    node = (node as Tree)[part]
  }
  return true
}

/** A plural key (`count_one`, `count_other`) is used under its base name. */
const exists = (tree: Tree, key: string) => has(tree, key) || has(tree, `${key}_one`) || has(tree, `${key}_other`)

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })
}

/** `t('a.b')` / `tr("a.b", …)`: literal keys with a dot, outside another namespace (`ui:`). */
function staticKeys(): Map<string, string> {
  const keys = new Map<string, string>()
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\b(?:t|tr)\(\s*(['"`])([A-Za-z0-9_.-]+)\1/g)) {
      const key = match[2]!
      if (key.includes('.') && !keys.has(key)) keys.set(key, path.relative(SRC, file))
    }
  }
  return keys
}

function printoutFieldIds(): string[] {
  return [2024, 2025].flatMap((year) => {
    const set = JSON.parse(readFileSync(path.join(REPO, `apps/api/src/printout/felder-${year}.json`), 'utf8')) as { felder: { id: string }[] }
    return set.felder.map((field) => field.id)
  })
}

describe('every i18n key the app uses exists', () => {
  const used = staticKeys()

  it('finds the keys it checks', () => {
    expect(used.size).toBeGreaterThan(1000)
  })

  for (const [name, locale] of [['de.json', de], ['en.json', en]] as const) {
    it(`static keys in ${name}`, () => {
      const missing = [...used].filter(([key]) => !exists(locale, key)).map(([key, file]) => `${key} (${file})`)
      expect(missing).toEqual([])
    })

    it(`run-time families in ${name}: annexes, printout field names, child gaps`, () => {
      const keys = [
        ...ANNEXES.map((annex) => `bestaetigung.anlagen.${annex}`),
        ...[...new Set(printoutFieldIds())].map((id) => `ausdruck.feldNamen.${id.replace('.', '_')}`),
        ...Object.keys(GAP_LABEL).map((gap) => `kinder.lueckeFeld.${gap}`),
      ]
      expect(keys.filter((key) => !exists(locale, key))).toEqual([])
    })
  }
})

describe('texts that state figures take them from @steuereule/core', () => {
  it('the owl consent names its providers through a placeholder, never one fixed company (LEGAL-2)', () => {
    for (const key of ['owlPersonalData.card.body', 'owlPersonalData.section.body', 'advisor.chat.privacyNotice'] as const) {
      const [group, ...rest] = key.split('.')
      const text = rest.reduce<unknown>((node, part) => (node as Tree)[part], (de as Tree)[group!]) as string
      expect(text, key).toContain('{{providers}}')
      expect(text, key).not.toMatch(/Gemini|Anthropic|OpenAI/)
    }
  })

  it('no text writes a file size of its own; the receipt limit is the `receiptFileSize` placeholder', () => {
    for (const locale of [de, en]) {
      expect(JSON.stringify(locale)).not.toMatch(/\d\s?(MB|GB)\b/)
      expect((locale as Tree as { apiFehler: { tooLarge: string } }).apiFehler.tooLarge).toContain('{{receiptFileSize}}')
    }
  })

  it('the deletion warning prints backup and hold periods through placeholders (LEGAL-4)', () => {
    const text = de.datenschutz.delete.offer.warning1
    for (const placeholder of ['{{backupDays}}', '{{paymentYears}}', '{{filingYears}}']) expect(text).toContain(placeholder)
  })
})
