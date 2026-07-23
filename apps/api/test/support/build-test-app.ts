// Boots a real Nest + Fastify app — same guard, same ValidationPipe, same controller
// wiring as production — but with every Prisma-backed repository (Profile, TaxYear,
// AccountIdentity) and the PdfRenderer swapped for an in-memory/fake double, via
// light-my-request's `.inject()` so no real socket/DB/Chromium is needed. This is what
// test/profile.http.test.ts, test/cockpit.http.test.ts and test/account.http.test.ts
// drive to exercise the full HTTP contract (validation, guard-derived userId scoping,
// "persists nothing on 400") without a live Postgres, keeping it in the no-DB unit
// `test` job (ADR-0004).
import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../../src/app.module.js'
import { ACCOUNT_IDENTITY_REPOSITORY } from '../../src/account/account-identity.repository.js'
import { PDF_RENDERER } from '../../src/account/export/pdf-renderer.js'
import { AUDIT_REPOSITORY } from '../../src/audit/audit.repository.js'
import { validationExceptionFactory } from '../../src/common/validation-exception-factory.js'
import { ENCRYPTED_PRISMA } from '../../src/prisma/encrypted-prisma.provider.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'
import { PROFILE_REPOSITORY } from '../../src/profile/profile.repository.js'
import { TAX_YEAR_REPOSITORY } from '../../src/cockpit/tax-year.repository.js'
import { FakeAccountIdentityRepository } from '../fakes/fake-account-identity.repository.js'
import { FakeAuditRepository } from '../fakes/fake-audit.repository.js'
import { FakePdfRenderer } from '../fakes/fake-pdf-renderer.js'
import { FakeProfileRepository } from '../fakes/fake-profile.repository.js'
import { FakeTaxYearRepository } from '../fakes/fake-tax-year.repository.js'

export async function buildTestApp(): Promise<{
  app: NestFastifyApplication
  repository: FakeProfileRepository
  taxYearRepository: FakeTaxYearRepository
  accountIdentityRepository: FakeAccountIdentityRepository
  pdfRenderer: FakePdfRenderer
  auditRepository: FakeAuditRepository
}> {
  const repository = new FakeProfileRepository()
  const taxYearRepository = new FakeTaxYearRepository()
  const accountIdentityRepository = new FakeAccountIdentityRepository()
  const pdfRenderer = new FakePdfRenderer()
  const auditRepository = new FakeAuditRepository()

  // Nest instantiates every provider registered on a module it constructs — including
  // PrismaService — regardless of whether anything in *this* test's request path ends up
  // injecting it. ProfileModule always registers PrismaService (via PrismaModule), so
  // without this override `new PrismaClient()` still runs here even though
  // PROFILE_REPOSITORY is swapped for the fake. That requires the generated Prisma client
  // to exist and reaches toward a real DB driver — exactly what a fake-repository HTTP
  // test must never depend on (ADR-0004). Overriding it with an inert stub keeps this
  // test genuinely Prisma-free.
  //
  // ENCRYPTED_PRISMA is the same story one layer up: it's a top-level provider in
  // PrismaModule (built by calling `.$extends()` on PrismaService), so it's eagerly
  // instantiated too — overridden with an inert stub for the same reason. Nothing in
  // this fake-repository test path ever reads it (PrismaProfileRepository and
  // PrismaTaxYearRepository, its only consumers, are themselves swapped out by the
  // PROFILE_REPOSITORY/TAX_YEAR_REPOSITORY overrides below).
  //
  // AUDIT_REPOSITORY is overridden with an in-memory fake (mirroring PROFILE_REPOSITORY)
  // rather than an inert stub, because ProfileService genuinely calls AuditService on
  // every successful GET — a real dependency of the code path under test, not a
  // Prisma-connection detail to merely stub out.
  //
  // ACCOUNT_IDENTITY_REPOSITORY/PDF_RENDERER are overridden the same way, for the same
  // reason PROFILE_REPOSITORY is: PrismaAccountIdentityRepository would otherwise try
  // a real (stubbed-to-{}) PrismaService query, and — the load-bearing one —
  // PlaywrightPdfRenderer's onModuleInit() would launch a real headless Chromium on
  // every test using this harness, even ones with nothing to do with export/PDF. The
  // no-DB unit job (ADR-0004) must never need a live database *or* a live browser;
  // PlaywrightPdfRenderer gets its own dedicated test (pdf-renderer.playwright.test.ts).
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PROFILE_REPOSITORY)
    .useValue(repository)
    .overrideProvider(TAX_YEAR_REPOSITORY)
    .useValue(taxYearRepository)
    .overrideProvider(ACCOUNT_IDENTITY_REPOSITORY)
    .useValue(accountIdentityRepository)
    .overrideProvider(PDF_RENDERER)
    .useValue(pdfRenderer)
    .overrideProvider(AUDIT_REPOSITORY)
    .useValue(auditRepository)
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(ENCRYPTED_PRISMA)
    .useValue({})
    .compile()

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  })

  await app.register(fastifyCookie)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  )

  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  return { app, repository, taxYearRepository, accountIdentityRepository, pdfRenderer, auditRepository }
}

/** Pulls the `name=value` pair out of a Set-Cookie response header, for reuse on the next request. */
export function extractSessionCookie(setCookieHeader: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
  return raw?.split(';')[0]
}
