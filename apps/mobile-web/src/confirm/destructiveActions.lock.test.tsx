// Lock for WEB-37 / WEB-38 / WEB-18: every destructive or final mask action asks through the shared confirm
// dialog. Which operations are destructive is read from the API's own declaration, the OpenAPI document the
// generated client comes from: every DELETE and every write marked `x-destructive` (`@Destructive()` in
// apps/api). A source file that calls one of them must be the registered screen that asks for it, a file
// that hands it to that screen, or an excused row; the registry names each action, its screen and its button.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as apiClient from '@steuereule/api-client'
import de from '../i18n/locales/de.json'
import en from '../i18n/locales/en.json'
import { DESTRUCTIVE_ACTIONS, UNCONFIRMED_DESTRUCTIVE_MUTATIONS, type DestructiveAction, type DestructiveActionId } from './destructiveActions'

const APP_ROOT = join(__dirname, '..', '..')
const OPENAPI = join(APP_ROOT, '..', 'api', 'openapi.json')
const REGISTRY_FILE = 'src/confirm/destructiveActions.ts'

interface SourceFile {
  readonly path: string
  readonly text: string
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.startsWith('test-') ? [path] : []
  })
}

const FILES: readonly SourceFile[] = [...sourceFiles(join(APP_ROOT, 'src')), join(APP_ROOT, 'App.tsx')].map((path) => ({
  path: relative(APP_ROOT, path),
  text: readFileSync(path, 'utf8'),
}))

interface OpenApiOperation {
  readonly operationId?: string
  readonly 'x-destructive'?: boolean
}
interface OpenApiDocument {
  readonly paths: Readonly<Record<string, Readonly<Record<string, OpenApiOperation>>>>
}

/** A destructive operation, named the way orval names its generated functions. */
interface DestructiveOperation {
  readonly hook: string
  /** Every name a source file can call it by: the hook, the plain function, the mutation options. */
  readonly pattern: RegExp
}

const WRITE_METHODS = new Set(['post', 'put', 'patch'])

/** Every DELETE, and every write the API marks `x-destructive`. */
function destructiveOperations(spec: OpenApiDocument): DestructiveOperation[] {
  return Object.values(spec.paths)
    .flatMap((ops) => Object.entries(ops))
    .filter(([method, op]) => method === 'delete' || (WRITE_METHODS.has(method) && op['x-destructive'] === true))
    .map(([method, op]) => {
      if (op.operationId === undefined) throw new Error(`a ${method} operation without an operationId`)
      const pascal = op.operationId.replace(/_(\w)/, (_, c: string) => c.toUpperCase())
      const plain = pascal[0]!.toLowerCase() + pascal.slice(1)
      return { hook: `use${pascal}`, pattern: new RegExp(`\\b(?:use${pascal}|${plain}|get${pascal}MutationOptions)\\b`) }
    })
}

/** The calls of a destructive operation that do not go through its confirmation. */
function unconfirmedCalls(
  files: readonly SourceFile[],
  operations: readonly DestructiveOperation[],
  registry: Readonly<Record<string, DestructiveAction>>,
  excused: Readonly<Record<string, string>>,
): { readonly file: string; readonly hook: string }[] {
  const asks = (file: SourceFile, hook: string) =>
    Object.entries(registry).some(
      ([id, action]) =>
        action.mutations.includes(hook) &&
        ((file.path === action.screen && file.text.includes(`useConfirmAction('${id}')`)) || (action.calledFrom ?? []).includes(file.path)),
    )
  return files
    .filter((file) => file.path !== REGISTRY_FILE)
    .flatMap((file) => operations.filter((op) => op.pattern.test(file.text)).map((op) => ({ file, hook: op.hook })))
    .filter(({ file, hook }) => excused[hook] === undefined && !asks(file, hook))
    .map(({ file, hook }) => ({ file: file.path, hook }))
}

const OPERATIONS = destructiveOperations(JSON.parse(readFileSync(OPENAPI, 'utf8')) as OpenApiDocument)
const DESTRUCTIVE_HOOKS = new Set(OPERATIONS.map((op) => op.hook))

const ids = Object.keys(DESTRUCTIVE_ACTIONS) as DestructiveActionId[]
const REGISTRY: Readonly<Record<string, DestructiveAction>> = DESTRUCTIVE_ACTIONS

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

  it('the API declares destructive operations, and each one is a hook of the generated client', () => {
    expect(OPERATIONS.length).toBeGreaterThan(0)
    const exported = apiClient as unknown as Readonly<Record<string, unknown>>
    expect(OPERATIONS.filter((op) => typeof exported[op.hook] !== 'function').map((op) => op.hook)).toEqual([])
  })

  it('every call of a destructive operation goes through its confirmation', () => {
    expect(unconfirmedCalls(FILES, OPERATIONS, REGISTRY, UNCONFIRMED_DESTRUCTIVE_MUTATIONS)).toEqual([])
  })

  it('the registry and the excused rows name only operations the API declares destructive', () => {
    const named = [...ids.flatMap((id) => DESTRUCTIVE_ACTIONS[id].mutations as readonly string[]), ...Object.keys(UNCONFIRMED_DESTRUCTIVE_MUTATIONS)]
    expect(named.filter((hook) => !DESTRUCTIVE_HOOKS.has(hook))).toEqual([])
  })

  it('a registered mutation is called in its screen or in a file that hands it to the screen', () => {
    for (const id of ids) {
      const action: DestructiveAction = DESTRUCTIVE_ACTIONS[id]
      const holders = FILES.filter((f) => f.path === action.screen || (action.calledFrom ?? []).includes(f.path))
      for (const hook of action.mutations) expect(holders.some((f) => f.text.includes(hook)), `${id} → ${hook}`).toBe(true)
    }
  })

  it('an excused mutation is one a screen really calls', () => {
    const screens = FILES.filter((f) => f.path !== REGISTRY_FILE)
    expect(Object.keys(UNCONFIRMED_DESTRUCTIVE_MUTATIONS).filter((hook) => !screens.some((f) => f.text.includes(hook)))).toEqual([])
  })
})

describe('the destructive-action lock can fail', () => {
  const spec: OpenApiDocument = {
    paths: {
      '/v1/things/{id}': { get: { operationId: 'ThingController_read' }, delete: { operationId: 'ThingController_delete' } },
      '/v1/things/{id}/storno': { post: { operationId: 'ThingController_reverse', 'x-destructive': true } },
      '/v1/things': { post: { operationId: 'ThingController_create' } },
    },
  }
  const operations = destructiveOperations(spec)
  const registry: Readonly<Record<string, DestructiveAction>> = {
    thingDelete: { tone: 'destructive', screen: 'src/ThingScreen.tsx', trigger: 'thing-delete', mutations: ['useThingControllerDelete'], calledFrom: ['src/useThings.ts'] },
  }

  it('reads every DELETE and every write marked x-destructive, and nothing else', () => {
    expect(operations.map((op) => op.hook)).toEqual(['useThingControllerDelete', 'useThingControllerReverse'])
  })

  it('flags a file that calls a destructive mutation without asking', () => {
    const files = [
      { path: 'src/OtherScreen.tsx', text: 'const remove = useThingControllerDelete()' },
      { path: 'src/ThingScreen.tsx', text: 'const remove = useThingControllerDelete() // the registered screen, but it does not ask' },
      { path: 'src/plain.ts', text: 'await thingControllerReverse(1)' },
      { path: 'src/options.ts', text: 'useMutation(getThingControllerReverseMutationOptions())' },
    ]
    expect(unconfirmedCalls(files, operations, registry, {})).toEqual([
      { file: 'src/OtherScreen.tsx', hook: 'useThingControllerDelete' },
      { file: 'src/ThingScreen.tsx', hook: 'useThingControllerDelete' },
      { file: 'src/plain.ts', hook: 'useThingControllerReverse' },
      { file: 'src/options.ts', hook: 'useThingControllerReverse' },
    ])
  })

  it('accepts the screen that asks, the file that hands the mutation to it, and an excused call', () => {
    const files = [
      { path: 'src/ThingScreen.tsx', text: "const confirm = useConfirmAction('thingDelete'); const remove = useThingControllerDelete()" },
      { path: 'src/useThings.ts', text: 'const remove = useThingControllerDelete()' },
      { path: 'src/Elsewhere.tsx', text: 'const reverse = useThingControllerReverse()' },
      { path: 'src/Create.tsx', text: 'const create = useThingControllerCreate()' },
    ]
    expect(unconfirmedCalls(files, operations, registry, { useThingControllerReverse: 'asks on its own' })).toEqual([])
  })
})
