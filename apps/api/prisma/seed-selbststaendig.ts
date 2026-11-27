// Dev-only seed for the Selbstständige (ADR-0101): gives an EXISTING account a self-employed household for
// 2024 and 2025, so the self-employment path can be checked in the browser with the switch on.
//
//   SELBSTSTAENDIGE_ENABLED=true DATABASE_URL=postgresql://… pnpm --filter @steuereule/api seed:selbststaendig you@example.com
//
// The household (made-up figures, no real person's data, ADR-0003):
// - Person A, the account holder: Freiberuflerin (Übersetzerin, Katalog-ähnlich „schriftstellerisch“), EÜR,
//   SKR03, Regelbesteuerung (Ist), Umsatzsteuer-Vorauszahlungen as one sum, a notebook as asset.
// - Person B, kept in A's account (person „B“): Gewerbe (Onlinehandel), Bilanz, SKR04, Betriebsstätte in
//   Leipzig (AGS 14713000, Hebesatz from the table). 2024 is a loss year (a Verlust to carry), 2025 a
//   profit above the Freibetrag of 24.500 €, with the Eröffnungsbilanz carried from 2024.
// Bookings go through the BusinessService, so numbers, VAT lines and the hash chain are exactly what the
// app writes. Re-running is safe: a book that already has entries is left as it is (append-only).
// Run it with the same PRISMA_FIELD_ENCRYPTION_KEY as the API. It refuses with NODE_ENV=production.
import { PrismaClient } from '@prisma/client'
import { schemaFieldEncryption } from '../src/prisma/field-encryption.js'
import { AuditService } from '../src/audit/audit.service.js'
import type { AuditRepository } from '../src/audit/audit.repository.js'
import { PrismaBusinessRepository } from '../src/business/business.repository.prisma.js'
import { composeBusinessService } from '../src/business/business.composition.js'
import { DEMO_ANSWERS, DEMO_YEARS, seedDemoHousehold } from '../src/business/demo-household.js'
import { HebesatzDirectory } from '../src/business/hebesatz.js'
import { PrismaInterviewAnswerRepository } from '../src/interview/interview-answer.repository.prisma.js'
import { publishEmailHashSalt, resolveFieldEncryptionKey } from '../src/prisma/field-encryption-key.js'
import { transactionAwareClient } from '../src/prisma/transaction.js'
import { runAsDatabaseUser } from '../src/common/database-identity.js'
import { createDatabaseAdapter } from '../src/common/database-adapter.js'

if (process.env.NODE_ENV === 'production') {
  console.error('seed-selbststaendig is a dev seed and refuses to run with NODE_ENV=production.')
  process.exit(1)
}
const email: string = process.argv[2] ?? ''
if (email === '') {
  console.error('Usage: tsx prisma/seed-selbststaendig.ts <email of an existing account>')
  process.exit(1)
}
// The seed writes through the path itself, which exists only with the switch on.
process.env.SELBSTSTAENDIGE_ENABLED = 'true'

const basePrisma = new PrismaClient({ adapter: createDatabaseAdapter() })
// The account is found by its e-mail hash (ADR-0109); the extension reads the salt when it is created.
publishEmailHashSalt()
const { encryptionKey, decryptionKeys } = resolveFieldEncryptionKey()
const encrypted = basePrisma.$extends(schemaFieldEncryption({ encryptionKey, decryptionKeys })) as unknown as PrismaClient
// The services write through the row-level-aware client, which refuses a query without an identity (P11).
const prisma = transactionAwareClient(encrypted)

const silentAudit: AuditRepository = { append: async () => undefined, findOwnRows: async () => [] } as unknown as AuditRepository
const repository = new PrismaBusinessRepository(prisma)
const business = composeBusinessService(repository, new PrismaInterviewAnswerRepository(prisma), new AuditService(silentAudit), new HebesatzDirectory())

async function main(): Promise<void> {
  // Whose rows these are is not known before the account is found, so the lookup has no identity to run under.
  const user = await encrypted.user.findUnique({ where: { email } })
  if (!user) throw new Error(`No account with the e-mail ${email}; sign up in the app first.`)
  // Everything else is written as that account, the way a request of theirs would write it.
  await runAsDatabaseUser(user.id, () => seedHousehold(user.id))
}

async function seedHousehold(userId: string): Promise<void> {
  for (const year of DEMO_YEARS) {
    await basePrisma.taxYear.upsert({
      where: { userId_taxYear: { userId, taxYear: year } },
      create: { userId, taxYear: year, baseEstimate: 0, openItems: 0, openConflicts: 0, status: 'entwurf' },
      update: {},
    })
    for (const [questionId, value] of Object.entries(DEMO_ANSWERS)) {
      await prisma.interviewAnswer.upsert({
        where: { userId_taxYear_questionId: { userId, taxYear: year, questionId } },
        create: { userId, taxYear: year, questionId, value },
        update: { value },
      })
    }
  }
  const { loss2024Eur } = await seedDemoHousehold(business, repository, userId)
  console.log(`Seeded the self-employed household for ${email}: 2024 and 2025, Person A Freiberuf (EÜR), Person B Gewerbe (Bilanz, Verlust 2024 ${loss2024Eur} €).`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await basePrisma.$disconnect()
  })
