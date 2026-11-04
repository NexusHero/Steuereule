import type { FastifyCorsOptions } from '@fastify/cors'
import { resolveCorsOrigins } from './resolve-cors-origins.js'

export function buildCorsOptions(env: NodeJS.ProcessEnv = process.env): FastifyCorsOptions {
  return {
    origin: resolveCorsOrigins(env),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
    exposedHeaders: ['Content-Disposition'],
  }
}
