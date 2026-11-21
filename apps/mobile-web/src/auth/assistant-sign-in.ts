/**
 * Whether this page is the login of an assistant's connection (ADR-0052 §2): better-auth sends the user
 * here with a signed OAuth request in the address. The sign-in then goes on to the consent on its own
 * (oauthProviderClient), so the page must not move to the app on success.
 */
export function isAssistantSignIn(search: string = typeof window === 'undefined' ? '' : window.location.search): boolean {
  const params = new URLSearchParams(search)
  return params.has('sig') && params.has('client_id')
}

/**
 * Switches between login and registration inside an assistant's connection, keeping the signed request
 * exactly as it is (repeated keys and order matter for its signature, so it cannot travel as route
 * params). Returns false outside such a connection, where the app navigates as usual.
 */
export function carryAssistantSignIn(path: string, go: (url: string) => void = (url) => window.location.assign(url)): boolean {
  if (typeof window === 'undefined' || !isAssistantSignIn(window.location.search)) return false
  go(`${path}${window.location.search}`)
  return true
}
