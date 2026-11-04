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
