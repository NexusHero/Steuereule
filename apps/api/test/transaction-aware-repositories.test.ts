// Which repositories may use the plain PrismaService (MCP-22). Only the ENCRYPTED_PRISMA client joins a
// `TransactionRunner.run` (prisma/transaction.ts); a repository on the plain client writes past the transaction,
// so a simulation (`auswirkung_simulieren`) or a rolled-back unit of work would keep its writes. Every repository
// on the plain client is named here with why no transactional write reaches it; a new one fails until decided.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

const ON_THE_PLAIN_CLIENT: Readonly<Record<string, string>> = {
  'auth/bearer-token.repository.prisma.ts': 'the guard reads tokens before any handler runs; no unit of work writes them',
  'auth/step-up-grant.repository.prisma.ts': 'step-up grants of the sign-in; outside every tax-data unit of work',
  'assistenten/assistenten.repository.prisma.ts': 'lists and revokes connected assistants; no simulation or batch reaches it',
  'device/device-code.repository.prisma.ts': 'device sign-in codes; outside every tax-data unit of work',
  'guest/guest-activity.repository.prisma.ts': 'the guest sweep the guard starts; it must not wait for or roll back with a request',
  'owl-mode/owl-mode.repository.prisma.ts': 'owl settings and dismissed cards; no field write reaches it',
  'owl-mode/personal-data-consent.repository.prisma.ts': 'read before a write to know the consent; written only by its own route',
  'takeover/year-takeover.repository.prisma.ts': 'written only by the year carry-over route, never inside a simulation',
  'unlock/unlock.repository.prisma.ts': 'the paid unlock; Stripe webhook and checkout, never inside a simulation',
}

/** The repositories the confirmation path writes through (FieldAccess): a simulation reaches every one of them. */
const FIELD_ACCESS_REPOSITORIES = [
  'lstb/lstb.repository.prisma.ts',
  'pension/pension.repository.prisma.ts',
  'capital/capital.repository.prisma.ts',
  'rental/rental.repository.prisma.ts',
  'profile/profile.repository.prisma.ts',
  'master-data/master-data.repository.prisma.ts',
  'link/link.repository.prisma.ts',
  'interview/interview-answer.repository.prisma.ts',
  'ch-salary-certificate/ch-salary-certificate.repository.prisma.ts',
  'children/child.repository.prisma.ts',
  'commute/commute.repository.prisma.ts',
  'assessment/assessment.repository.prisma.ts',
  'marking/marking.repository.prisma.ts',
  'household-core/household.repository.prisma.ts',
]

function prismaAdapters(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return prismaAdapters(full)
    return entry.name.endsWith('.prisma.ts') ? [path.relative(SRC, full).split(path.sep).join('/')] : []
  })
}

const injectsPlainClient = (file: string): boolean => /@Inject\(PrismaService\)/.test(fs.readFileSync(path.join(SRC, file), 'utf8'))

describe('repositories and the transaction', () => {
  it('only the repositories named here use the plain client', () => {
    expect(prismaAdapters(SRC).filter(injectsPlainClient).sort()).toEqual(Object.keys(ON_THE_PLAIN_CLIENT).sort())
  })

  it('every repository a simulated write reaches joins the transaction (MCP-22)', () => {
    const missing = FIELD_ACCESS_REPOSITORIES.filter((file) => !fs.existsSync(path.join(SRC, file)))
    expect(missing).toEqual([])
    expect(FIELD_ACCESS_REPOSITORIES.filter(injectsPlainClient)).toEqual([])
  })
})
