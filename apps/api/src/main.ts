import './config/env-snapshot.js'
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
import { assertDatabaseMigrated } from './config/assert-database-migrated.js'
import { assertDatabaseReachable } from './config/assert-database-reachable.js'
import { assertEnvNotFileSourced } from './config/assert-env-not-file-sourced.js'
import { resolveTrustedProxies } from './config/trusted-proxies.js'
import { buildCorsOptions } from './cors/build-cors-options.js'
import { registerHelmet } from './security/register-helmet.js'

export async function buildApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: resolveTrustedProxies() }),
    {
      logger: ['error', 'warn'],
      rawBody: true,
    },
  )

  app.enableCors(buildCorsOptions(process.env))

  // Graceful shutdown on SIGTERM/SIGINT for Cloud Run and Kubernetes SRE posture
  app.enableShutdownHooks()

  await app.register(fastifyCookie)

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

  await app.init()
  const { auth } = app.get<BetterAuthBundle>(BETTER_AUTH_BUNDLE)
  await mountBetterAuthHandler(app, auth)

  return app
}

async function bootstrap(): Promise<void> {
  assertEnvNotFileSourced()

  await assertDatabaseReachable()

  await assertDatabaseMigrated()

  const app = await buildApp()
  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port, '0.0.0.0')
}

if (process.env.VITEST !== 'true') {
  bootstrap().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
