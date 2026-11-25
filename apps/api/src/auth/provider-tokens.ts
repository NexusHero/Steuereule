/**
 * Google/Apple tokens are not stored (API-18). better-auth writes the provider's access, refresh and ID token into
 * `Account` on every social sign-in and link. SteuerEule uses the provider only to sign in: no code reads these
 * tokens, and a database read would otherwise hand them out in plaintext. Not storing them beats encrypting
 * them. `/get-access-token` and `/refresh-token` then have nothing to return.
 */
const PROVIDER_TOKEN_FIELDS = ['accessToken', 'refreshToken', 'idToken', 'accessTokenExpiresAt', 'refreshTokenExpiresAt'] as const

export function withoutProviderTokens<T extends Record<string, unknown>>(account: T): { data: T } {
  const data: Record<string, unknown> = { ...account }
  for (const field of PROVIDER_TOKEN_FIELDS) {
    if (field in data) data[field] = null
  }
  return { data: data as T }
}
