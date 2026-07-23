// Dev/CI/E2E seed (ADR-0003): synthetic-only fixture, run at container start. No real
// PII, ever, in non-production (§4.2). Steuer-ID/Steuernummer below are made-up digit
// strings shaped to pass validation, not real identifiers issued to anyone.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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
