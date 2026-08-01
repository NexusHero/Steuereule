// Writes the live OpenAPI document to `openapi.json` at the package root — the single
// input the frontend's `@steuereule/api-client` (orval, ADR-0001) generates from. This
// boots the real AppModule (same DocumentBuilder config as main.ts/openapi-contract.test.ts)
// so the spec can never hand-drift from what Nest actually serves at `/docs`.
//
// Runs under `tsx` (esbuild transform, no decorator-metadata emission) rather than
// production's `tsc` build or the test suite's Vitest/SWC — both of which emit
// `design:paramtypes`/`design:type` metadata that this script's own output never
// benefits from. That is NOT safe by construction: every constructor uses an
// explicit `@Inject()` token and every `@ApiProperty()` declares an explicit `type`
// specifically because those two forms don't need the metadata — but a `@Query()`/
// `@Body()` parameter's *shape* still does, unless it also carries an explicit
// `@ApiQuery()`/`@ApiBody()` (see ProfileController's PUT and DeviceController's
// three device endpoints for the pattern). `/v1/device/pending`'s `userCode` and
// `/v1/device/approve`'s/`/v1/device/token`'s request bodies shipped silently missing
// from this exact output for that reason (#238, Musti's PR #239 ruling) — the
// invariant this comment used to assert was never actually enforced, only claimed.
// It is now checked directly: `test/openapi-contract.test.ts` reads this script's
// own checked-in output, and CI's freshness gate re-runs this script and fails on any
// diff, so a divergence here can no longer hide. PrismaService also never eagerly
// connects, so this needs no live database — only a syntactically valid DATABASE_URL
// to construct.
import 'reflect-metadata'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/steuereule_openapi_spec?schema=public'
process.env.GUEST_SESSION_SECRET ??= 'openapi-spec-generation-secret'

const { AppModule } = await import('../src/app.module.js')

async function main(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  })

  const config = new DocumentBuilder()
    .setTitle('SteuerEule API')
    .setDescription('Onboarding profile endpoints (steuereule#29)')
    .setVersion('1.0')
    .build()
  const document = SwaggerModule.createDocument(app, config)

  const outFile = fileURLToPath(new URL('../openapi.json', import.meta.url))
  writeFileSync(outFile, `${JSON.stringify(document, null, 2)}\n`)
  console.log(`Wrote ${outFile}`)

  await app.close()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
