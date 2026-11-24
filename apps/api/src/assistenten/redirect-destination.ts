/**
 * Where an approval sends the user's access, in the words the consent screen shows.
 *
 * An MCP client registers itself without signing in and picks its own name, so the name proves nothing: a
 * client called "Claude" may redirect to anyone's server. The registered redirect address is the one thing
 * the client cannot fake, because the authorization code is only ever sent there.
 */
export const DEVICE_DESTINATION = 'localhost'

const LOOPBACK_HOST = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/

/**
 * The host of a web redirect (in its ASCII form, so a look-alike domain shows as `xn--…`), `localhost` for a
 * loopback redirect of an app on the user's machine (RFC 8252), the scheme for an app's own scheme
 * (`cursor://`), and null for an address that is none.
 */
export function redirectDestinationOf(redirectUri: string): string | null {
  let url: URL
  try {
    url = new URL(redirectUri)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return `${url.protocol}//`
  if (LOOPBACK_HOST.test(url.hostname)) return DEVICE_DESTINATION
  return url.hostname
}
