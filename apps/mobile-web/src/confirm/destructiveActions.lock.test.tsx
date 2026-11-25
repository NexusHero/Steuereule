// Lock for WEB-37 / WEB-38 / WEB-18: every destructive or final mask action asks through the shared confirm
// dialog. The registry names each action, its screen and its button; this test keeps registry and screens
// in step and fails when a destructive mutation hook appears in a screen without being registered.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import de from '../i18n/locales/de.json'
import en from '../i18n/locales/en.json'
import { DESTRUCTIVE_ACTIONS, UNCONFIRMED_DESTRUCTIVE_MUTATIONS, type DestructiveActionId } from './destructiveActions'

const APP_ROOT = join(__dirname, '..', '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.startsWith('test-') ? [path] : []
  })
}

const FILES = [...sourceFiles(join(APP_ROOT, 'src')), join(APP_ROOT, 'App.tsx')].map((path) => ({ path: relative(APP_ROOT, path), text: readFileSync(path, 'utf8') }))

/** Generated mutation hooks whose name says they remove, end or finalise something. */
const DESTRUCTIVE_HOOK = /\buse[A-Z]\w*Controller(?:\w*(?:Delete|Remove|Reverse|Lock|Dispose|Ignore|Leave|EndPartner|Revoke|Withdraw|Decide|Clear|Dismiss|CarryForward|Transmit|BookDepreciation|Submit)\w*)\b/g

const ids = Object.keys(DESTRUCTIVE_ACTIONS) as DestructiveActionId[]

function copy(locale: unknown, id: string): Record<string, unknown> | undefined {
  return (locale as { rueckfrage?: Record<string, Record<string, unknown>> }).rueckfrage?.[id]
}

describe('destructive mask actions ask first (WEB-37, WEB-38)', () => {
  it.each(ids)('%s: its screen asks through the shared dialog, from its button', (id) => {
    const action = DESTRUCTIVE_ACTIONS[id]
    const file = FILES.find((f) => f.path === action.screen)
    expect(file, `${action.screen} exists`).toBeDefined()
    expect(file!.text).toContain(`useConfirmAction('${id}')`)
    expect(file!.text).toContain(action.trigger)
  })

  it.each(ids)('%s: says in German and English what is lost or final', (id) => {
    for (const locale of [de, en]) {
      const text = copy(locale, id)
      for (const key of ['titel', 'text', 'bestaetigen']) expect(typeof text?.[key], `rueckfrage.${id}.${key}`).toBe('string')
    }
    if (DESTRUCTIVE_ACTIONS[id].tone === 'final') expect(String(copy(de, id)?.text)).toMatch(/endgültig/)
  })

  it('no screen uses useConfirmAction with an id outside the registry', () => {
    const used = FILES.flatMap((f) => [...f.text.matchAll(/useConfirmAction\('(\w+)'\)/g)].map((m) => m[1]!))
    expect(used.filter((id) => !(id in DESTRUCTIVE_ACTIONS))).toEqual([])
  })

  it('every destructive mutation hook a screen uses is registered or excused', () => {
    const registered = new Set(ids.flatMap((id) => DESTRUCTIVE_ACTIONS[id].mutations as readonly string[]))
    const unlisted = FILES.flatMap((f) => [...f.text.matchAll(DESTRUCTIVE_HOOK)].map((m) => ({ hook: m[0], file: f.path })))
      .filter(({ hook }) => !registered.has(hook) && !(hook in UNCONFIRMED_DESTRUCTIVE_MUTATIONS))
    expect(unlisted).toEqual([])
  })

  it('a registered mutation hook is used where its screen asks (or the screen it is passed into)', () => {
    const all = FILES.map((f) => f.text).join('\n')
    for (const id of ids) for (const hook of DESTRUCTIVE_ACTIONS[id].mutations) expect(all, `${id} → ${hook}`).toContain(hook)
  })
})
