// REQ-007 — the WebAuthn passkey half (better-auth `@better-auth/passkey` plugin, ticket 14),
// real Postgres + real HTTP against the real `buildApp()`. Proves the acceptance clauses the
// plugin *actually implements*, and states — loudly, not silently — the two ADR-052 clauses it
// does not (see "Honest boundary" below and the REQ-007 register row).
//
// What this test proves against the real deployed artifact:
//   (1) opt-in — a fresh account starts with zero passkeys; adding one is voluntary, never a
//       sign-up requirement.
//   (2) registration — `GET /passkey/generate-register-options` → `POST /passkey/verify-registration`
//       persists a WebAuthn credential (challenge + attestation over the plugin's own routes),
//       and the stored public key is what the plugin verifies against on the next sign-in.
//   (3) passwordless sign-in — `GET /passkey/generate-authenticate-options` →
//       `POST /passkey/verify-authentication` mints a real session for the owning user, with no
//       primary factor (email/password) first.
//   (4) list + delete are session- and ownership-gated — a second account's session cannot
//       delete the first account's passkey.
//
// What the WebAuthn mock does NOT prove (stated here, not hidden — no silent weakening):
//   The "mocked authenticator" is a freshly generated P-256 keypair in the test process that
//   builds a real WebAuthn registration/authentication response (attestation object, authData,
//   clientDataJSON, ECDSA signature — CBOR via `@levischuck/tiny-cbor`, the same library
//   SimpleWebAuthn decodes with). The plugin then verifies it through SimpleWebAuthn's REAL
//   `verifyRegistrationResponse`/`verifyAuthenticationResponse`: signature verification,
//   challenge binding, RP-ID-hash and origin matching are all genuinely exercised. What is NOT
//   exercised is the real browser `navigator.credentials` ceremony (`@simplewebauthn/browser`'s
//   `startRegistration`/`startAuthentication`) and any real hardware/authenticator attestation —
//   the authenticator is not a platform authenticator, so hardware-backed user-verification and
//   attested hardware statements are out of reach (the plugin requests `attestation: "none"`,
//   which is what a privacy-preserving platform returns; real attested hardware is not simulated).
//
// Honest boundary — two ADR-052 clauses the plugin does NOT implement (ADR-0035: framework
// standard, no Eigenbau — documented rather than interposed):
//   (a) "Login-Prompt nach Primärfaktor" — the plugin implements passkeys as a *passwordless*
//       sign-in method, NOT as a second factor inside better-auth's two-factor challenge flow.
//       `twoFactorMethods` only ever carries `totp`/`otp`; a passkey never appears there. The
//       test below pins this: registering a passkey does not make email+password login prompt
//       for it (no `twoFactorRedirect`, a session is minted directly).
//   (b) "Entfernung nur nach Re-Authentifizierung" — `deletePasskey` is session- AND
//       ownership-gated but does NOT require a password re-authentication the way TOTP's
//       `disable` does. The delete test below sends `{ id }` and no password, and it succeeds —
//       the plugin's own coverage, recorded here rather than forced with bespoke middleware on
//       the plugin's route (TOTP's re-auth is proven separately in req-007-totp.test.ts).
import { createHash, generateKeyPairSync, randomBytes, sign as signCrypto } from 'node:crypto'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { encodeCBOR } from '@levischuck/tiny-cbor'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-007-passkey-secret'
process.env.BETTER_AUTH_SECRET = 'req-007-passkey-better-auth-secret-0123456789'
// The RP ID is the API's own baseURL hostname (the plugin's default: `getRpID` = baseURL
// hostname when no `rpID` option is set) — a synthetic registrable domain, not the cross-site
// web-app origin the deployed demo actually splits across. Using one origin keeps the WebAuthn
// `expectedOrigin`/`expectedRPID` consistent for the test; a real cross-site deployment sets
// `rpID` explicitly (see the register row's known-limit note).
process.env.BETTER_AUTH_URL = 'https://passkey.example.com'

const ORIGIN = 'https://passkey.example.com'
const RP_ID = 'passkey.example.com'
process.env.CORS_ALLOWED_ORIGINS = ORIGIN

const PASSWORD = 'a-fine-strong-password-1'
const TRUSTED_ORIGIN_HEADERS = { origin: ORIGIN }

const b64u = (buf: Uint8Array | Buffer): string => Buffer.from(buf).toString('base64url')
const sha256 = (data: Uint8Array | Buffer): Buffer => createHash('sha256').update(data).digest()

/**
 * A test-double WebAuthn authenticator: a freshly generated P-256 keypair that produces real,
 * self-consistent WebAuthn registration and authentication responses for a fixed RP ID/origin.
 * The responses are not canned — they carry the actual challenge the server minted, and the
 * authentication response carries a real ECDSA signature over the authenticator data (the
 * registration response uses `attestation: "none"`, which is signature-less by design — proof of
 * possession is asserted on the *authentication* signature). So the plugin verifies them through
 * SimpleWebAuthn's real crypto path, not a stubbed verifier. Only the "authenticator" is fake:
 * the key lives in this test process, not on a platform/hardware authenticator (see the module
 * header's "does NOT prove" note).
 */
class MockAuthenticator {
  private readonly privateKey: ReturnType<typeof generateKeyPairSync>['privateKey']
  private readonly publicKey: ReturnType<typeof generateKeyPairSync>['publicKey']
  private readonly credentialId: Buffer
  /** The COSE-encoded public key (x/y) — the exact bytes the plugin stores as `publicKey`. */
  readonly cosePublicKey: Uint8Array

  constructor() {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    this.privateKey = privateKey
    this.publicKey = publicKey
    this.credentialId = randomBytes(32)
    const jwk = publicKey.export({ format: 'jwk' })
    // COSE key for P-256/ES256: kty=2 (EC2), alg=-7 (ES256), crv=1 (P-256), x/y = 32-byte
    // coordinates (COSEKEYS mapping read from @simplewebauthn/server's cose.js).
    this.cosePublicKey = encodeCBOR(
      new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x!, 'base64url')],
        [-3, Buffer.from(jwk.y!, 'base64url')],
      ]),
    )
  }

  /** Base64url of the credential ID — the plugin's `credentialID` lookup key on sign-in. */
  get credentialID(): string {
    return b64u(this.credentialId)
  }

  /**
   * Builds a `RegistrationResponseJSON` for the given registration options (attestation
   * `"none"`, the plugin's own request). The challenge/origin/RP ID are taken from the real
   * server-minted options so the plugin's `verifyRegistrationResponse` accepts them.
   */
  registrationResponse(options: { challenge: string }): Record<string, unknown> {
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin: ORIGIN, crossOrigin: false }),
    )
    const rpIdHash = sha256(Buffer.from(RP_ID, 'utf8'))
    // Flags: UP (0x01) | UV (0x04) | AT (0x40) — attested credential data present, no backup
    // bits (single-device credential). `requireUserVerification: false` is what the plugin
    // passes, so UV is informational rather than required.
    const flags = Buffer.from([0x45])
    const signCount = Buffer.from([0, 0, 0, 0])
    const aaguid = Buffer.alloc(16) // all-zero AAGUID — what `attestation: "none"` yields
    const credIdLen = Buffer.alloc(2)
    credIdLen.writeUInt16BE(this.credentialId.length)
    const attestedCredentialData = Buffer.concat([aaguid, credIdLen, this.credentialId, this.cosePublicKey])
    const authData = Buffer.concat([rpIdHash, flags, signCount, attestedCredentialData])
    // `fmt: "none"` carries an empty attStmt and no attestation signature — the plugin requests
    // `attestation: "none"`, so the credential's proof of possession is deferred to the
    // *authentication* signature (below), not asserted here.
    const attestationObject = encodeCBOR(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map<string, unknown>()],
        ['authData', authData],
      ]) as Parameters<typeof encodeCBOR>[0],
    )
    return {
      id: b64u(this.credentialId),
      rawId: b64u(this.credentialId),
      response: {
        clientDataJSON: b64u(clientDataJSON),
        attestationObject: b64u(attestationObject),
        transports: ['internal'],
      },
      type: 'public-key',
      clientExtensionResults: {},
    }
  }

  /**
   * Builds an `AuthenticationResponseJSON` for the given authentication options. Same real
   * signature path as registration; the plugin looks the credential up by `id` (credentialID)
   * and verifies the signature against the stored public key.
   */
  authenticationResponse(options: { challenge: string }): Record<string, unknown> {
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: ORIGIN, crossOrigin: false }),
    )
    const clientDataHash = sha256(clientDataJSON)
    const rpIdHash = sha256(Buffer.from(RP_ID, 'utf8'))
    // Flags: UP (0x01) | UV (0x04) — no attested credential data on assertion.
    const flags = Buffer.from([0x05])
    const signCount = Buffer.from([0, 0, 0, 0])
    const authData = Buffer.concat([rpIdHash, flags, signCount])
    const signature = signCrypto('sha256', Buffer.concat([authData, clientDataHash]), this.privateKey)
    return {
      id: b64u(this.credentialId),
      rawId: b64u(this.credentialId),
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
        userHandle: null,
      },
      type: 'public-key',
      clientExtensionResults: {},
    }
  }
}

/** Pulls one `name=value` cookie pair out of a (possibly multi-cookie) Set-Cookie header. */
function cookieNamed(setCookie: string | null, name: string): string {
  const match = setCookie?.match(new RegExp(`([^, ]*${name}=[^;]*)`))
  if (!match) throw new Error(`no ${name} cookie in set-cookie: ${setCookie}`)
  return match[1]!
}

describe('REQ-007 — WebAuthn passkey (passwordless sign-in), against the real server', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    const { buildApp } = await import('../../src/main.js')
    app = await buildApp()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    const { PrismaService } = await import('../../src/prisma/prisma.service.js')
    prisma = app.get(PrismaService)
  })

  afterEach(async () => {
    resetRateLimiters(app)
    await prisma.passkey.deleteMany()
    await prisma.twoFactor.deleteMany()
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.verification.deleteMany()
    await prisma.user.deleteMany()
    await prisma.profile.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  async function signUp(email: string): Promise<string> {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email, password: PASSWORD, name: 'Req 007 Passkey' }),
    })
    expect(response.status).toBe(200)
    return cookieNamed(response.headers.get('set-cookie'), 'session_token')
  }

  /** Registers one passkey for a signed-in account, returning the mock authenticator (whose
   *  keypair backs the credential) and the persisted passkey id from the plugin response. */
  async function registerPasskey(cookie: string, name = 'test key'): Promise<{ authenticator: MockAuthenticator; passkeyId: string }> {
    const optionsRes = await fetch(`${baseUrl}/api/auth/passkey/generate-register-options`, {
      headers: { cookie },
    })
    expect(optionsRes.status).toBe(200)
    const options = (await optionsRes.json()) as { challenge: string }
    const challengeCookie = cookieNamed(optionsRes.headers.get('set-cookie'), 'passkey')

    const authenticator = new MockAuthenticator()
    const verifyRes = await fetch(`${baseUrl}/api/auth/passkey/verify-registration`, {
      method: 'POST',
      headers: { cookie: `${cookie}; ${challengeCookie}`, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ response: authenticator.registrationResponse(options), name }),
    })
    expect(verifyRes.status).toBe(200)
    const passkey = (await verifyRes.json()) as { id: string; credentialID: string; name: string }
    expect(passkey.credentialID).toBe(authenticator.credentialID)
    expect(passkey.name).toBe(name)
    return { authenticator, passkeyId: passkey.id }
  }

  it('is opt-in: a fresh account starts with no passkeys', async () => {
    const cookie = await signUp('req007-passkey-optin@example.com')
    const list = await fetch(`${baseUrl}/api/auth/passkey/list-user-passkeys`, { headers: { cookie } })
    expect(list.status).toBe(200)
    expect(await list.json()).toEqual([])
  })

  it('registers a passkey (challenge → attestation → persisted) and stores the verifiable public key', async () => {
    const cookie = await signUp('req007-passkey-reg@example.com')
    const { authenticator } = await registerPasskey(cookie)

    // The persisted row carries the COSE public key the next sign-in verifies against, base64-
    // encoded (a public key, not a secret — REQ-003's field-encryption applies to secrets).
    const row = await prisma.passkey.findFirst({ where: { user: { email: 'req007-passkey-reg@example.com' } } })
    expect(row).not.toBeNull()
    expect(row!.credentialID).toBe(authenticator.credentialID)
    // The plugin persists the COSE public key via better-auth's `base64.encode` — *standard*
    // base64 (`+`/`/`/`=`), not the base64url the WebAuthn JSON fields use — so compare against
    // the standard encoding here, not `b64u`.
    expect(row!.publicKey).toBe(Buffer.from(authenticator.cosePublicKey).toString('base64'))
    expect(row!.deviceType).toBe('singleDevice')
    expect(row!.backedUp).toBe(false)
  })

  it('signs in passwordlessly with a registered passkey — no primary factor first', async () => {
    const cookie = await signUp('req007-passkey-login@example.com')
    const { authenticator } = await registerPasskey(cookie)

    // A fresh, logged-out caller obtains authentication options (the route is public).
    const optionsRes = await fetch(`${baseUrl}/api/auth/passkey/generate-authenticate-options`)
    expect(optionsRes.status).toBe(200)
    const options = (await optionsRes.json()) as { challenge: string }
    const challengeCookie = cookieNamed(optionsRes.headers.get('set-cookie'), 'passkey')

    const verifyRes = await fetch(`${baseUrl}/api/auth/passkey/verify-authentication`, {
      method: 'POST',
      headers: { cookie: challengeCookie, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ response: authenticator.authenticationResponse(options) }),
    })
    expect(verifyRes.status).toBe(200)
    const sessionCookie = cookieNamed(verifyRes.headers.get('set-cookie'), 'session_token')

    const session = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie: sessionCookie } })
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe('req007-passkey-login@example.com')
  })

  it('lists the registered passkey and removes it by id (session-gated, no password re-auth)', async () => {
    const cookie = await signUp('req007-passkey-delete@example.com')
    const { passkeyId } = await registerPasskey(cookie)

    const list = await fetch(`${baseUrl}/api/auth/passkey/list-user-passkeys`, { headers: { cookie } })
    const listed = (await list.json()) as { id: string }[]
    expect(listed.map((p) => p.id)).toContain(passkeyId)

    // Honest boundary (b): the body is `{ id }` only — no password. The plugin's delete is
    // session- and ownership-gated, not re-auth-gated; this succeeding is the plugin's own
    // coverage (see the module header), not a re-auth requirement being met.
    const del = await fetch(`${baseUrl}/api/auth/passkey/delete-passkey`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ id: passkeyId }),
    })
    expect(del.status).toBe(200)

    expect(await prisma.passkey.count({ where: { id: passkeyId } })).toBe(0)
  })

  it('rejects deleting another account\'s passkey (ownership isolation)', async () => {
    const ownerCookie = await signUp('req007-passkey-owner@example.com')
    const { passkeyId } = await registerPasskey(ownerCookie)

    const attackerCookie = await signUp('req007-passkey-attacker@example.com')
    const del = await fetch(`${baseUrl}/api/auth/passkey/delete-passkey`, {
      method: 'POST',
      headers: { cookie: attackerCookie, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ id: passkeyId }),
    })
    expect(del.status).toBeGreaterThanOrEqual(400)
    expect(await prisma.passkey.count({ where: { id: passkeyId } })).toBe(1)
  })

  it('documents the honest boundary: registering a passkey does not make email+password login prompt for it (passkey is passwordless, not 2FA)', async () => {
    const cookie = await signUp('req007-passkey-not2fa@example.com')
    await registerPasskey(cookie)

    // Honest boundary (a): a passkey never appears in `twoFactorMethods` — it is a passwordless
    // sign-in alternative, not a second factor in the TOTP challenge flow. After registering one,
    // email+password sign-in still mints a session directly, with no two-factor challenge.
    const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'req007-passkey-not2fa@example.com', password: PASSWORD }),
    })
    expect(signIn.status).toBe(200)
    const body = (await signIn.json()) as { twoFactorRedirect?: boolean; twoFactorMethods?: string[] }
    expect(body.twoFactorRedirect).toBeUndefined()
    expect(body.twoFactorMethods).toBeUndefined()
    // A session was minted directly, not a challenge.
    const sessionCookie = cookieNamed(signIn.headers.get('set-cookie'), 'session_token')
    const session = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie: sessionCookie } })
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe('req007-passkey-not2fa@example.com')
  })
})
