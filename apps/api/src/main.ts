import 'reflect-metadata'
import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module.js'
import { validationExceptionFactory } from './common/validation-exception-factory.js'
import { resolveCorsOrigins } from './cors/resolve-cors-origins.js'

export async function buildApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: ['error', 'warn'],
  })

  // Credentialed cross-origin CORS (ADR-0011): the guest-session userId travels in an
  // httpOnly cookie, so the live demo's web origin must be granted `credentials: true`
  // via a strict, env-driven allowlist — never `*` (incompatible with credentials anyway).
  // Pairs with UserContextGuard's `SameSite=None; Secure` cookie (see guest-session.ts);
  // CORS headers alone are not sufficient for the cross-origin credentialed call to work.
  app.enableCors({ origin: resolveCorsOrigins(process.env), credentials: true })

  await app.register(fastifyCookie)

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
