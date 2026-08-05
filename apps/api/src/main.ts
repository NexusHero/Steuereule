import 'reflect-metadata'
import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module.js'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from './auth/auth.tokens.js'
import { mountBetterAuthHandler } from './auth/mount-better-auth.js'
import { validationExceptionFactory } from './common/validation-exception-factory.js'
import { assertDatabaseReachable } from './config/assert-database-reachable.js'
import { buildCorsOptions } from './cors/build-cors-options.js'
import { registerHelmet } from './security/register-helmet.js'

export async function buildApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: ['error', 'warn'],
  })

  // Credentialed cross-origin CORS (ADR-0011): the guest-session userId travels in an
  // httpOnly cookie, so the live demo's web origin must be granted `credentials: true`
  // via a strict, env-driven allowlist — never `*` (incompatible with credentials anyway).
  // Pairs with UserContextGuard's `SameSite=None; Secure` cookie (see guest-session.ts);
  // CORS headers alone are not sufficient for the cross-origin credentialed call to work.
  //
  // The actual policy (allowlist, `credentials`, `methods`, `exposedHeaders`) lives in
  // `buildCorsOptions()` — a single exported builder shared with
  // `test/cors.acceptance.test.ts`, so the acceptance evidence can never silently drift
  // from what production actually serves (see that builder's header comment for the
  // drift this closed, and for why `Content-Disposition` must stay exposed — it's what
  // the cross-origin export download's dated filename read depends on).
  app.enableCors(buildCorsOptions(process.env))

  await app.register(fastifyCookie)

  // Must be registered before SwaggerModule.setup() below — its /docs routes need to
  // already be tagged `helmet: false` by the time helmet's own onRoute hook sees them.
  await registerHelmet(app)

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  )

  const config = new DocumentBuilder()
    .setTitle('SteuerEule API')
    .setDescription('Onboarding profile endpoints (steuereule#29)')
    .setVersion('1.0')
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, document)

  // better-auth is mounted as a raw Fastify catch-all, deliberately OUTSIDE the Nest
  // pipeline above (ADR-0012 §1) — it must come after app.init() (below) so the
  // DI-built BETTER_AUTH_BUNDLE already exists, but it does not depend on
  // app.listen(); the boot smoke proves it actually answers over real HTTP.
  await app.init()
  const { auth } = app.get<BetterAuthBundle>(BETTER_AUTH_BUNDLE)
  await mountBetterAuthHandler(app, auth)

  return app
}

async function bootstrap(): Promise<void> {
  // Fail fast on the database, before building anything (see
  // config/assert-database-reachable.ts for why this lives here and not near Prisma):
  // `buildApp()` itself must stay database-free (tests and `openapi:spec` both rely on
  // that), but this real, request-serving process needs one from its very first
  // request, so the checked-in `DATABASE_URL` being absent or unreachable is a boot
  // failure here, not a 500 on someone's first click.
  await assertDatabaseReachable()

  const app = await buildApp()
  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port, '0.0.0.0')
}

// Only auto-start when run directly (not when imported by tests).
if (process.env.VITEST !== 'true') {
  bootstrap().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
