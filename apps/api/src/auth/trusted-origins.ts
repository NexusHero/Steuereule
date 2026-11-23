/**
 * The one trusted-origin allowlist, shared by better-auth's own origin/CSRF check and the
 * `OriginCsrfGuard` that protects the `/v1` controllers (ADR-0012 §5's "single source of truth,
 * no second drifting copy" rule, ADR-0103). It is the CORS allowlist plus the web app's own
 * origin — the same formula better-auth's `trustedOrigins` option is given.
 */
export function mergeTrustedOrigins(corsOrigins: readonly string[], webAppUrl: string): string[] {
  return [...new Set([...corsOrigins, new URL(webAppUrl).origin])]
}
