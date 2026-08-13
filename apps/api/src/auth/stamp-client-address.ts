// The IP-resolution seam (#350) — the thin Fastify adapter half. Does nothing but
// call the pure `resolveClientAddress` (client-address.ts) and write its result;
// every resolution decision lives there, driven directly by unit tests.
//
// THE TRAP (read before touching this file): Fastify 5's `request.headers` is an
// accessor whose SETTER stores into `this.additionalHeaders`
// (fastify@5.10.0/lib/request.js:276-285) — a Fastify-side overlay that
// `request.headers`'s own GETTER merges back in, but which never reaches
// `request.raw`. `mount-better-auth.ts` hands better-auth `request.raw` directly
// (`toNodeHandler(auth)(request.raw, reply.raw)`), so a stamp written via
// `request.headers[...] = value` would be perfectly invisible to better-auth —
// while still passing any test that asserts through the Fastify `request.headers`
// object, because that getter merges `additionalHeaders` back in for anyone
// reading it that way. Declared, not connected; §10's exact failure shape. This
// hook writes `request.raw.headers` directly, and reads the inbound chain from
// `request.raw.headers` too (not the Fastify getter) — write and read side both
// anchored to the one object better-auth actually receives, so there is no path
// through this file where "looks stamped" and "is stamped" can diverge.
import type { FastifyInstance } from 'fastify'
import { CLIENT_ADDRESS_HEADER, resolveClientAddress, type ClientAddressPolicy } from './client-address.js'

/**
 * Registers the `onRequest` hook that stamps `CLIENT_ADDRESS_HEADER` onto
 * `request.raw.headers` for every request reaching `scope`. Must be registered
 * before the route(s) it protects (Fastify runs `onRequest` hooks registered in a
 * scope ahead of that scope's own route handlers) — `mount-better-auth.ts` adds it
 * to the same child plugin context the better-auth catch-all is mounted in, before
 * that route is defined, mirroring how the child scope's content-type parser is
 * already registered ahead of the route it serves.
 *
 * Scoped to `scope`, not the whole app: nothing outside the better-auth mount reads
 * `CLIENT_ADDRESS_HEADER` today (#351, the device-list region slice, is downstream
 * and separate), so a global hook would be a wider footprint than anything actually
 * consumes.
 */
export function registerClientAddressStamp(scope: FastifyInstance, policy: ClientAddressPolicy): void {
  scope.addHook('onRequest', async (request) => {
    const resolved = resolveClientAddress(request.ip, request.raw.headers, policy)
    if (resolved) {
      request.raw.headers[CLIENT_ADDRESS_HEADER] = resolved
    } else {
      // Defensive-only branch (resolveClientAddress returns null only when there is
      // no peer at all) — removes any stale/caller-supplied value rather than
      // leaving one in place that this request didn't actually earn.
      delete request.raw.headers[CLIENT_ADDRESS_HEADER]
    }
  })
}
