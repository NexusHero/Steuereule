import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Ports & Adapters in `apps/api/src`, checked on every test run (ADR-0102).
 *
 *   1. SDK boundaries: each external SDK, and the database client, may be imported only by the files
 *      listed for it. Everything else reaches it through a port.
 *   2. Module coupling: the set of module → module imports is frozen in a baseline. A new edge is a
 *      decision that shows up in review; a removed edge must be struck from the baseline.
 *
 * Limits: imports are found by pattern, so a specifier computed at runtime is invisible.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const BASELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'architecture-module-edges.json')

interface Boundary {
  readonly name: string
  /** npm packages: an exact name, or a scope/prefix ending in `/`. */
  readonly packages?: readonly string[]
  /** Only these named imports of the packages cross the boundary (a namespace import counts as all of them). */
  readonly names?: readonly string[]
  /** Source files (relative to `src`) that count as part of this SDK when imported. */
  readonly internal?: (file: string) => boolean
  /** Who may import it: an exact file, a directory ending in `/`, or a suffix starting with `*`. */
  readonly allowedIn: readonly string[]
  readonly instead: string
}

const BOUNDARIES: readonly Boundary[] = [
  {
    name: 'database client',
    packages: ['@prisma/', '@prisma-keystore/', 'prisma-field-encryption', '@better-auth/prisma-adapter'],
    // PrismaModule is the one file of the directory a feature module may import: it only exports providers.
    internal: (file) => file.startsWith('prisma/') && file !== 'prisma/prisma.module.ts',
    allowedIn: [
      '*.prisma.ts',
      'prisma/',
      'auth/auth.module.ts',
      'auth/better-auth.ts',
      'config/assert-database-migrated.ts',
      'config/assert-database-role.ts',
      'config/assert-database-reachable.ts',
      'health/health.module.ts',
      'health/pooled-database-reachability-check.ts',
      'receipt/storage/postgres-bytea-storage.adapter.ts',
    ],
    instead: 'Depend on a repository port (*.repository.ts) or on TransactionRunner (common/transaction-runner.ts).',
  },
  {
    name: 'Prisma adapters',
    internal: (file) => file.endsWith('.prisma.ts'),
    // Modules bind a port to its adapter; better-auth runs the guest upgrade inside its own hook.
    allowedIn: ['*.module.ts', '*.prisma.ts', 'auth/better-auth.ts'],
    instead: 'Import the port next to it; only a *.module.ts names the adapter class.',
  },
  {
    name: 'LangChain',
    packages: ['@langchain/'],
    allowedIn: [
      'ki/advisor-prompt.ts',
      'ki/advisor-tool-round.ts',
      'ki/advisor-tools.ts',
      'ki/chat-model.factory.ts',
      'ki/fake-chat-model.ts',
      'ki/langchain-single-shot.adapter.ts',
      'ki/langgraph-advisor.engine.ts',
      'ki/tools/tool-call-context.ts',
    ],
    instead: 'Use SingleShotModel (ki/single-shot-model.ts) or the advisor engine port (ADR-0038).',
  },
  { name: 'Stripe', packages: ['stripe'], allowedIn: ['unlock/stripe-payment-provider.ts'], instead: 'Use PaymentProvider (unlock/payment-provider.ts).' },
  { name: 'nodemailer', packages: ['nodemailer'], allowedIn: ['auth/smtp-email-sender.ts'], instead: 'Use EmailSender (auth/email-sender.ts).' },
  {
    name: 'better-auth',
    packages: ['better-auth', '@better-auth/'],
    allowedIn: ['auth/', 'device/'],
    instead: 'Authentication lives in auth/ and device/; other modules read the user from the request (CurrentUser).',
  },
  { name: 'MCP SDK', packages: ['@modelcontextprotocol/'], allowedIn: ['mcp/'], instead: 'The MCP server is a driving adapter; keep its SDK in mcp/.' },
  {
    name: 'Redis client',
    packages: ['ioredis'],
    allowedIn: ['advisor/run/advisor-run-log.redis.ts', 'advisor/advisor.module.ts', 'auth/rate-limit-storage.ts', 'redis/redis-options.ts'],
    instead: 'Use AdvisorRunLog (advisor/run/advisor-run-log.ts), or the shared rate-limit storage (auth/rate-limit-storage.ts).',
  },
  { name: 'Playwright', packages: ['playwright-core'], allowedIn: ['account/export/pdf-renderer.playwright.ts'], instead: 'Use PdfRenderer (account/export/pdf-renderer.ts).' },
  { name: 'pdf-lib', packages: ['pdf-lib'], allowedIn: ['printout/form-renderer.ts'], instead: 'Call renderForms (printout/form-renderer.ts).' },
  { name: 'OpenTelemetry', packages: ['@opentelemetry/'], allowedIn: ['telemetry/'], instead: 'Use withSpan (telemetry/tracer.ts).' },
  {
    name: 'service locator',
    packages: ['@nestjs/core'],
    names: ['ModuleRef'],
    allowedIn: [],
    instead: 'Inject a port: a token and an interface owned by the consuming module, bound by the module that provides it.',
  },
  { name: 'child processes', packages: ['node:child_process'], allowedIn: ['business/elster-transmission.ts'], instead: 'An external process is an adapter of its own.' },
]

interface SourceImport {
  readonly from: string
  /** The npm package or `node:` module, when the specifier is not relative. */
  readonly pkg: string | null
  /** The source file under `src`, when the specifier is relative and resolves. */
  readonly file: string | null
  /** The imported bindings (`*` for a namespace or dynamic import); empty for a side-effect import. */
  readonly names?: readonly string[]
}

const STATIC_IMPORT = /^(?:import|export)\s+(?:type\s+)?(?:([\w*{}\s,$]+?)\s+from\s+)?['"]([^'"]+)['"]/gm
const DYNAMIC_IMPORT = /\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g

/** `A, { B, type C as D }` → `A`, `B`, `C`; `* as ns` → `*`. */
function importedNames(clause: string | undefined): string[] {
  if (clause === undefined) return []
  return clause
    .replace(/[{}]/g, ',')
    .split(',')
    .map((part) => part.trim().replace(/^type\s+/, ''))
    .filter((part) => part.length > 0)
    .map((part) => (part.startsWith('*') ? '*' : part.split(/\s+as\s+/)[0]!))
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [full] : []
  })
}

const rel = (file: string): string => path.relative(SRC, file).split(path.sep).join('/')

function resolveRelative(fromFile: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(fromFile), specifier.replace(/\.js$/, ''))
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return rel(candidate)
  }
  return null
}

function scanImports(): SourceImport[] {
  return sourceFiles(SRC).flatMap((file) => {
    const text = fs.readFileSync(file, 'utf8')
    const found = [
      ...[...text.matchAll(STATIC_IMPORT)].map((match) => ({ specifier: match[2]!, names: importedNames(match[1]) })),
      ...[...text.matchAll(DYNAMIC_IMPORT)].map((match) => ({ specifier: match[1]!, names: ['*'] })),
    ]
    return found.map(({ specifier, names }): SourceImport => {
      const relative = specifier.startsWith('.')
      return { from: rel(file), pkg: relative ? null : specifier, file: relative ? resolveRelative(file, specifier) : null, names }
    })
  })
}

const matchesPackage = (pkg: string, pattern: string): boolean =>
  pattern.endsWith('/') ? pkg.startsWith(pattern) : pkg === pattern || pkg.startsWith(`${pattern}/`)

const isAllowed = (file: string, allowedIn: readonly string[]): boolean =>
  allowedIn.some((entry) => (entry.startsWith('*') ? file.endsWith(entry.slice(1)) : entry.endsWith('/') ? file.startsWith(entry) : file === entry))

const namesOne = (imp: SourceImport, names: readonly string[] | undefined): boolean =>
  names === undefined || (imp.names ?? ['*']).some((name) => name === '*' || names.includes(name))

function crossesBoundary(imp: SourceImport, boundary: Boundary): boolean {
  if (imp.pkg !== null) return (boundary.packages ?? []).some((pattern) => matchesPackage(imp.pkg!, pattern)) && namesOne(imp, boundary.names)
  return imp.file !== null && boundary.internal?.(imp.file) === true
}

function boundaryViolations(imports: readonly SourceImport[], boundaries: readonly Boundary[] = BOUNDARIES): string[] {
  return boundaries.flatMap((boundary) =>
    imports
      .filter((imp) => crossesBoundary(imp, boundary) && !isAllowed(imp.from, boundary.allowedIn))
      .map((imp) => `${imp.from} imports ${imp.pkg ?? imp.file} (${boundary.name}). ${boundary.instead}`),
  )
}

/** `auth/guard.ts` belongs to module `auth`; `main.ts` and `app.module.ts` are the composition root. */
const moduleOf = (file: string): string | null => (file.includes('/') ? file.split('/')[0]! : null)

function moduleEdges(imports: readonly SourceImport[]): string[] {
  const edges = new Set<string>()
  for (const imp of imports) {
    const from = moduleOf(imp.from)
    const to = imp.file === null ? null : moduleOf(imp.file)
    if (from !== null && to !== null && from !== to) edges.add(`${from} -> ${to}`)
  }
  return [...edges].sort()
}

describe('apps/api dependency rules', () => {
  const imports = scanImports()

  it('reads the names an import binds', () => {
    expect(importedNames('{ ModuleRef, type Reflector as R }')).toEqual(['ModuleRef', 'Reflector'])
    expect(importedNames('Default, { A }')).toEqual(['Default', 'A'])
    expect(importedNames('* as core')).toEqual(['*'])
    expect(importedNames(undefined)).toEqual([])
  })

  it('finds the source tree', () => {
    expect(imports.length).toBeGreaterThan(2000)
    expect(imports.some((imp) => imp.pkg === '@prisma/client')).toBe(true)
    expect(imports.some((imp) => imp.file === 'prisma/prisma.service.ts')).toBe(true)
  })

  it('every SDK is imported only by the files listed for it', () => {
    expect(boundaryViolations(imports)).toEqual([])
  })

  it('no boundary lists a file that does not exist or no longer imports the SDK', () => {
    const stale = BOUNDARIES.flatMap((boundary) =>
      boundary.allowedIn
        .filter((entry) => !entry.startsWith('*') && !entry.endsWith('/'))
        .filter((file) => !imports.some((imp) => imp.from === file && crossesBoundary(imp, boundary)))
        .map((file) => `${boundary.name}: ${file}`),
    )
    expect(stale).toEqual([])
  })

  // The proof that the check can fail: the same function, fed imports that break each rule.
  it.each([
    ['a service importing the Prisma client', { from: 'rental/rental.service.ts', pkg: '@prisma/client', file: null }],
    ['a service importing the encrypted client provider', { from: 'rental/rental.service.ts', pkg: null, file: 'prisma/encrypted-prisma.provider.ts' }],
    ['a service importing the Prisma transaction runner', { from: 'mcp/mcp-report.service.ts', pkg: null, file: 'prisma/transaction.ts' }],
    ['a service naming a Prisma adapter class', { from: 'receipt/receipt.service.ts', pkg: null, file: 'receipt/receipt.repository.prisma.ts' }],
    ['a port importing its adapter', { from: 'account/account-deletion.repository.ts', pkg: null, file: 'account/delete-account-transaction.prisma.ts' }],
    ['a parser importing LangChain', { from: 'receipt/parse/auto-receipt-parse.strategy.ts', pkg: '@langchain/core/messages', file: null }],
    ['a new file in ki/ importing LangChain', { from: 'ki/single-shot-model.ts', pkg: '@langchain/core/messages', file: null }],
    ['a Prisma adapter importing LangChain', { from: 'advisor/advisor.repository.prisma.ts', pkg: '@langchain/openai', file: null }],
    ['a service importing Stripe', { from: 'unlock/unlock.service.ts', pkg: 'stripe', file: null }],
    ['a feature module importing better-auth', { from: 'cockpit/cockpit.controller.ts', pkg: 'better-auth/node', file: null }],
    ['a service importing the MCP SDK', { from: 'advisor/advisor.service.ts', pkg: '@modelcontextprotocol/sdk/server/mcp.js', file: null }],
    ['a service opening a Redis connection', { from: 'advisor/advisor.service.ts', pkg: 'ioredis', file: null }],
    ['a module looking up a provider through ModuleRef', { from: 'capital/capital.module.ts', pkg: '@nestjs/core', file: null, names: ['ModuleRef'] }],
    ['a namespace import of @nestjs/core', { from: 'printout/printout.module.ts', pkg: '@nestjs/core', file: null, names: ['*'] }],
  ] satisfies [string, SourceImport][])('flags %s', (_case, forbidden) => {
    expect(boundaryViolations([forbidden])).toHaveLength(1)
  })

  it.each([
    ['a Prisma adapter importing the client', { from: 'rental/rental.repository.prisma.ts', pkg: '@prisma/client', file: null }],
    ['a module binding its adapter', { from: 'rental/rental.module.ts', pkg: null, file: 'rental/rental.repository.prisma.ts' }],
    ['a module importing PrismaModule', { from: 'rental/rental.module.ts', pkg: null, file: 'prisma/prisma.module.ts' }],
    ['a service importing the transaction port', { from: 'advisor/advisor.service.ts', pkg: null, file: 'common/transaction-runner.ts' }],
    ['a file that only sounds like a package', { from: 'unlock/unlock.service.ts', pkg: 'stripe-like-helper', file: null }],
    ['a guard reading metadata through Reflector', { from: 'auth/require-scope.guard.ts', pkg: '@nestjs/core', file: null, names: ['Reflector'] }],
    ['the bootstrap creating the app', { from: 'main.ts', pkg: '@nestjs/core', file: null, names: ['NestFactory'] }],
  ] satisfies [string, SourceImport][])('accepts %s', (_case, allowed) => {
    expect(boundaryViolations([allowed])).toEqual([])
  })

  it('the module → module imports are exactly the baseline (UPDATE_ARCHITECTURE_BASELINE=1 rewrites it)', () => {
    const actual = moduleEdges(imports)
    if (process.env.UPDATE_ARCHITECTURE_BASELINE === '1') fs.writeFileSync(BASELINE, `${JSON.stringify(actual, null, 2)}\n`)
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) as string[]
    expect({ added: actual.filter((edge) => !baseline.includes(edge)), removed: baseline.filter((edge) => !actual.includes(edge)) }).toEqual({ added: [], removed: [] })
  })
})
