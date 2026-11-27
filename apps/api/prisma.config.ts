// Prisma 7 moved the CLI's connection and seed settings out of schema.prisma and package.json#prisma into this file
// (upgrade guide "Prisma config is now used to configure the Prisma CLI"). The runtime connection is a driver adapter
// built in src/prisma/database-client.ts; this URL is only what `prisma migrate` / `prisma db` connect to.
// The keystore schema has its own config: prisma/keystore/prisma.config.ts.
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  // `prisma generate` needs no database; an unset DATABASE_URL must not fail it (env() would throw).
  datasource: { url: process.env.DATABASE_URL ?? '' },
})
