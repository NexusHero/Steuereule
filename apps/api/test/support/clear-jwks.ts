// Runs before every DB-backed test file (vitest.integration.config.ts `setupFiles`).
//
// The JWKS private key is stored encrypted under BETTER_AUTH_SECRET (ADR-0106 D6), and each suite boots the
// app with its own secret on the one shared test database. A key another file left behind cannot be
// decrypted with this file's secret, and better-auth then fails every request that signs a JWT
// (get-session, the OAuth token endpoint). A fresh key is minted on the first signature.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
try {
  await prisma.jwks.deleteMany()
} finally {
  await prisma.$disconnect()
}
