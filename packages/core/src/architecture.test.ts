import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The dependency rules of `@steuereule/core`, checked on every test run (ADR-0102).
 *
 * The five folders are themes, not strict layers: `engine` orchestrates rules from `domains`,
 * and some `domains` verticals build on the calculation model in `engine`. What holds, and is
 * enforced here:
 *   1. the allowed directions between folders (`ALLOWED`),
 *   2. the known imports against the intended order interview → engine → domains → common → math
 *      (`BACKWARD`): a list of files that may only shrink,
 *   3. no cycle of value imports between files.
 */

const SRC = path.dirname(fileURLToPath(import.meta.url))
const LAYERS = ['math', 'common', 'domains', 'engine', 'interview'] as const
type Layer = (typeof LAYERS)[number]

/** Every direction that exists today. A new direction is a design decision, not a side effect. */
const ALLOWED: Record<Layer, readonly Layer[]> = {
  math: [],
  common: ['math'],
  domains: ['math', 'common', 'engine', 'interview'],
  engine: ['math', 'common', 'domains'],
  interview: ['math', 'common', 'domains', 'engine'],
}

/**
 * Files that import against the intended order. Each entry is debt: `domains` reaching up into
 * `engine` for the calculation model and the assessment types, and into `interview` for the
 * answer model. Remove an entry when its file is fixed; never add one.
 */
const BACKWARD: Record<string, readonly string[]> = {
  'domains->engine': [
    'domains/assessment-notice.ts',
    'domains/capital.ts',
    'domains/cross-border.ts',
    'domains/exchange-rate.ts',
    'domains/history-groups.ts',
    'domains/history-patterns.ts',
    'domains/history-years.ts',
    'domains/pension.ts',
    'domains/recurring-items.ts',
    'domains/rental.ts',
    'domains/submission.ts',
    'domains/takeover.ts',
    'domains/year-history.ts',
  ],
  'domains->interview': [
    'domains/cross-border.ts',
    'domains/employee.ts',
    'domains/extraordinary-burdens.ts',
    'domains/filing-obligation.ts',
    'domains/health-insurance.ts',
    'domains/household-services.ts',
    'domains/income-types.ts',
    'domains/receipt-processing.ts',
    'domains/recurring-items.ts',
    'domains/self-paid-provision.ts',
  ],
}

interface Import {
  readonly from: string
  readonly to: string
  readonly typeOnly: boolean
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    const isSource = entry.name.endsWith('.ts') && !/\.(test|bench|d)\.ts$/.test(entry.name)
    return isSource ? [full] : []
  })
}

const rel = (file: string): string => path.relative(SRC, file).split(path.sep).join('/')
const layerOf = (file: string): Layer | null => {
  const top = file.split('/')[0] as Layer
  return LAYERS.includes(top) ? top : null
}

function resolveImport(fromFile: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(fromFile), specifier)
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts'), base]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

/** Static `import`/`export … from` statements with a relative specifier. The clause may span lines. */
const IMPORT = /^(?:import|export)\s+(type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm

function scanImports(): Import[] {
  return LAYERS.flatMap((layer) =>
    sourceFiles(path.join(SRC, layer)).flatMap((file) => {
      const found: Import[] = []
      for (const match of fs.readFileSync(file, 'utf8').matchAll(IMPORT)) {
        const target = resolveImport(file, match[2]!)
        if (target) found.push({ from: rel(file), to: rel(target), typeOnly: match[1] !== undefined })
      }
      return found
    }),
  )
}

/** Strongly connected components with more than one file (Tarjan). */
function cycles(edges: readonly Import[]): string[][] {
  const graph = new Map<string, string[]>()
  for (const { from, to } of edges) {
    graph.set(from, [...(graph.get(from) ?? []), to])
    if (!graph.has(to)) graph.set(to, [])
  }
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const found: string[][] = []
  const visit = (node: string): void => {
    index.set(node, index.size)
    low.set(node, index.get(node)!)
    stack.push(node)
    onStack.add(node)
    for (const next of graph.get(node)!) {
      if (!index.has(next)) {
        visit(next)
        low.set(node, Math.min(low.get(node)!, low.get(next)!))
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, index.get(next)!))
      }
    }
    if (low.get(node) !== index.get(node)) return
    const component: string[] = []
    let member: string
    do {
      member = stack.pop()!
      onStack.delete(member)
      component.push(member)
    } while (member !== node)
    if (component.length > 1) found.push(component.sort())
  }
  for (const node of graph.keys()) if (!index.has(node)) visit(node)
  return found
}

describe('@steuereule/core dependency rules', () => {
  const imports = scanImports()
  const crossLayer = imports
    .map((imp) => ({ ...imp, source: layerOf(imp.from)!, target: layerOf(imp.to) }))
    .filter((imp): imp is typeof imp & { target: Layer } => imp.target !== null && imp.target !== imp.source)

  it('finds the source files, subfolders included', () => {
    expect(imports.length).toBeGreaterThan(300)
    expect(imports.some((imp) => imp.from.startsWith('domains/business/'))).toBe(true)
  })

  it('math imports nothing outside math, and common only math', () => {
    expect(crossLayer.filter((imp) => imp.source === 'math')).toEqual([])
    expect(crossLayer.filter((imp) => imp.source === 'common' && imp.target !== 'math')).toEqual([])
  })

  it('only the allowed directions between folders exist', () => {
    const forbidden = crossLayer.filter((imp) => !ALLOWED[imp.source].includes(imp.target))
    expect(forbidden.map((imp) => `${imp.from} -> ${imp.to}`)).toEqual([])
  })

  it.each(Object.keys(BACKWARD))('%s: the files importing against the intended order are exactly the known ones', (pair) => {
    const [source, target] = pair.split('->')
    const actual = [...new Set(crossLayer.filter((imp) => imp.source === source && imp.target === target).map((imp) => imp.from))].sort()
    // Fails in both directions: a new file is new debt, a missing one must be struck from the list.
    expect(actual).toEqual([...BACKWARD[pair]!].sort())
  })

  it('no cycle of value imports between files', () => {
    expect(cycles(imports.filter((imp) => !imp.typeOnly))).toEqual([])
  })
})
