import type { FastifyInstance, FastifyRequest } from 'fastify'

/** Fastify's default body limit, kept for every request that carries no assistant token. */
export const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024
/**
 * A tool call of `beleg_hochladen` carries a file of up to 10 MB as base64 (about 13.4 MB) inside JSON-RPC.
 * Only the two MCP message routes take that much, and only with a bearer token (beta P4, decision 6).
 */
export const MCP_BODY_LIMIT_BYTES = 15 * 1024 * 1024

const MCP_MESSAGE_ROUTES = new Set(['/mcp', '/mcp/messages'])

/** The bearer check made before the body is read: null when the token passes, else the 401 challenge. */
export type BearerBeforeBody = (request: FastifyRequest) => Promise<string | null>

/**
 * Raises the body limit of the MCP message routes, for assistants only. A POST whose body may be larger than
 * the default (a content-length above it, or none) is read only after its bearer token passed the guard's own
 * check (`UserContextGuard.refuseBearerBeforeBody`); otherwise it is answered 401 with the challenge before a
 * byte of the body is buffered. A header that merely starts with "Bearer " no longer opens the 15 MB limit.
 * Must run before the routes are registered.
 */
export function installMcpBodyLimit(fastify: FastifyInstance, bearerBeforeBody: BearerBeforeBody): void {
  fastify.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method]
    if (!MCP_MESSAGE_ROUTES.has(route.url) || !methods.includes('POST')) return
    route.bodyLimit = MCP_BODY_LIMIT_BYTES
    const own = route.onRequest === undefined ? [] : Array.isArray(route.onRequest) ? route.onRequest : [route.onRequest]
    route.onRequest = [
      async (request, reply) => {
        if (request.method !== 'POST') return
        const length = Number(request.headers['content-length'] ?? Number.NaN)
        if (Number.isFinite(length) && length <= DEFAULT_BODY_LIMIT_BYTES) return
        const challenge = await bearerBeforeBody(request)
        if (challenge === null) return
        await reply
          .code(401)
          .header('WWW-Authenticate', challenge)
          .header('content-type', 'application/json')
          .send({ statusCode: 401, code: 'MCP_BEARER_REQUIRED', message: 'Mehr als 1 MB nimmt der MCP-Endpunkt nur mit gültigem Assistenten-Token.' })
      },
      ...own,
    ]
  })
}
