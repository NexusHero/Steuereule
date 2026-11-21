// Row AS — the user creates the access for an MCP assistant in the profile (ADR-0052 amendment 4):
// „Assistent verbinden“ opens the form, a kind is picked, an own assistant („Anderer“) needs a name and a
// redirect address, „Zugang anlegen“ registers a public OAuth client, and the app shows the MCP server
// address and the client id to paste into the assistant. Real stack, no mock: the registration is the
// real `/api/auth/oauth2/register` of better-auth, and the stored client is read back from Postgres.

const ROW = 'Row AS'
const CLIENT_NAME = 'E2E-Eigener-Assistent'
// A loopback redirect (RFC 8252): allowed by the form's pattern and by the registration as a native client.
const REDIRECT_URI = 'http://127.0.0.1:33418/callback'

/** @param {any} ctx */
export async function run(ctx) {
  const { page, webOrigin, sql, tid, visible, gone, fail, until, TAG } = ctx

  await page.goto(`${webOrigin}/app/profil`, { waitUntil: 'networkidle' })
  await visible(page, 'assistent-verbinden', ROW)
  // The form is closed until the user asks for it.
  await gone(page, 'assistent-anlegen', ROW)
  await page.locator(tid('assistent-verbinden')).click()

  // A preset kind brings its own name and redirect: no inputs for those.
  await visible(page, 'assistent-art-claude', ROW)
  await page.locator(tid('assistent-art-claude')).click()
  await visible(page, 'assistent-anlegen', ROW)
  await gone(page, 'assistent-name', ROW)
  await gone(page, 'assistent-redirect', ROW)

  // „Anderer“ asks for both.
  await page.locator(tid('assistent-art-anderer')).click()
  await visible(page, 'assistent-name', ROW)
  await visible(page, 'assistent-redirect', ROW)

  // Client-side checks name what is missing before anything is sent.
  const alert = page.getByRole('alert')
  await page.locator(tid('assistent-anlegen')).click()
  await alert.getByText('Bitte geben Sie dem Assistenten einen Namen.').waitFor({ state: 'visible', timeout: 5_000 })
    .catch(() => fail(`${ROW}: an empty name should be named before the access is created`))
  await page.locator(tid('assistent-name')).fill(CLIENT_NAME)
  await page.locator(tid('assistent-redirect')).fill('http://example.com/callback')
  await page.locator(tid('assistent-anlegen')).click()
  await alert.getByText(/Die Rückruf-Adresse muss mit https:\/\/ beginnen/).waitFor({ state: 'visible', timeout: 5_000 })
    .catch(() => fail(`${ROW}: a plain-http redirect off this machine should be refused`))
  await gone(page, 'assistent-angelegt', ROW)

  // A valid loopback redirect: the real registration answers with the client id.
  await page.locator(tid('assistent-redirect')).fill(REDIRECT_URI)
  const registered = page.waitForResponse((r) => r.url().includes('/oauth2/register') && r.request().method() === 'POST', { timeout: 20_000 })
  await page.locator(tid('assistent-anlegen')).click()
  const res = await registered
  if (!res.ok()) fail(`${ROW}: the registration should succeed, got ${res.status()}: ${(await res.text()).slice(0, 200)}`)
  const body = await res.json()
  const issuedId = typeof body?.client_id === 'string' ? body.client_id : ''
  if (issuedId.length === 0) fail(`${ROW}: the registration should return a client id, got ${JSON.stringify(body).slice(0, 200)}`)
  if (body.client_secret) fail(`${ROW}: a public client (PKCE) must get no client secret`)

  // The created state: the two values to paste, and no form anymore.
  await visible(page, 'assistent-angelegt', ROW)
  await gone(page, 'assistent-anlegen', ROW)
  const shownId = (await page.locator(tid('assistent-client-id')).innerText()).trim()
  if (shownId !== issuedId) fail(`${ROW}: the shown client id should be the issued one, got "${shownId}" vs "${issuedId}"`)
  const serverAddress = (await page.locator(tid('assistent-server-adresse')).innerText()).trim()
  if (!/^https?:\/\/[^\s/]+.*\/mcp\/sse$/.test(serverAddress)) fail(`${ROW}: the server address should be the API's MCP endpoint, got "${serverAddress}"`)

  // The client is stored with what the form sent.
  const quotedId = issuedId.replace(/'/g, "''")
  await until(
    () => sql(`SELECT name || '|' || array_to_string("redirectUris", ',') || '|' || coalesce("tokenEndpointAuthMethod", '') FROM "OauthClient" WHERE "clientId" = '${quotedId}'`),
    `${CLIENT_NAME}|${REDIRECT_URI}|none`,
    `${ROW}: the registered client should be stored with its name, redirect and no secret`,
  )

  console.log(`[${TAG}] ✅ Row AS — the profile creates an assistant's access: kind, name, redirect checked; client id ${issuedId.slice(0, 8)}… and ${serverAddress} shown`)
}
