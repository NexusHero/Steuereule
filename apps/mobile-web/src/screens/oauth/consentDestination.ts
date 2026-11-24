export interface RedirectTarget {
  readonly uri: string
  readonly destination: string
}

/**
 * Where approving this request sends the access: the destination of the redirect address the request names,
 * when the client registered it; otherwise every destination the client registered, since one of them it is.
 * An assistant picks its own name, so this is what tells the user whose assistant it really is.
 */
export function consentDestinations(targets: readonly RedirectTarget[], oauthQuery: string): string[] {
  const requested = new URLSearchParams(oauthQuery).get('redirect_uri')
  const match = targets.find((target) => target.uri === requested)
  return match ? [match.destination] : [...new Set(targets.map((target) => target.destination))]
}
