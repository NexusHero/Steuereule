import './config/env-snapshot.js'
import { assertFakeKiNotInProduction } from './ki/fake-ki-env.js'
import { installProviderRejectionGuard } from './ki/provider-rejections.js'
import 'reflect-metadata'
import fastifyCookie from '@fastify/cookie'
import fastifyMultipart from '@fastify/multipart'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module.js'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from './auth/auth.tokens.js'
import { mountBetterAuthHandler } from './auth/mount-better-auth.js'
import { installClientIpHeader } from './auth/client-ip.js'
import { validationExceptionFactory } from './common/validation-exception-factory.js'
import { assertDatabaseMigrated, assertKeystoreMigrated } from './config/assert-database-migrated.js'
import { assertDatabaseReachable } from './config/assert-database-reachable.js'
import { assertEnvNotFileSourced } from './config/assert-env-not-file-sourced.js'
import { resolveTrustedProxies } from './config/trusted-proxies.js'
import { resolveTraceId } from './common/request-id.js'
import { buildCorsOptions } from './cors/build-cors-options.js'
import { registerHelmet } from './security/register-helmet.js'

export async function buildApp(): Promise<NestFastifyApplication> {
  const fastifyAdapter = new FastifyAdapter({
    trustProxy: resolveTrustedProxies(),
    genReqId: (req: { headers: Record<string, string | string[] | undefined> }) => resolveTraceId(req.headers),
  })

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
    {
      logger: ['error', 'warn'],
      rawBody: true,
    },
  )

  // Before every route: better-auth keys its rate limits and session IPs on the address Fastify resolved
  // (ADR-0106 D3/D4), never on a client-supplied X-Forwarded-For.
  installClientIpHeader(fastifyAdapter.getInstance())

  fastifyAdapter.getInstance().addHook('onSend', async (request, reply) => {
    if (request.id) {
      void reply.header('x-request-id', request.id)
    }
  })

  app.enableCors(buildCorsOptions(process.env))

  // Graceful shutdown on SIGTERM/SIGINT for Cloud Run and Kubernetes SRE posture
  app.enableShutdownHooks()

  await app.register(fastifyCookie)
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB max receipt upload
      files: 1,
      fields: 10,
    },
  })

  await registerHelmet(app)

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  )

  // The /docs Swagger UI is unauthenticated and runs with Helmet disabled on its routes
  // (register-helmet.ts). It exposes the full API surface, so it is mounted only outside production
  // (ADR-0104 LM1).
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('SteuerEule API')
      .setDescription('Onboarding profile endpoints (steuereule#29)')
      .setVersion('1.0')
      .build()
    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('docs', app, document)
  }

  await app.init()
  const { auth } = app.get<BetterAuthBundle>(BETTER_AUTH_BUNDLE)
  await mountBetterAuthHandler(app, auth)

  return app
}

async function bootstrap(): Promise<void> {
  let running: NestFastifyApplication | undefined
  // Stop accepting and let requests in flight finish before the process ends on an unknown rejection (ADR-0109).
  installProviderRejectionGuard({ drain: () => running?.close() ?? Promise.resolve() })
  assertEnvNotFileSourced()
  assertFakeKiNotInProduction()

  await assertDatabaseReachable()

  await assertDatabaseMigrated()
  await assertKeystoreMigrated()

  const app = await buildApp()
  running = app
  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port, '0.0.0.0')
}

if (process.env.VITEST !== 'true') {
  bootstrap().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
