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
import { resolveCorsOrigins } from './cors/resolve-cors-origins.js'
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
  // `methods` must be given explicitly: @fastify/cors@11.2.0 defaults to
  // `GET,HEAD,POST` when omitted, silently excluding PUT — which blocked every
  // credentialed cross-origin `PUT /v1/profile` (Onboarding save, guest→account
  // upgrade, the Profil screen) at the browser's preflight (caught live by Salih's
  // cross-origin re-test; see test/cors.acceptance.test.ts). Listed to match the REST
  // surface this API actually serves — not a blanket allow-all.
  app.enableCors({
    origin: resolveCorsOrigins(process.env),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT'],
  })

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
