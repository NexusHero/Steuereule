// Prisma config of the keystore database (ADR-0059): `prisma <cmd> --config prisma/keystore/prisma.config.ts`.
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'schema.prisma',
  migrations: { path: 'migrations' },
  datasource: { url: process.env.KEYSTORE_DATABASE_URL ?? '' },
})
