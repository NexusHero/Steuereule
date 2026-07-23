// Boots a real Nest + Fastify app — same guard, same ValidationPipe, same controller
// wiring as production — but with the Prisma-backed repository swapped for the
// in-memory fake, via light-my-request's `.inject()` so no real socket/DB is needed.
// This is what test/profile.http.test.ts drives to exercise the full HTTP contract
// (validation, guard-derived userId scoping, "persists nothing on 400") without a
// live Postgres, keeping it in the no-DB unit `test` job (ADR-0004).
import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../../src/app.module.js'
import { validationExceptionFactory } from '../../src/common/validation-exception-factory.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'
import { PROFILE_REPOSITORY } from '../../src/profile/profile.repository.js'
import { FakeProfileRepository } from '../fakes/fake-profile.repository.js'

export async function buildTestApp(): Promise<{ app: NestFastifyApplication; repository: FakeProfileRepository }> {
  const repository = new FakeProfileRepository()

  // Nest instantiates every provider registered on a module it constructs — including
  // PrismaService — regardless of whether anything in *this* test's request path ends up
  // injecting it. ProfileModule always registers PrismaService, so without this override
  // `new PrismaClient()` still runs here even though PROFILE_REPOSITORY is swapped for the
  // fake. That requires the generated Prisma client to exist and reaches toward a real DB
  // driver — exactly what a fake-repository HTTP test must never depend on (ADR-0004).
  // Overriding it with an inert stub keeps this test genuinely Prisma-free.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PROFILE_REPOSITORY)
    .useValue(repository)
    .overrideProvider(PrismaService)
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

  return { app, repository }
}

/** Pulls the `name=value` pair out of a Set-Cookie response header, for reuse on the next request. */
export function extractSessionCookie(setCookieHeader: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
  return raw?.split(';')[0]
}
