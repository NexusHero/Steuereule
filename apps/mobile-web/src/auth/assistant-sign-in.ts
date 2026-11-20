/**
 * Whether this page is the login of an assistant's connection (ADR-0052 §2): better-auth sends the user
 * here with a signed OAuth request in the address. The sign-in then goes on to the consent on its own
 * (oauthProviderClient), so the page must not move to the app on success.
 */
export function isAssistantSignIn(search: string = typeof window === 'undefined' ? '' : window.location.search): boolean {
  const params = new URLSearchParams(search)
  return params.has('sig') && params.has('client_id')
}
