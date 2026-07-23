// Dev/CI/E2E seed (ADR-0003): synthetic-only fixture, run at container start. No real
// PII, ever, in non-production (§4.2). Steuer-ID/Steuernummer below are made-up digit
// strings shaped to pass validation, not real identifiers issued to anyone.
//
// Writes through the field-encryption-extended client (ADR-0008), never the plain
// PrismaClient — otherwise the seeded steuerId/steuernummer would land as plaintext,
// exactly the thing encryption-at-rest is meant to prevent.
import { PrismaClient } from '@prisma/client'
import { fieldEncryptionExtension } from 'prisma-field-encryption'
import { resolveFieldEncryptionKey } from '../src/prisma/field-encryption-key.js'

const basePrisma = new PrismaClient()
const { encryptionKey, decryptionKeys } = resolveFieldEncryptionKey()
const prisma = basePrisma.$extends(fieldEncryptionExtension({ encryptionKey, decryptionKeys }))

const SYNTHETIC_PROFILES = [
  {
    userId: 'seed-guest-anna',
    firstName: 'Anna',
    lastName: 'Beispiel',
    steuerId: '02476291358',
    steuernummer: '18181508155',
  },
  {
    userId: 'seed-guest-jonas',
    firstName: 'Jonas',
    lastName: 'Testfall',
    steuerId: '65929970489',
    steuernummer: null,
  },
]

async function main(): Promise<void> {
  for (const profile of SYNTHETIC_PROFILES) {
    await prisma.profile.upsert({
      where: { userId: profile.userId },
      update: profile,
      create: profile,
    })
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
