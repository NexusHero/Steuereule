// Account and security (#450 Teil 5A): the flows that so far were only opened and cancelled.
//   Row A — Profil bearbeiten: change, save, reload → the value stays.
//   Row B — Zwei-Faktor: set up in the Sicherheit screen (TOTP secret read from the screen, code
//           computed here per RFC 6238), sign in with a wrong code (refused), with the right code
//           (in), and with a backup code (API).
//   Row C — Geräte: two browsers signed in; A signs B out → B is out on its next request.
//   Row D — OAuth consent and connected assistants: a local test client asks for access;
//           „Ablehnen“ redirects with access_denied, „Erlauben“ with a code; the token opens the
//           MCP endpoint; revoking the assistant in the profile → the token is refused.
//   Row E — Konto löschen, both ways: „Erst exportieren“ (a file is downloaded) and „Ohne Export
//           weiter“; afterwards the sign-in fails.
// The e-mail verification banner has its own gate (e2e/visibility/visibility-refetch.mjs).
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { request as playwrightRequest } from 'playwright-core'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { FLOW_COPY, skipSplash, signUpOutOfBand } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const PASSWORD = 'Sicheres-Passwort-1!'
const TAG = 'account-security'
const REDIRECT_URI = 'http://127.0.0.1:9/callback'

async function account(apiOrigin, webOrigin, sql, label) {
  const email = `account-${label}-${Date.now()}@beispiel.de`
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', TAG)
  await signUpOutOfBand(apiOrigin, webOrigin, email, PASSWORD)
  sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)
  return email
}

async function apiSignIn(apiOrigin, webOrigin, email) {
  const api = await playwrightRequest.newContext({ baseURL: apiOrigin, extraHTTPHeaders: { origin: webOrigin } })
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  const res = await api.post('/api/auth/sign-in/email', { data: { email, password: PASSWORD } })
  return { api, res, body: await res.json().catch(() => null) }
}

async function browserSignIn(browser, webOrigin, email, breakpoint = 'l') {
  const ctx = await newContextAtBreakpoint(browser, breakpoint)
  const page = await ctx.newPage()
  guardAgainst429(page, fail, '/api/auth/')
  await skipSplash(page, webOrigin)
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  await page.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder).fill(email)
  await page.getByPlaceholder(FLOW_COPY.loginPasswordPlaceholder).fill(PASSWORD)
  await page.getByRole('button', { name: FLOW_COPY.loginSubmit }).click()
  return { ctx, page }
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) from an otpauth:// URI. */
function totp(uri, offsetSteps = 0) {
  const secret = new URL(uri).searchParams.get('secret')
  if (!secret) fail(`no secret in ${uri}`)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps))
  const hmac = createHmac('sha1', key).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(code).padStart(6, '0')
}

async function waitForCallback(page, box) {
  for (let i = 0; i < 40; i++) {
    if (box.value !== null) return
    await page.waitForTimeout(250)
  }
}

async function mcpStatus(apiOrigin, token) {
  const controller = new AbortController()
  try {
    const res = await fetch(`${apiOrigin}/mcp/sse`, { headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' }, signal: controller.signal })
    return res.status
  } finally {
    controller.abort()
  }
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    // Row A — Profil bearbeiten.
    const alice = await account(apiOrigin, webOrigin, sql, 'alice')
    {
      const { ctx, page } = await browserSignIn(browser, webOrigin, alice)
      await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
      await page.goto(`${webOrigin}/app/profil`, { waitUntil: 'networkidle' })
      await page.locator('[data-testid="profil-bearbeiten"]').click()
      await page.locator('[data-testid="profil-vorname"]').fill('Ada')
      await page.locator('[data-testid="profil-nachname"]').fill('Lovelace')
      await page.locator('[data-testid="profil-speichern"]').click()
      await page.locator('[data-testid="profil-gespeichert"]').waitFor({ state: 'visible', timeout: 10_000 })
      await page.reload({ waitUntil: 'networkidle' })
      const name = await page.locator('[data-testid="profil-name"]').innerText()
      if (!name.includes('Ada Lovelace')) fail(`Row A: after a reload the profile must show „Ada Lovelace“, got „${name}“`)
      console.log(`[${TAG}] ✅ Row A — profile edited, saved, still there after a reload`)

      // Row B — Zwei-Faktor einrichten.
      await page.goto(`${webOrigin}/app/profil/sicherheit`, { waitUntil: 'networkidle' })
      await page.locator('[data-testid="zweifaktor-einrichten"]').click()
      await page.locator('[data-testid="zweifaktor-passwort"]').fill(PASSWORD)
      await page.locator('[data-testid="zweifaktor-passwort-weiter"]').click()
      const uri = await page.locator('[data-testid="zweifaktor-totp-uri"]').innerText({ timeout: 10_000 })
      const backupCodes = (await page.locator('[data-testid="zweifaktor-backup-codes"]').innerText()).split(/\s+/).filter(Boolean)
      await page.locator('[data-testid="zweifaktor-code"]').fill(totp(uri))
      await page.locator('[data-testid="zweifaktor-code-bestaetigen"]').click()
      await page.locator('[data-testid="zweifaktor-abschalten"]').waitFor({ state: 'visible', timeout: 10_000 })
      await ctx.close()

      const second = await browserSignIn(browser, webOrigin, alice)
      const codeInput = second.page.locator('[data-testid="login-zweifaktor-code"]')
      await codeInput.waitFor({ state: 'visible', timeout: 15_000 })
      const wrong = totp(uri) === '000000' ? '111111' : '000000'
      await codeInput.fill(wrong)
      await second.page.locator('[data-testid="login-zweifaktor-bestaetigen"]').click()
      await second.page.locator('[role="alert"]').first().waitFor({ state: 'visible', timeout: 10_000 })
      if (new URL(second.page.url()).pathname === '/app') fail('Row B: a wrong TOTP code must not sign in')
      await codeInput.fill(totp(uri))
      await second.page.locator('[data-testid="login-zweifaktor-bestaetigen"]').click()
      await second.page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
      await second.ctx.close()

      // Backup code: the sign-in asks for the second factor, a backup code completes it.
      const viaBackup = await apiSignIn(apiOrigin, webOrigin, alice)
      if (viaBackup.body?.twoFactorRedirect !== true) fail(`Row B: the sign-in must ask for the second factor, got ${JSON.stringify(viaBackup.body)}`)
      const backup = await viaBackup.api.post('/api/auth/two-factor/verify-backup-code', { data: { code: backupCodes[0] } })
      if (!backup.ok()) fail(`Row B: a backup code must complete the sign-in, got ${backup.status()}`)
      await viaBackup.api.dispose()
      console.log(`[${TAG}] ✅ Row B — 2FA set up from the screen; wrong code refused, TOTP and backup code sign in`)
    }

    // Row C — sign a second device out.
    const bob = await account(apiOrigin, webOrigin, sql, 'bob')
    {
      const a = await browserSignIn(browser, webOrigin, bob)
      await a.page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
      const b = await browserSignIn(browser, webOrigin, bob)
      await b.page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
      await a.page.goto(`${webOrigin}/app/profil`, { waitUntil: 'networkidle' })
      // Every other session (the sign-up left one too) is signed out, one after the other.
      const others = a.page.locator('[data-testid="geraet-abmelden"]')
      await others.first().waitFor({ state: 'visible', timeout: 10_000 })
      for (let count = await others.count(); count > 0; count = await others.count()) {
        const revoked = a.page.waitForResponse((r) => r.url().includes('/revoke-session') && r.request().method() === 'POST', { timeout: 10_000 })
        await others.first().click()
        if (!(await revoked).ok()) fail('Row C: „Gerät abmelden“ must succeed')
        await a.page.waitForFunction((n) => document.querySelectorAll('[data-testid="geraet-abmelden"]').length < n, count, { timeout: 10_000 })
      }
      if ((await a.page.locator('[data-testid="geraet-abmelden-aktuell"]').count()) !== 1) fail('Row C: the current device must stay listed')
      // The signed-out device has no session any more. FINDING (#450 5A): the app then keeps showing
      // the cockpit as a guest instead of leading to the sign-in.
      const session = await b.ctx.request.get(`${apiOrigin}/api/auth/get-session`, { headers: { origin: webOrigin } })
      const body = await session.json().catch(() => null)
      if (body !== null && body?.session) fail(`Row C: the signed-out device must have no session, got ${JSON.stringify(body).slice(0, 120)}`)
      const data = await b.ctx.request.get(`${apiOrigin}/v1/profile`, { headers: { origin: webOrigin } })
      const profile = await data.json().catch(() => null)
      if (data.ok() && profile?.firstName) fail('Row C: the signed-out device must not read the account profile')
      await a.ctx.close()
      await b.ctx.close()
      console.log(`[${TAG}] ✅ Row C — the other device signed out; it has no session and reads no account data`)
    }

    // Row D — OAuth consent (deny, allow), token on MCP, revoke in the profile.
    {
      const reg = await fetch(`${apiOrigin}/api/auth/oauth2/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ application_type: 'native', client_name: 'E2E-Testassistent', redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'] }),
      })
      if (!reg.ok) fail(`Row D: client registration answered ${reg.status}: ${(await reg.text()).slice(0, 200)}`)
      const client = await reg.json()
      const { ctx, page } = await browserSignIn(browser, webOrigin, bob)
      await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
      /** @type {{ value: URL | null }} */
      const callbackBox = { value: null }
      await page.route('http://127.0.0.1:9/**', async (route) => {
        callbackBox.value = new URL(route.request().url())
        await route.fulfill({ status: 200, body: 'ok' })
      })
      const authorize = async () => {
        const verifier = randomBytes(32).toString('base64url')
        const challenge = createHash('sha256').update(verifier).digest('base64url')
        const params = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT_URI, scope: 'openid steuerdaten:read', state: 'e2e', code_challenge: challenge, code_challenge_method: 'S256' })
        callbackBox.value = null
        await page.goto(`${apiOrigin}/api/auth/oauth2/authorize?${params}`, { waitUntil: 'networkidle' })
        return verifier
      }
      await authorize()
      await page.locator('[data-testid="oauth-ablehnen"]').click()
      await waitForCallback(page, callbackBox)
      if (callbackBox.value?.searchParams.get('error') !== 'access_denied') fail(`Row D: „Ablehnen“ must redirect with error=access_denied, got ${callbackBox.value}`)

      const verifier = await authorize()
      await page.locator('[data-testid="oauth-erlauben"]').click()
      await waitForCallback(page, callbackBox)
      const code = callbackBox.value?.searchParams.get('code')
      if (!code) fail(`Row D: „Erlauben“ must redirect with a code, got ${callbackBox.value}`)
      const tokenRes = await fetch(`${apiOrigin}/api/auth/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: client.client_id, code_verifier: verifier }),
      })
      if (!tokenRes.ok) fail(`Row D: token exchange answered ${tokenRes.status}: ${(await tokenRes.text()).slice(0, 200)}`)
      const { access_token: accessToken } = await tokenRes.json()
      const before = await mcpStatus(apiOrigin, accessToken)
      if (before !== 200) fail(`Row D: the token must open the MCP endpoint, got ${before}`)

      await page.goto(`${webOrigin}/app/profil`, { waitUntil: 'networkidle' })
      const revokedAssistant = page.waitForResponse((r) => r.url().includes(`/v1/assistenten/${client.client_id}`) && r.request().method() === 'DELETE', { timeout: 10_000 })
      await page.locator(`[data-testid="assistent-widerrufen-${client.client_id}"]`).click()
      if (!(await revokedAssistant).ok()) fail('Row D: revoking the assistant must succeed')
      const after = await mcpStatus(apiOrigin, accessToken)
      if (after === 200) fail('Row D: after revoking the assistant its token must be refused')
      await ctx.close()
      console.log(`[${TAG}] ✅ Row D — consent denied (access_denied) and allowed (code); token opens MCP (200), refused after revoking (${after})`)
    }

    // Row E — delete the account, with export first and without.
    for (const way of ['erst-exportieren', 'ohne-export']) {
      const email = await account(apiOrigin, webOrigin, sql, `delete-${way}`)
      const { ctx, page } = await browserSignIn(browser, webOrigin, email)
      await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
      await page.goto(`${webOrigin}/app/profil/datenschutz`, { waitUntil: 'networkidle' })
      await page.locator('[data-testid="konto-loeschen-oeffnen"]').click()
      if (way === 'erst-exportieren') {
        const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), page.locator('[data-testid="konto-loeschen-erst-exportieren"]').click()])
        const file = await download.path()
        if (!file) fail('Row E: the export must download a file')
      }
      await page.locator('[data-testid="konto-loeschen-ohne-export"]').click()
      await page.locator('[data-testid="konto-loeschen-bestaetigen"]').click()
      // The password is asked only when the session is not fresh enough; otherwise the deletion runs.
      const passwordField = page.locator('[data-testid="konto-loeschen-passwort"]')
      const login = page.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder)
      await passwordField.or(login).first().waitFor({ state: 'visible', timeout: 20_000 })
      if (await passwordField.isVisible()) {
        await passwordField.fill(PASSWORD)
        await page.locator('[data-testid="konto-loeschen-endgueltig"]').click()
      }
      await login.waitFor({ state: 'visible', timeout: 20_000 })
      await ctx.close()
      const attempt = await apiSignIn(apiOrigin, webOrigin, email)
      if (attempt.res.ok()) fail(`Row E (${way}): a deleted account must not sign in`)
      await attempt.api.dispose()
      console.log(`[${TAG}] ✅ Row E — deleted (${way}); the sign-in fails afterwards`)
    }

    console.log(`[${TAG}] PASS — profile, 2FA, devices, OAuth/MCP and account deletion verified.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
