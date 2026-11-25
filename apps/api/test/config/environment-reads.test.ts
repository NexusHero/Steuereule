import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { API_PRODUCTION_SETTINGS, NON_PRODUCTION_VARIABLES } from '../../src/config/production-config.js'
import { findEnvironmentReads, type SourceFile } from './environment-reads.js'

/**
 * The lock of the one declared list (ADR-0111, "Configuration and deployment"): every environment variable a
 * source file of the API reads is declared in `API_PRODUCTION_SETTINGS`, with its production rule, or named in
 * `NON_PRODUCTION_VARIABLES`, with the reason it is no setting. A new `process.env.X`, a new
 * `positiveIntFromEnv('X', …)` fails here until it is declared; a declaration nothing reads fails too.
 */

const SRC = fileURLToPath(new URL('../../src', import.meta.url))
/** The module that holds the list. It reads every declared name to check it, which is no use of the value. */
const DECLARING_MODULE = 'config/production-config.ts'

function sourceFiles(directory: string): SourceFile[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    if (!/\.tsx?$/.test(entry.name) || /\.(test|spec|d)\.tsx?$/.test(entry.name)) return []
    return [{ file: relative(SRC, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }]
  })
}

const scan = (text: string, file = 'probe.ts') => findEnvironmentReads([{ file, text }])
const namesOf = (text: string) => [...new Set(scan(text).reads.map((read) => read.name))].sort()

describe('every environment variable the API reads is declared (ADR-0111)', () => {
  const found = findEnvironmentReads(sourceFiles(SRC))
  const declared = new Set(API_PRODUCTION_SETTINGS.map((setting) => setting.name))
  const nonProduction = new Set(NON_PRODUCTION_VARIABLES.map((variable) => variable.name))

  it('reads no variable that is neither a production setting nor a named non-production variable', () => {
    const unknown = found.reads.filter((read) => !declared.has(read.name) && !nonProduction.has(read.name)).map((read) => `${read.name} (${read.file})`)
    expect([...new Set(unknown)].sort(), 'declare each in src/config/production-config.ts: API_PRODUCTION_SETTINGS with its production rule, or NON_PRODUCTION_VARIABLES with the reason').toEqual([])
  })

  it('reads the environment under no name that cannot be determined from the source', () => {
    // The one place: the check reads each name of the two tables themselves, to take the snapshot it works on.
    expect(found.unresolved).toEqual([`${DECLARING_MODULE}: readSetting(name of names)`])
  })

  it('declares no variable that nothing reads', () => {
    const live = new Set(found.reads.filter((read) => read.file !== DECLARING_MODULE).map((read) => read.name))
    const stale = [...declared, ...nonProduction].filter((name) => !live.has(name))
    expect(stale, 'remove the entry, or it describes configuration that has no effect').toEqual([])
  })

  it('names each variable once', () => {
    const names = [...API_PRODUCTION_SETTINGS, ...NON_PRODUCTION_VARIABLES].map((entry) => entry.name)
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([])
  })

  it('finds the settings the application is known to read, in each form it reads them', () => {
    const names = new Set(found.reads.map((read) => read.name))
    // process.env.X, env.X on a parameter, this.env.X, a helper called with the name, a closure over env.
    for (const name of ['PORT', 'DATABASE_URL', 'AI_KILL_SWITCH', 'UPLOAD_MAX_IN_FLIGHT', 'ELSTER_CERT_PIN']) expect(names, name).toContain(name)
    expect(new Set(found.reads.map((read) => read.file)).size).toBeGreaterThan(25)
  })
})

describe('the scan sees every form of an environment read', () => {
  it('property and literal index on process.env, a parameter and a property', () => {
    expect(namesOf("const a = process.env.A; const b = process.env['B']; const c = process.env[`C`]")).toEqual(['A', 'B', 'C'])
    expect(namesOf('export function f(env: NodeJS.ProcessEnv = process.env) { return env.A?.trim() ?? env["B"] }')).toEqual(['A', 'B'])
    expect(namesOf('class S { private readonly env: Record<string, string | undefined>; m() { return this.env.A } }')).toEqual(['A'])
    expect(namesOf('function f(options: { env?: NodeJS.ProcessEnv }) { return (options.env ?? process.env).A }')).toEqual(['A'])
  })

  it('an environment object under another name: typed, assigned, or passed on', () => {
    expect(namesOf('function f(after: NodeJS.ProcessEnv) { return after.A }')).toEqual(['A'])
    expect(namesOf('const source = process.env; export const a = source.A')).toEqual(['A'])
    expect(namesOf('function read(settings: Record<string, string | undefined>) { return settings.A }\nread(process.env)')).toEqual(['A'])
    expect(namesOf('class S { constructor(private readonly values: NodeJS.ProcessEnv) {} m() { return this.values.A } }')).toEqual(['A'])
  })

  it('destructuring and the in operator', () => {
    expect(namesOf("const { A, B: renamed, 'C': c } = process.env")).toEqual(['A', 'B', 'C'])
    expect(namesOf('function f({ A }: NodeJS.ProcessEnv) { return A }')).toEqual(['A'])
    expect(namesOf("export const present = 'A' in process.env")).toEqual(['A'])
    expect(scan('const { A, ...rest } = process.env').unresolved).toEqual(['probe.ts: the rest of the environment in a destructuring pattern'])
  })

  it('a helper that takes the name: every call is a read of the name it passes', () => {
    const helper = 'function intFromEnv(name: string, fallback: number, env: NodeJS.ProcessEnv) { return Number(env[name]) || fallback }\n'
    expect(namesOf(`${helper}const a = intFromEnv('A', 1, process.env)`)).toEqual(['A'])
    expect(namesOf("const value = (key: string) => process.env[key]?.trim()\nconst a = value('A'), b = value('B')")).toEqual(['A', 'B'])
    expect(namesOf(`${helper}const flag = (name: string) => intFromEnv(name, 0, process.env) > 0\nconst a = flag('A')`)).toEqual(['A'])
    expect(scan(`${helper}const a = intFromEnv(pick(), 1, process.env)`).unresolved).toEqual(['probe.ts: intFromEnv(<CallExpression>)'])
  })

  it('an exported helper is followed into the files that call it, a local one is not', () => {
    const helper = { file: 'helper.ts', text: 'export function flag(name: string) { return process.env[name] === "1" }\nfunction local(name: string) { return process.env[name] }\nlocal("A")' }
    const caller = { file: 'caller.ts', text: 'import { flag } from "./helper.js"\nconst b = flag("B")\nconst c = local("C")' }
    const reads = findEnvironmentReads([helper, caller]).reads.map((read) => `${read.file}: ${read.name}`)
    expect(reads.sort()).toEqual(['caller.ts: B', 'helper.ts: A'])
  })

  it('names from a constant, a list of literals and a template of those', () => {
    expect(namesOf("const KEY = 'A'; const a = process.env[KEY]")).toEqual(['A'])
    expect(namesOf("const NAMES = ['A', 'B'] as const\nexport const set = NAMES.filter((name) => process.env[name] !== undefined)")).toEqual(['A', 'B'])
    expect(namesOf("for (const name of ['A', 'B']) console.log(process.env[name])")).toEqual(['A', 'B'])
    expect(namesOf("for (const slot of ['VISION', 'GUARD'] as const) console.log(process.env[`AI_${slot}_API_KEY`])")).toEqual(['AI_GUARD_API_KEY', 'AI_VISION_API_KEY'])
    const list = { file: 'names.ts', text: "export const NAMES = ['A', 'B'] as const" }
    const user = { file: 'user.ts', text: 'import { NAMES } from "./names.js"\nexport const set = NAMES.map((name) => process.env[name])' }
    expect(findEnvironmentReads([list, user]).reads.map((read) => read.name)).toEqual(['A', 'B'])
  })

  it('reports what it cannot name instead of passing it', () => {
    expect(scan('const a = process.env[compute()]').unresolved).toEqual(['probe.ts: process.env[<CallExpression>]'])
    expect(scan('function f(setting: { name: string }) { return process.env[setting.name] }').unresolved).toEqual(['probe.ts: process.env[setting.name]'])
    expect(scan('const local = compute(); const a = process.env[local]').unresolved).toEqual(['probe.ts: process.env[local]'])
    expect(scan('for (const name of names()) console.log(process.env[name])').unresolved).toEqual(['probe.ts: process.env[name of <CallExpression>]'])
    expect(scan('const copy = { ...process.env }').unresolved).toEqual(['probe.ts: ...process.env'])
    expect(scan('const names = Object.keys(process.env)').unresolved).toEqual(['probe.ts: Object.keys(…) on the environment'])
    expect(scan('for (const name in process.env) console.log(name)').unresolved).toEqual(['probe.ts: for … in process.env'])
  })

  it('does not take an object literal key or an unrelated property for a read', () => {
    expect(namesOf("spawn('x', { env: { PATH: '/bin' } }); const kind = config.environment.NAME")).toEqual([])
  })
})
