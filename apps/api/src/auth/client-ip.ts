import type { FastifyInstance } from 'fastify'

/**
 * The header better-auth reads the client address from (ADR-0106 D3/D4).
 *
 * Fastify resolves `request.ip` once, from the socket peer and the configured `TRUSTED_PROXIES`
 * (proxy-addr: an `X-Forwarded-For` hop is only believed when the peer that sent it is trusted). better-auth
 * resolves its own address from `X-Forwarded-For` instead, and with no trusted proxies it believes a
 * single-value header from anyone: a caller rotating that value got a fresh rate-limit bucket per request,
 * and a caller sending none fell into one bucket shared by every such client. Both now read this header,
 * which only the server writes.
 */
export const CLIENT_IP_HEADER = 'x-steuereule-client-ip'

/**
 * Writes the resolved client address into {@link CLIENT_IP_HEADER} on every request, over any value the
 * client sent. Registered on the root instance before any route, so the better-auth mount and every
 * controller that hands the request headers to better-auth see it.
 */
export function installClientIpHeader(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', (request, _reply, done) => {
    if (typeof request.ip === 'string' && request.ip.length > 0) request.raw.headers[CLIENT_IP_HEADER] = request.ip
    else delete request.raw.headers[CLIENT_IP_HEADER]
    done()
  })
}
