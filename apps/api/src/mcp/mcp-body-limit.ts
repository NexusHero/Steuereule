import type { FastifyInstance } from 'fastify'

/** Fastify's default body limit, kept for every request that carries no assistant token. */
export const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024
/**
 * A tool call of `beleg_hochladen` carries a file of up to 10 MB as base64 (about 13.4 MB) inside JSON-RPC.
 * Only the two MCP message routes take that much, and only with a bearer token (beta P4, decision 6).
 */
export const MCP_BODY_LIMIT_BYTES = 15 * 1024 * 1024

const MCP_MESSAGE_ROUTES = new Set(['/mcp', '/mcp/messages'])

/**
 * Raises the body limit of the MCP message routes. A request without a bearer token is turned away before its
 * body is read when it would be larger than the default, so the higher limit is open to assistants only (the
 * guard checks the token itself later). Must run before the routes are registered.
 */
export function installMcpBodyLimit(fastify: FastifyInstance): void {
  fastify.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method]
    if (!MCP_MESSAGE_ROUTES.has(route.url) || !methods.includes('POST')) return
    route.bodyLimit = MCP_BODY_LIMIT_BYTES
    const own = route.onRequest === undefined ? [] : Array.isArray(route.onRequest) ? route.onRequest : [route.onRequest]
    route.onRequest = [
      async (request, reply) => {
        if (request.method !== 'POST') return
        const bearer = typeof request.headers.authorization === 'string' && request.headers.authorization.startsWith('Bearer ')
        if (bearer) return
        const length = Number(request.headers['content-length'] ?? Number.NaN)
        if (!Number.isFinite(length) || length > DEFAULT_BODY_LIMIT_BYTES) {
          await reply.code(413).header('content-type', 'application/json').send({ statusCode: 413, code: 'MCP_BODY_TOO_LARGE', message: 'Ohne Assistenten-Token nimmt der MCP-Endpunkt höchstens 1 MB.' })
        }
      },
      ...own,
    ]
  })
}
