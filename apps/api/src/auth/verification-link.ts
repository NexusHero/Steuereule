/**
 * Points the post-verification redirect at the web app. The callback is kept only if it resolves to the web
 * app's own origin; a protocol-relative (`//host`), absolute foreign, or otherwise off-origin callback is
 * replaced with the web app root — an open-redirect guard (ADR-0104 L2), not a reliance on better-auth's
 * downstream originCheck. `//evil.com` must be rejected explicitly because `new URL('//evil.com', webAppUrl)`
 * resolves to `http://evil.com/`.
 */
export function redirectVerificationToWebApp(verificationUrl: string, webAppUrl: string): string {
  const url = new URL(verificationUrl)
  const raw = url.searchParams.get('callbackURL') ?? '/'
  const webAppOrigin = new URL(webAppUrl).origin
  let target = `${webAppOrigin}/`
  if (!raw.startsWith('//')) {
    try {
      const resolved = new URL(raw, webAppUrl)
      if (resolved.origin === webAppOrigin) target = resolved.toString()
    } catch {
      // keep the web app root
    }
  }
  url.searchParams.set('callbackURL', target)
  return url.toString()
}
