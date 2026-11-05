/** Points the post-verification redirect at the web app; better-auth resolves a relative callbackURL against the API. */
export function redirectVerificationToWebApp(verificationUrl: string, webAppUrl: string): string {
  const url = new URL(verificationUrl)
  const callback = url.searchParams.get('callbackURL') ?? '/'
  if (callback.startsWith('/')) {
    url.searchParams.set('callbackURL', new URL(callback, webAppUrl).toString())
  }
  return url.toString()
}
