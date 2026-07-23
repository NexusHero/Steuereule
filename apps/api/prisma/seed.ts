// Dev/CI/E2E seed (ADR-0003): synthetic-only fixture, run at container start. No real
// PII, ever, in non-production (§4.2). Steuer-ID/Steuernummer below are made-up digit
// strings shaped to pass validation, not real identifiers issued to anyone. Same file
// also loads the Cockpit's TaxYear fixture (REQ-001, steuereule#92).
//
// Writes Profile rows through the field-encryption-extended client (ADR-0008), never
// the plain PrismaClient — otherwise the seeded steuerId/steuernummer would land as
// plaintext, exactly the thing encryption-at-rest is meant to prevent. TaxYear has no
// encrypted field, so it's written through the plain client (see the loop below).
import { PrismaClient } from '@prisma/client'
import { fieldEncryptionExtension } from 'prisma-field-encryption'
import { cockpitRange } from '@steuereule/core'
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

// REQ-001 (steuereule#92) — exactly one synthetic Cockpit tax-year fixture, successor
// of finanzo-funke-design-system/project/ui_kits/app/demo-daten.js (`jahr`/`schaetzung`/
// `offeneAngaben`). Only the raw inputs are persisted — `baseEstimate`/`openItems`/
// `openConflicts` — never the derived range itself; CockpitService recomputes that on
// every read via cockpitRange() (determinism boundary, ADR-014/048), so there is
// nothing here to keep in sync by hand.
const SYNTHETIC_TAX_YEARS = [
  {
    userId: 'seed-guest-anna',
    steuerjahr: 2026,
    baseEstimate: 1407,
    openItems: 3,
    openConflicts: 0,
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

  for (const taxYear of SYNTHETIC_TAX_YEARS) {
    await basePrisma.taxYear.upsert({
      where: { userId_steuerjahr: { userId: taxYear.userId, steuerjahr: taxYear.steuerjahr } },
      update: taxYear,
      create: taxYear,
    })
    // No `/// @encrypted` field on TaxYear, so this could go through either client —
    // basePrisma (unextended) is used deliberately to make that explicit rather than
    // implying an encryption dependency that doesn't exist.
    const range = cockpitRange({
      estimate: taxYear.baseEstimate,
      openItems: taxYear.openItems,
      openConflicts: taxYear.openConflicts,
    })
    console.log(
      `Seeded TaxYear ${taxYear.userId}/${taxYear.steuerjahr}: estimate range ${range.from}–${range.to} €`,
    )
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
