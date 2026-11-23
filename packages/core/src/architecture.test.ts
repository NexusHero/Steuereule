import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The dependency rules of `@steuereule/core`, checked on every test run (ADR-0102).
 *
 * The folders are layers, lowest first: math → common → domains → engine → interview. A folder
 * imports only from the folders below it, so there is no cycle between folders. What is enforced:
 *   1. the allowed directions between folders (`ALLOWED`), with no exceptions,
 *   2. no cycle of value imports between files,
 *   3. no tax year as a bare literal in a comparison outside `math/tax-parameters.ts`: a rule that
 *      changes with the year names that year there (`RULE_CHANGE_YEARS`, the `*_STEPS` tables).
 * Each rule is also shown to fail on a constructed violation (ADR-0021).
 */

const SRC = path.dirname(fileURLToPath(import.meta.url))
const LAYERS = ['math', 'common', 'domains', 'engine', 'interview'] as const
type Layer = (typeof LAYERS)[number]

/** Each folder may import the folders below it, never one above. */
const ALLOWED: Record<Layer, readonly Layer[]> = {
  math: [],
  common: ['math'],
  domains: ['math', 'common'],
  engine: ['math', 'common', 'domains'],
  interview: ['math', 'common', 'domains', 'engine'],
}

/** The one file where a year may be compared with a literal. */
const YEAR_PARAMETERS_FILE = 'math/tax-parameters.ts'

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

interface CrossLayerImport extends Import {
  readonly source: Layer
  readonly target: Layer
}

function crossLayerImports(imports: readonly Import[]): CrossLayerImport[] {
  return imports
    .map((imp) => ({ ...imp, source: layerOf(imp.from), target: layerOf(imp.to) }))
    .filter((imp): imp is CrossLayerImport => imp.source !== null && imp.target !== null && imp.target !== imp.source)
}

function folderViolations(imports: readonly Import[]): string[] {
  return crossLayerImports(imports)
    .filter((imp) => !ALLOWED[imp.source].includes(imp.target))
    .map((imp) => `${imp.from} -> ${imp.to}`)
}

/** A comparison operator (not the arrow `=>`) next to a four-digit year from 1900 to 2099. */
const YEAR_COMPARISON = /(?<![=!<>])(?:[<>]=?|[!=]==?)\s*\(?\s*(?:19|20)\d{2}\b(?![\d_.])|(?<![\d_.])\b(?:19|20)\d{2}\s*\)?\s*(?:[<>]=?|[!=]==?)(?![=>])/

/** Comments and quoted strings hold years as text; they are not code. Template literals stay, their `${…}` is code. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, (match) => match.replace(/[^\n]/g, ' '))
}

function yearComparisons(file: string, source: string): string[] {
  if (file === YEAR_PARAMETERS_FILE) return []
  return codeOf(source)
    .split('\n')
    .flatMap((line, index) => (YEAR_COMPARISON.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : []))
}

describe('@steuereule/core dependency rules', () => {
  const imports = scanImports()

  it('finds the source files, subfolders included', () => {
    expect(imports.length).toBeGreaterThan(300)
    expect(imports.some((imp) => imp.from.startsWith('domains/business/'))).toBe(true)
  })

  it('each folder imports only the folders below it', () => {
    expect(folderViolations(imports)).toEqual([])
  })

  it('the allowed directions form a strict order, so no folders can import each other', () => {
    for (const [index, layer] of LAYERS.entries()) {
      expect(ALLOWED[layer].every((target) => LAYERS.indexOf(target) < index)).toBe(true)
    }
  })

  it.each([
    ['domains/rental.ts', 'engine/tax-estimate.ts'],
    ['domains/employee.ts', 'interview/interview.ts'],
    ['engine/tax-estimate.ts', 'interview/cockpit.ts'],
    ['common/dates.ts', 'domains/children.ts'],
    ['math/tarif.ts', 'common/dates.ts'],
  ])('a constructed upward import %s -> %s is reported', (from, to) => {
    expect(folderViolations([{ from, to, typeOnly: true }])).toEqual([`${from} -> ${to}`])
  })

  it('a downward import is not reported', () => {
    expect(folderViolations([{ from: 'engine/tax-estimate.ts', to: 'domains/children.ts', typeOnly: false }])).toEqual([])
  })

  it('no cycle of value imports between files', () => {
    expect(cycles(imports.filter((imp) => !imp.typeOnly))).toEqual([])
  })

  it('a constructed cycle is found', () => {
    const edge = (from: string, to: string): Import => ({ from, to, typeOnly: false })
    expect(cycles([edge('domains/a.ts', 'domains/b.ts'), edge('domains/b.ts', 'domains/a.ts')])).toEqual([['domains/a.ts', 'domains/b.ts']])
  })

  it(`no year is compared with a bare literal outside ${YEAR_PARAMETERS_FILE}`, () => {
    const found = LAYERS.flatMap((layer) =>
      sourceFiles(path.join(SRC, layer)).flatMap((file) => yearComparisons(rel(file), fs.readFileSync(file, 'utf8'))),
    )
    expect(found).toEqual([])
  })

  it.each([
    'if (year >= 2025) return 0',
    'const fromNewRule = input.year < 2025',
    'return 2024 === year',
    'if ((input.year ?? 2026) >= 2023) put()',
    'const old = baujahr <= 1924',
    'const text = `${taxYear >= 2025 ? "a" : "b"}`',
  ])('a constructed year comparison is reported: %s', (line) => {
    expect(yearComparisons('domains/example.ts', line)).toHaveLength(1)
  })

  it.each([
    'const steps = [{ from: 2024, value: 1000 }]',
    'const pick = (year: number) => 2024',
    'if (amount >= 20_000) return',
    'if (amount > 2000.5) return',
    'if (appliesFrom(\'smallBusinessReform\', year)) return',
    '// until 2024: year <= 2024',
    "throw new RangeError('from 2023 a study counts only when year >= 2023')",
  ])('a line without a year comparison is not reported: %s', (line) => {
    expect(yearComparisons('domains/example.ts', line)).toEqual([])
  })

  it(`${YEAR_PARAMETERS_FILE} itself may compare years`, () => {
    expect(yearComparisons(YEAR_PARAMETERS_FILE, 'return year >= 2025')).toEqual([])
  })
})
