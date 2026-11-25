/**
 * Points the post-verification redirect at the web app. The callback is kept only if it resolves to the web
 * app's own origin; a protocol-relative (`//host`), absolute foreign, or otherwise off-origin callback is
 * replaced with the sign-in page — an open-redirect guard (ADR-0104 L2), not a reliance on better-auth's
 * downstream originCheck. `//evil.com` must be rejected explicitly because `new URL('//evil.com', webAppUrl)`
 * resolves to `http://evil.com/`.
 */
/**
 * Where a verification link lands by default (WEB-5): the sign-in page with the note that the address is
 * confirmed. The link does not sign in (ADR-0109 §11). On an expired or invalid link better-auth appends
 * `error=TOKEN_EXPIRED` / `error=INVALID_TOKEN` to the same address, and the sign-in page says so.
 */
export const VERIFIED_LANDING_PATH = '/login?bestaetigt=1'

export function redirectVerificationToWebApp(verificationUrl: string, webAppUrl: string): string {
  const url = new URL(verificationUrl)
  const raw = url.searchParams.get('callbackURL') ?? '/'
  const webAppOrigin = new URL(webAppUrl).origin
  let target = `${webAppOrigin}${VERIFIED_LANDING_PATH}`
  if (!raw.startsWith('//')) {
    try {
      const resolved = new URL(raw, webAppUrl)
      // The web app root is the client's default, not a destination: the sign-in page with the note is.
      if (resolved.origin === webAppOrigin && resolved.pathname + resolved.search !== '/') target = resolved.toString()
    } catch {
      // keep the web app root
    }
  }
  url.searchParams.set('callbackURL', target)
  return url.toString()
}
