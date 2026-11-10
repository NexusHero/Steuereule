// Boots a real Nest + Fastify app — same guard, same ValidationPipe, same controller
// wiring as production — but with every Prisma-backed repository (Profile, TaxYear,
// AccountIdentity) and the PdfRenderer swapped for an in-memory/fake double, via
// light-my-request's `.inject()` so no real socket/DB/Chromium is needed. This is what
// test/profile.http.test.ts, test/cockpit.http.test.ts and test/account.http.test.ts
// drive to exercise the full HTTP contract (validation, guard-derived userId scoping,
// "persists nothing on 400") without a live Postgres, keeping it in the no-DB unit
// `test` job (ADR-0004).
import fastifyCookie from '@fastify/cookie'
import fastifyMultipart from '@fastify/multipart'
import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../../src/app.module.js'
import { ACCOUNT_IDENTITY_REPOSITORY } from '../../src/account/account-identity.repository.js'
import { TAX_DATA_EXPORT_REPOSITORY } from '../../src/account/tax-data-export.repository.js'
import { ADVISOR_REPOSITORY, InMemoryAdvisorRepository } from '../../src/advisor/advisor.repository.js'
import { PDF_RENDERER } from '../../src/account/export/pdf-renderer.js'
import { ASSESSMENT_REPOSITORY } from '../../src/assessment/assessment.repository.js'
import { AUDIT_REPOSITORY } from '../../src/audit/audit.repository.js'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../../src/auth/auth.tokens.js'
import { createResettableRateLimitStorage } from '../../src/auth/rate-limit-storage.js'
import { CHILD_REPOSITORY } from '../../src/children/child.repository.js'
import { validationExceptionFactory } from '../../src/common/validation-exception-factory.js'
import { COMMUTE_REPOSITORY } from '../../src/commute/commute.repository.js'
import { DATABASE_REACHABILITY_CHECK } from '../../src/health/health.service.js'
import { PARTNER_COUPLING_REPOSITORY } from '../../src/link/link.repository.js'
import { MASTER_DATA_REPOSITORY } from '../../src/master-data/master-data.repository.js'
import { OWL_CARD_DISMISSAL_REPOSITORY, OWL_SETTING_REPOSITORY } from '../../src/owl-mode/owl-mode.repository.js'
import { ENCRYPTED_PRISMA } from '../../src/prisma/encrypted-prisma.provider.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'
import { passThroughTransactionRunner, TRANSACTION_RUNNER } from '../../src/prisma/transaction.js'
import { PROFILE_REPOSITORY } from '../../src/profile/profile.repository.js'
import { TAX_YEAR_REPOSITORY } from '../../src/cockpit/tax-year.repository.js'
import { INTERVIEW_ANSWER_REPOSITORY } from '../../src/interview/interview-answer.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY } from '../../src/lstb/lstb.repository.js'
import { PENSION_REPOSITORY } from '../../src/pension/pension.repository.js'
import { CAPITAL_REPOSITORY } from '../../src/capital/capital.repository.js'
import { RENTAL_REPOSITORY } from '../../src/rental/rental.repository.js'
import { PROVENANCE_REPOSITORY } from '../../src/marking/marking.repository.js'
import { FakeAccountIdentityRepository } from '../fakes/fake-account-identity.repository.js'
import { FakeAssessmentRepository } from '../fakes/fake-assessment.repository.js'
import { FakeAuditRepository } from '../fakes/fake-audit.repository.js'
import { FakeChildRepository } from '../fakes/fake-child.repository.js'
import { FakeCommuteRepository } from '../fakes/fake-commute.repository.js'
import { FakeInterviewAnswerRepository } from '../fakes/fake-interview-answer.repository.js'
import { FakeLinkRepository } from '../fakes/fake-link.repository.js'
import { FakeCapitalRepository } from '../fakes/fake-capital.repository.js'
import { FakeLstbRepository } from '../fakes/fake-lstb.repository.js'
import { FakeMasterDataRepository } from '../fakes/fake-master-data.repository.js'
import { FakeOwlCardDismissalRepository, FakeOwlSettingRepository } from '../fakes/fake-owl-mode.repository.js'
import { FakePdfRenderer } from '../fakes/fake-pdf-renderer.js'
import { FakeTaxDataExportRepository } from '../fakes/fake-tax-data-export.repository.js'
import { FakeProfileRepository } from '../fakes/fake-profile.repository.js'
import { FakePensionRepository } from '../fakes/fake-pension.repository.js'
import { FakeTaxYearRepository } from '../fakes/fake-tax-year.repository.js'
import { FakeMarkingRepository } from '../fakes/fake-marking.repository.js'
import { FakeRentalRepository } from '../fakes/fake-rental.repository.js'
import { FakeChSalaryCertificateRepository } from '../fakes/fake-ch-salary-certificate.repository.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY } from '../../src/ch-salary-certificate/ch-salary-certificate.repository.js'
import { RECEIPT_REPOSITORY } from '../../src/receipt/receipt.repository.js'
import { STORAGE_PORT } from '../../src/receipt/storage/storage.port.js'
import { USER_KEY_STORE } from '../../src/keystore/user-key-store.js'
import { FakeReceiptRepository } from '../fakes/fake-receipt.repository.js'
import { InMemoryStorageAdapter } from '../fakes/in-memory-storage.adapter.js'

export async function buildTestApp(options?: {
  /** Overrides the default always-succeeding DATABASE_REACHABILITY_CHECK stub — the one
   * seam a caller needs to exercise `/v1/health/ready`'s failure branch (#279). */
  databaseReachabilityCheck?: () => Promise<void>
  /** Maps `better-auth.session_token` cookie values to authenticated userIds for `@RequiresAccount()` tests. */
  sessionsByToken?: Readonly<Record<string, string>>
}): Promise<{
  app: NestFastifyApplication
  repository: FakeProfileRepository
  taxYearRepository: FakeTaxYearRepository
  lstbRepository: FakeLstbRepository
  receiptRepository: FakeReceiptRepository
  advisorRepository: InMemoryAdvisorRepository
  storageAdapter: InMemoryStorageAdapter
  interviewRepository: FakeInterviewAnswerRepository
  accountIdentityRepository: FakeAccountIdentityRepository
  pdfRenderer: FakePdfRenderer
  auditRepository: FakeAuditRepository
  taxDataExportRepository: FakeTaxDataExportRepository
}> {
  const repository = new FakeProfileRepository()
  const taxYearRepository = new FakeTaxYearRepository()
  const lstbRepository = new FakeLstbRepository()
  const receiptRepository = new FakeReceiptRepository()
  const advisorRepository = new InMemoryAdvisorRepository()
  const storageAdapter = new InMemoryStorageAdapter()
  const interviewRepository = new FakeInterviewAnswerRepository()
  const markingRepository = new FakeMarkingRepository()
  const pensionRepository = new FakePensionRepository()
  const capitalRepository = new FakeCapitalRepository()
  const rentalRepository = new FakeRentalRepository()
  const chSalaryCertificateRepository = new FakeChSalaryCertificateRepository()
  const linkRepository = new FakeLinkRepository()
  const masterDataRepository = new FakeMasterDataRepository()
  const assessmentRepository = new FakeAssessmentRepository()
  const childRepository = new FakeChildRepository()
  const commuteRepository = new FakeCommuteRepository()
  const owlSettingRepository = new FakeOwlSettingRepository()
  const owlCardDismissalRepository = new FakeOwlCardDismissalRepository()
  const accountIdentityRepository = new FakeAccountIdentityRepository()
  const pdfRenderer = new FakePdfRenderer()
  const taxDataExportRepository = new FakeTaxDataExportRepository()
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
  //
  // DATABASE_REACHABILITY_CHECK (#279) is overridden to an always-succeeding stub for
  // the same reason: HealthModule's real provider (`createPooledDatabaseReachabilityCheck`,
  // #338 F1) queries through the app's own `PrismaService` — nothing this no-DB harness's
  // callers may assume, and PrismaService is itself already stubbed to `{}` above. A test
  // that wants the FAILURE branch of `/v1/health/ready` overrides this again, per-test, on
  // top of this default (see health.controller.test.ts).
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PROFILE_REPOSITORY)
    .useValue(repository)
    .overrideProvider(TAX_YEAR_REPOSITORY)
    .useValue(taxYearRepository)
    .overrideProvider(WAGE_TAX_CERTIFICATE_REPOSITORY)
    .useValue(lstbRepository)
    .overrideProvider(RECEIPT_REPOSITORY)
    .useValue(receiptRepository)
    .overrideProvider(ADVISOR_REPOSITORY)
    .useValue(advisorRepository)
    .overrideProvider(STORAGE_PORT)
    .useValue(storageAdapter)
    .overrideProvider(USER_KEY_STORE)
    .useValue(storageAdapter.keys)
    .overrideProvider(INTERVIEW_ANSWER_REPOSITORY)
    .useValue(interviewRepository)
    .overrideProvider(PROVENANCE_REPOSITORY)
    .useValue(markingRepository)
    .overrideProvider(PENSION_REPOSITORY)
    .useValue(pensionRepository)
    .overrideProvider(CAPITAL_REPOSITORY)
    .useValue(capitalRepository)
    .overrideProvider(RENTAL_REPOSITORY)
    .useValue(rentalRepository)
    .overrideProvider(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY)
    .useValue(chSalaryCertificateRepository)
    .overrideProvider(PARTNER_COUPLING_REPOSITORY)
    .useValue(linkRepository)
    .overrideProvider(MASTER_DATA_REPOSITORY)
    .useValue(masterDataRepository)
    .overrideProvider(ASSESSMENT_REPOSITORY)
    .useValue(assessmentRepository)
    .overrideProvider(CHILD_REPOSITORY)
    .useValue(childRepository)
    .overrideProvider(COMMUTE_REPOSITORY)
    .useValue(commuteRepository)
    .overrideProvider(OWL_SETTING_REPOSITORY)
    .useValue(owlSettingRepository)
    .overrideProvider(OWL_CARD_DISMISSAL_REPOSITORY)
    .useValue(owlCardDismissalRepository)
    .overrideProvider(ACCOUNT_IDENTITY_REPOSITORY)
    .useValue(accountIdentityRepository)
    .overrideProvider(PDF_RENDERER)
    .useValue(pdfRenderer)
    .overrideProvider(TAX_DATA_EXPORT_REPOSITORY)
    .useValue(taxDataExportRepository)
    .overrideProvider(AUDIT_REPOSITORY)
    .useValue(auditRepository)
    .overrideProvider(TRANSACTION_RUNNER)
    .useValue(passThroughTransactionRunner)
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(ENCRYPTED_PRISMA)
    .useValue({})
    .overrideProvider(DATABASE_REACHABILITY_CHECK)
    .useValue(options?.databaseReachabilityCheck ?? (async () => {}))

  if (options?.sessionsByToken) {
    const sessions = options.sessionsByToken
    const sessionBundle: BetterAuthBundle = {
      sessionCookieName: 'better-auth.session_token',
      enabledSocialProviders: [],
      rateLimitStorage: createResettableRateLimitStorage(),
      auth: {
        api: {
          getSession: async ({ headers }: { headers: Headers }) => {
            const rawCookie = headers.get('cookie') ?? ''
            for (const part of rawCookie.split(';')) {
              const trimmed = part.trim()
              if (trimmed.startsWith('better-auth.session_token=')) {
                const token = decodeURIComponent(trimmed.slice('better-auth.session_token='.length))
                const userId = sessions[token]
                if (userId) {
                  return { user: { id: userId }, session: { id: `sess-${token}` } }
                }
              }
            }
            return null
          },
        },
      } as unknown as BetterAuthBundle['auth'],
    }
    builder.overrideProvider(BETTER_AUTH_BUNDLE).useValue(sessionBundle)
  }

  const moduleRef = await builder.compile()

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  })

  await app.register(fastifyCookie)
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 10,
    },
  })
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

  return {
    app,
    repository,
    taxYearRepository,
    lstbRepository,
    receiptRepository,
    advisorRepository,
    storageAdapter,
    interviewRepository,
    accountIdentityRepository,
    pdfRenderer,
    auditRepository,
    taxDataExportRepository,
  }
}

/** Pulls the `name=value` pair out of a Set-Cookie response header, for reuse on the next request. */
export function extractSessionCookie(setCookieHeader: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
  return raw?.split(';')[0]
}
