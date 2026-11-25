/**
 * The step-up rule (beta review P6, API-1, API-12, H2-19), replacing the hand list of ADR-0106 D2:
 *
 *   Every action that creates a session or a credential, links an identity, grants a third party access, or
 *   exposes another person's data needs a fresh session or a fresh step-up grant.
 *
 * "Fresh" means a session younger than {@link STEP_UP_WINDOW_MS} that came from a real sign-in (a session
 * minted by the device flow is never fresh, see `device-session-anchor.ts`), or a step-up grant recorded for
 * this session within that window. A password account records the grant on `/verify-password`. An account
 * without a password signs in again with its passkey or its provider in place (no sign-out), which yields a
 * fresh session (WEB-50).
 *
 * Every better-auth endpoint is classified here, and every Nest route in `step-up-route-classification.test.ts`.
 * A new endpoint fails that test until it is decided.
 */
export const STEP_UP_WINDOW_MS = 5 * 60 * 1000

/** Why an action needs the step-up. */
export type SensitiveAction =
  | 'creates-session'
  | 'creates-credential'
  | 'removes-credential'
  | 'links-identity'
  | 'grants-third-party'
  | 'exposes-other-person'
  | 'ends-account'
  /** A consent that was given with the step-up is taken back with it (decision 3: Person B's year). */
  | 'changes-consent'
  /** Not one of the rule's four, but the same proof since ADR-0107 L1: the whole account in one download. */
  | 'exports-account'

/** better-auth endpoints (paths under `/api/auth`) that need the step-up. */
export const BETTER_AUTH_STEP_UP: Readonly<Record<string, SensitiveAction>> = {
  '/passkey/generate-register-options': 'creates-credential',
  '/passkey/verify-registration': 'creates-credential',
  // A stolen session must not take a sign-in method away from the owner either (H2-19).
  '/passkey/delete-passkey': 'removes-credential',
  // Only an accepting consent; declining takes nothing away (handled in the plugin).
  '/oauth2/consent': 'grants-third-party',
  // A consent must not be widened, nor an authorize flow resumed, from a stale session (ADR-0107 L2).
  '/oauth2/update-consent': 'grants-third-party',
  '/oauth2/continue': 'grants-third-party',
  // Client credentials are credentials (H2-19): a new client, a new secret, new keys, new redirect targets.
  '/oauth2/create-client': 'creates-credential',
  '/oauth2/update-client': 'creates-credential',
  '/oauth2/client/rotate-secret': 'creates-credential',
  '/oauth2/client/rotate-keys': 'creates-credential',
  // A JWT signed for the session's user (H2-19).
  '/token': 'creates-credential',
  '/link-social': 'links-identity',
  '/unlink-account': 'links-identity',
  // Disabled by configuration (no `user.changeEmail`/`user.deleteUser`), gated in case that changes.
  '/change-email': 'links-identity',
  '/delete-user': 'ends-account',
  '/delete-user/callback': 'ends-account',
}

/** better-auth endpoints that need no step-up, each with the reason. */
export const BETTER_AUTH_NO_STEP_UP: Readonly<Record<string, string>> = {
  '/sign-up/email': 'Creates an account that is usable only after the verification link (ADR-0109 §11).',
  '/sign-in/email': 'A sign-in: the password is the proof; the new session is fresh by definition.',
  '/sign-in/social': 'A sign-in at the provider; also the re-authentication of an account without a password.',
  '/callback/:id': 'Completes a provider sign-in or a link-social that was itself stepped up.',
  '/sign-out': 'Ends the own session.',
  '/get-session': 'Reads the own session.',
  '/verify-email': 'Confirms the address; does not sign in (ADR-0109 §11).',
  '/send-verification-email': 'Sends a link to the account’s own address; better-auth limiter.',
  '/request-password-reset': 'Mail to the account’s own address; limited per address and target (ADR-0109 §10).',
  '/reset-password': 'Needs the one-time token from that mail.',
  '/reset-password/:token': 'Redirect carrying the token to the web app.',
  '/change-password': 'Needs the current password; rotates the session and ends assistant grants (ADR-0103, ADR-0106 D5).',
  '/verify-password': 'Is the step-up itself; limited per session and account.',
  '/list-sessions': 'Lists the own sessions without their tokens (WEB-22).',
  '/revoke-session': 'Ends a session; takes access away.',
  '/revoke-sessions': 'Ends sessions; takes access away.',
  '/revoke-other-sessions': 'Ends sessions; takes access away.',
  '/update-session': 'Only additional session fields, of which there are none.',
  '/update-user': 'Display name and image of the own account.',
  '/list-accounts': 'Which sign-in methods the own account has.',
  '/account-info': 'Provider profile of the own linked account.',
  '/get-access-token': 'Provider tokens are not stored (API-18), so there is nothing to hand out.',
  '/refresh-token': 'Provider tokens are not stored (API-18), so there is nothing to refresh.',
  '/two-factor/enable': 'better-auth requires the password in the body.',
  '/two-factor/disable': 'better-auth requires the password in the body.',
  '/two-factor/get-totp-uri': 'better-auth requires the password in the body.',
  '/two-factor/generate-backup-codes': 'better-auth requires the password in the body.',
  '/two-factor/verify-totp': 'Second factor of a sign-in.',
  '/two-factor/verify-otp': 'Second factor of a sign-in.',
  '/two-factor/send-otp': 'Second factor of a sign-in.',
  '/two-factor/verify-backup-code': 'Second factor of a sign-in.',
  '/passkey/generate-authenticate-options': 'A passkey sign-in; also the re-authentication of an account without a password.',
  '/passkey/verify-authentication': 'A passkey sign-in: the authenticator is the proof; the new session is fresh.',
  '/passkey/list-user-passkeys': 'Lists the own passkeys.',
  '/passkey/update-passkey': 'Renames an own passkey.',
  '/jwks': 'Public keys.',
  '/oauth2/authorize': 'Re-uses an existing consent only; a new or wider one goes through the gated consent (ADR-0107).',
  '/oauth2/token': 'Authenticated by the client and the authorization code or refresh token.',
  '/oauth2/register': 'Unauthenticated client registration grants nothing; limited, swept after a week (ADR-0052).',
  '/oauth2/introspect': 'Client-authenticated token check.',
  '/oauth2/revoke': 'Revokes a token.',
  '/oauth2/userinfo': 'Bearer-authenticated claims of the token’s own user.',
  '/oauth2/end-session': 'Ends a session.',
  '/oauth2/end-session/confirm': 'Ends a session.',
  '/oauth2/get-consent': 'Reads the own consent.',
  '/oauth2/get-consents': 'Reads the own consents.',
  '/oauth2/delete-consent': 'Withdraws a consent; takes access away.',
  '/oauth2/get-client': 'Reads a client.',
  '/oauth2/get-clients': 'Reads the own clients.',
  '/oauth2/delete-client': 'Deletes an own client; takes access away.',
  '/oauth2/public-client': 'Public client metadata for the consent page.',
  '/oauth2/public-client-prelogin': 'Public client metadata for the login page.',
  '/.well-known/oauth-authorization-server': 'Public metadata.',
  '/.well-known/openid-configuration': 'Public metadata.',
  '/device': 'Disabled; replaced by /v1/device (device-authorization-paths.ts).',
  '/device/code': 'Disabled; replaced by /v1/device (device-authorization-paths.ts).',
  '/device/approve': 'Disabled; replaced by /v1/device/approve, which is stepped up.',
  '/device/deny': 'Disabled; replaced by /v1/device.',
  '/device/token': 'Disabled; replaced by /v1/device/token.',
  '/ok': 'Health.',
  '/error': 'Error page.',
}

/** Server-only endpoints (`SERVER_ONLY`) are not reachable over HTTP; they are listed by name. */
export const BETTER_AUTH_SERVER_ONLY_PREFIXES = ['/admin/oauth2/'] as const

export function needsStepUp(path: string | undefined): boolean {
  return path !== undefined && Object.prototype.hasOwnProperty.call(BETTER_AUTH_STEP_UP, path)
}

export function isFreshSession(createdAt: Date | string | number, now = Date.now()): boolean {
  return now - new Date(createdAt).getTime() < STEP_UP_WINDOW_MS
}
