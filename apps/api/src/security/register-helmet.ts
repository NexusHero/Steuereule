import fastifyHelmet from '@fastify/helmet'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'

const DOCS_PATH_PREFIX = '/docs'

export async function registerHelmet(app: NestFastifyApplication): Promise<void> {
  const fastify = app.getHttpAdapter().getInstance()

  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url.startsWith(DOCS_PATH_PREFIX)) {
      routeOptions.helmet = false
    }
  })

  await app.register(fastifyHelmet, { global: true })
}
