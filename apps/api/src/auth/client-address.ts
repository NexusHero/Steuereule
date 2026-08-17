// The IP-resolution seam (#350) — the pure resolution half.
//
// The defect this closes: better-auth's own `getIp()` (@better-auth/core/utils/ip)
// reads request HEADERS only and never the socket — so with no proxy configured
// (TRUSTED_PROXIES unset/`none`), its fallback is one literal shared key
// (`no-trusted-ip|<path>`, or better-auth's own test-env localhost fallback) used by
// EVERY caller at once: a global bucket, not a per-client one. No `TRUSTED_PROXIES`
// value repairs that, because the function it would configure never looks at the one
// thing that's actually trustworthy: Fastify's `request.ip`, which — with no
// `trustProxy` configured on `FastifyAdapter()` (main.ts) — IS the real socket peer
// today, already, no #292 (deployment) dependency.
//
// This function decides only WHAT VALUE gets written into our own, self-controlled
// header (CLIENT_ADDRESS_HEADER below) — never whether or where to write it, and it
// knows nothing about Fastify or better-auth. Kept pure and framework-free
// (peer/headers/policy in, string out) specifically so every resolution branch is
// unit-testable without booting an HTTP layer (stakeholder's addendum on #350:
// "build it as a thin adapter over a pure function ... where TRUSTED_PROXIES lands
// when #292 arrives"). `stamp-client-address.ts` is the thin Fastify adapter that
// calls this and writes the result.
import type { IncomingHttpHeaders } from 'node:http'

/**
 * The header better-auth is pointed at EXCLUSIVELY via
 * `advanced.ipAddress.ipAddressHeaders` (better-auth.ts). `ipAddressHeaders` REPLACES
 * the library's own default list (`['x-forwarded-for']`) rather than adding to it —
 * once this is the only entry, better-auth never reads `x-forwarded-for` at all, from
 * any caller, under any configuration. That is what makes the header
 * non-forgeable: it isn't the name that protects it, it's that
 * `resolveClientAddress` below always overwrites (or extends from a
 * self-observed anchor) whatever a caller sent, before better-auth ever sees the
 * request — see `stamp-client-address.ts`.
 */
export const CLIENT_ADDRESS_HEADER = 'x-steuereule-client-address'

export interface ClientAddressPolicy {
  /**
   * The same list `resolveTrustedProxies()` (config/trusted-proxies.ts) produces —
   * empty means "no reverse proxy in front of this deployment" (`TRUSTED_PROXIES`
   * unset or the explicit `none`); a non-empty IP/CIDR list means a real proxy sits
   * in front and its hops must be preserved for better-auth's own right-to-left
   * peel (`getIPFromHeader`) to keep working, exactly as it does today.
   */
  trustedProxies: string[]
}

/**
 * Resolves the value to stamp into `CLIENT_ADDRESS_HEADER` for one request.
 *
 * - **No trusted proxy configured** (`policy.trustedProxies` empty — today's actual
 *   posture outside a not-yet-existing deployment, #292): the socket peer IS the
 *   client. Returns `peer` alone. This OVERWRITES, never appends — nothing inbound
 *   is read on this branch at all, so a caller who also sends `x-forwarded-for` or
 *   even `CLIENT_ADDRESS_HEADER` itself cannot influence the result. That is the
 *   entire non-forgeability property on this branch: it holds by construction, not
 *   by validating the inbound value.
 * - **A trusted proxy chain IS configured**: `peer` is the nearest hop this process
 *   itself observed over the actual TCP connection — either the real proxy (the
 *   intended shape once #292's deployment exists), or, if this origin is still
 *   reachable directly, an attacker (the residual gap `trusted-proxies.ts` already
 *   documents and that only a network property, not this resolver, can close).
 *   Either way, `peer` is APPENDED to whatever `x-forwarded-for` chain was
 *   received — never replacing it — so better-auth's own `getIPFromHeader` (not
 *   reimplemented here; better-auth still owns the peeling algorithm) keeps
 *   stripping trusted hops from the right exactly as it does today. The multi-hop
 *   path is a pure extension of the existing chain.
 * - **No peer at all** (defensive only — Fastify's own `request.ip` should never be
 *   empty behind a real socket): returns `null`, meaning "write nothing"; the
 *   caller (`stamp-client-address.ts`) removes any stale value instead, so
 *   better-auth falls back to its own unmodified default behaviour rather than
 *   seeing a stamp that lies.
 */
export function resolveClientAddress(peer: string | null | undefined, headers: IncomingHttpHeaders, policy: ClientAddressPolicy): string | null {
  if (!peer) return null

  if (policy.trustedProxies.length === 0) {
    return peer
  }

  const inbound = headers['x-forwarded-for']
  const inboundChain = Array.isArray(inbound) ? inbound.join(', ') : inbound
  return inboundChain && inboundChain.length > 0 ? `${inboundChain}, ${peer}` : peer
}
