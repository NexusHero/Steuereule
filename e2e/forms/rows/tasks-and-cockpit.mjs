// Row T — the tasks an assistant leaves (#547), what the cockpit still needs for the estimate (cf0373ba),
// the children's printout hint and the Veranlagungsart in the Abgabe, in a real browser on the real stack.
//
//   T1 — the cockpit names each missing LStB line, with its mask, and counts the assistant's tasks.
//   T2 — the confirmation screen lists the tasks; one is marked done, the other discarded.
//   T3 — the printout pre-check names only the child's details that are really missing.
//   T4 — a married couple filing jointly: the Abgabe says how the filing type is recorded.
//
// The tasks come from the MCP tool `aufgabe_fuer_nutzer`, called on the real `POST /mcp` endpoint with an
// assistant token. The OAuth consent flow that issues such a token is covered by e2e/account; here the
// client, the user's consent and the token are written straight into the database (as REQ-033's acceptance test does), so the
// row needs no second browser round through the consent page. No route mocks. Invented data only.
import { createHash, randomBytes } from 'node:crypto'
import { putPrintableBasics, putLstb } from '../../harness/api-account.mjs'
import { whereEmail } from '../../harness/email-hash.mjs'

const ASSISTANT_NAME = 'E2E-Assistent'
const TASK_DONE_TEXT = 'Bitte trag deine Konfession in den Angaben für die Erklärung ein.'
const TASK_DROP_TEXT = 'Bitte reich die Spendenquittung im Belege-Tab nach.'

/** An assistant client of the user with an opaque bearer token, as the OAuth server would store it. */
function seedAssistantToken(sql, email) {
  const userId = sql(`SELECT id FROM "User" WHERE ${whereEmail(email)};`).trim()
  if (!userId) throw new Error(`no user for ${email}`)
  const clientId = `e2e-client-${randomBytes(6).toString('hex')}`
  const rawToken = `e2e-token-${randomBytes(24).toString('hex')}`
  const tokenHash = createHash('sha256').update(rawToken).digest('base64url')
  const scopes = `ARRAY['openid','steuerdaten:read','steuerdaten:write']`
  const none = 'ARRAY[]::TEXT[]'
  sql(
    `INSERT INTO "OauthClient" ("id", "clientId", "name", "userId", "scopes", "redirectUris", "contacts", "postLogoutRedirectUris", "grantTypes", "responseTypes") ` +
      `VALUES (gen_random_uuid()::text, '${clientId}', '${ASSISTANT_NAME}', '${userId}', ${scopes}, ARRAY['http://localhost:8081/callback'], ${none}, ${none}, ${none}, ${none});`,
  )
  // The user consented to the assistant: every bearer request re-checks that the consent still exists, for an
  // opaque token as for a JWT (ADR-0052 §10), so a token without one is refused like a revoked one.
  sql(
    `INSERT INTO "OauthConsent" ("id", "clientId", "userId", "scopes", "resources", "requestedUserInfoClaims") ` +
      `VALUES (gen_random_uuid()::text, '${clientId}', '${userId}', ${scopes}, ${none}, ${none});`,
  )
  sql(
    `INSERT INTO "OauthAccessToken" ("id", "token", "clientId", "userId", "scopes", "resources", "requestedUserInfoClaims", "expiresAt") ` +
      `VALUES (gen_random_uuid()::text, '${tokenHash}', '${clientId}', '${userId}', ${scopes}, ${none}, ${none}, NOW() + INTERVAL '1 hour');`,
  )
  return rawToken
}

/** One tool call on the stateless Streamable HTTP endpoint; returns the tool's JSON answer. */
async function mcpTool(ctx, token, id, name, args) {
  const res = await fetch(`${ctx.apiOrigin}/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
  })
  const text = await res.text()
  if (!res.ok) ctx.fail(`Row T: MCP ${name} answered ${res.status}: ${text.slice(0, 300)}`)
  const body = JSON.parse(text)
  if (body.error || body.result?.isError) ctx.fail(`Row T: MCP ${name} was refused: ${text.slice(0, 300)}`)
  return JSON.parse(body.result.content[0].text)
}

async function textOf(page, selector) {
  return (await page.locator(selector).first().innerText()).replace(/\s+/g, ' ').trim()
}

export async function run(ctx) {
  const { page, api, user, webOrigin, sql, YEAR, tid, visible, gone, fail, call, answer, until, TAG } = ctx

  // T1 — an employee whose LStB has only the gross wage: the estimate lacks Zeile 4 and the social security.
  await answer(api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Ledig']])
  await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/lstb/bruttoarbeitslohn`, { kind: 'erfasst', value: 42000 })
  const estimate = await call(api, 'GET', `/v1/steuerjahre/${YEAR}/steuerschaetzung`)
  if (estimate.kind !== 'offen' || !estimate.missing?.includes('lohnsteuer') || !estimate.missing.includes('sozialversicherung')) {
    fail(`Row T1: the estimate should lack lohnsteuer and sozialversicherung, got ${JSON.stringify(estimate).slice(0, 300)}`)
  }

  const token = seedAssistantToken(sql, user.email)
  const done = await mcpTool(ctx, token, 1, 'aufgabe_fuer_nutzer', { taxYear: YEAR, art: 'konfession', text: TASK_DONE_TEXT })
  const dropped = await mcpTool(ctx, token, 2, 'aufgabe_fuer_nutzer', { taxYear: YEAR, art: 'beleg_nachreichen', text: TASK_DROP_TEXT })
  if (!done.ok || !dropped.ok || done.id === dropped.id) fail(`Row T: two tasks should be created, got ${JSON.stringify([done, dropped])}`)

  await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
  await visible(page, 'bestaetigung-aufgaben', 'Row T1')
  const taskLine = await textOf(page, tid('bestaetigung-aufgaben'))
  if (taskLine !== '2 Aufgaben von deinem Assistenten') fail(`Row T1: the cockpit should count 2 tasks, got "${taskLine}"`)
  await visible(page, 'cockpit-fehlt-lohnsteuer', 'Row T1')
  const missingTax = await textOf(page, tid('cockpit-fehlt-lohnsteuer'))
  if (!missingTax.includes('Einbehaltene Lohnsteuer (Zeile 4)') || !missingTax.includes('Lohnsteuerbescheinigung')) {
    fail(`Row T1: the missing wage tax should name the line and its mask, got "${missingTax}"`)
  }
  const missingSocial = await textOf(page, tid('cockpit-fehlt-sozialversicherung'))
  if (!missingSocial.includes('Sozialversicherungsbeiträge')) fail(`Row T1: the missing social security should be named, got "${missingSocial}"`)
  // Only what is missing: the gross wage was entered, so it is not named.
  await gone(page, 'cockpit-fehlt-bruttoarbeitslohn', 'Row T1')
  const named = await page.locator('[data-testid^="cockpit-fehlt-"]').count()
  if (named !== 2) fail(`Row T1: the cockpit should name exactly the 2 missing details, got ${named}`)
  console.log(`[${TAG}] ✅ Row T1 — the cockpit names the missing LStB lines with their mask and counts 2 assistant tasks`)

  // T2 — the confirmation screen, opened from the cockpit's notice.
  await page.locator(tid('bestaetigung-oeffnen')).click()
  await visible(page, 'aufgaben', 'Row T2')
  if ((await page.locator('[data-testid^="aufgabe-erledigt-"]').count()) !== 2) fail('Row T2: each of the 2 tasks should offer „Erledigt“')
  const doneCard = await textOf(page, `[data-testid="aufgabe-${done.id}"]`)
  if (!doneCard.includes('Konfession eintragen') || !doneCard.includes(TASK_DONE_TEXT) || !doneCard.includes(`Von ${ASSISTANT_NAME}`)) {
    fail(`Row T2: the task should show its kind, text and assistant, got "${doneCard}"`)
  }
  const dropCard = await textOf(page, `[data-testid="aufgabe-${dropped.id}"]`)
  if (!dropCard.includes(TASK_DROP_TEXT)) fail(`Row T2: the second task should show its text, got "${dropCard}"`)

  const decide = () => page.waitForResponse((r) => r.url().includes('/bestaetigung/aufgaben/') && r.request().method() === 'PUT', { timeout: 15_000 })
  let decided = decide()
  await page.locator(`[data-testid="aufgabe-erledigt-${done.id}"]`).click()
  if (!(await decided).ok()) fail('Row T2: marking the task done should succeed')
  await page.locator(`[data-testid="aufgabe-${done.id}"]`).waitFor({ state: 'detached', timeout: 15_000 }).catch(() => fail('Row T2: the done task should leave the list'))
  decided = decide()
  await page.locator('[data-testid^="aufgabe-verwerfen-"]').first().click()
  // WEB-37/WEB-38: the action asks first; confirm it.
  await page.locator('[data-testid="rueckfrage-taskDiscard-confirm"]').click()
  if (!(await decided).ok()) fail('Row T2: discarding the task should succeed')
  await page.locator(tid('aufgaben')).waitFor({ state: 'detached', timeout: 15_000 }).catch(() => fail('Row T2: with no open task the card should go'))
  const status = (id) => sql(`SELECT status FROM "AssistentAufgabe" WHERE id = '${id}';`).trim()
  await until(async () => `${status(done.id)}|${status(dropped.id)}`, 'erledigt|verworfen', 'Row T2: the tasks should be stored as erledigt and verworfen')
  const open = await call(api, 'GET', `/v1/steuerjahre/${YEAR}/bestaetigung`)
  if ((open.tasks ?? []).length !== 0) fail(`Row T2: no task should stay open, got ${JSON.stringify(open.tasks)}`)
  console.log(`[${TAG}] ✅ Row T2 — the assistant's tasks are listed, one marked done and one discarded (stored as such)`)

  // T3 — a child without tax id and Familienkasse: the printout names exactly those.
  await putPrintableBasics(api, { firstName: 'Tara', lastName: 'Beispiel' })
  await putLstb(api, YEAR, 42000, 6100, 8400)
  await answer(api, YEAR, [['kinder', '1 Kind']])
  await call(api, 'POST', `/v1/steuerjahre/${YEAR}/kinder`, { firstName: 'Mila', lastName: 'Beispiel', geburtsdatum: '2019-03-08', domesticResidenceAllYear: true })
  const check = await call(api, 'GET', `/v1/steuerjahre/${YEAR}/ausdruck/pruefung`)
  if (!check.missing.includes('kinder') || !check.missingChildFields.includes('taxId')) fail(`Row T3: the pre-check should name the child's tax id, got ${JSON.stringify(check)}`)
  await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/ausdruck`, { waitUntil: 'networkidle' })
  await visible(page, 'ausdruck-kinder-fehlend', 'Row T3')
  const childHint = await textOf(page, tid('ausdruck-kinder-fehlend'))
  if (!childHint.startsWith('Für die Anlage Kind fehlt noch:') || !childHint.includes('Steuer-ID des Kindes') || !childHint.includes('Familienkasse')) {
    fail(`Row T3: the hint should name the child's tax id and Familienkasse, got "${childHint}"`)
  }
  // The residence was given, and a child is recorded: neither is named.
  if (childHint.includes('Wohnsitz des Kindes') || childHint.includes('ein erfasstes Kind')) fail(`Row T3: the hint names more than is missing: "${childHint}"`)
  await visible(page, 'ausdruck-kinder-ergaenzen', 'Row T3')
  console.log(`[${TAG}] ✅ Row T3 — the printout names only the child's missing details: "${childHint}"`)

  // T4 — married, filing jointly with Person B: the Abgabe's comparison step names the recorded filing type.
  await answer(api, YEAR, [['familienstand', 'Verheiratet'], ['partner-job', 'Angestellt'], ['partner-ausland', 'Nein']])
  await call(api, 'PUT', '/v1/stammdaten', {
    geburtsdatum: '1990-04-12', strasse: 'Musterstraße', hausnummer: '12', plz: '01067', wohnort: 'Dresden', religion: 'VD', religionConsent: true,
    familienstand: 'verheiratet', iban: 'DE89370400440532013000', finanzamt: 'Dresden-Nord',
  })
  const link = await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/kopplung`, { filingType: 'zusammen' })
  if (link.filingType !== 'zusammen') fail(`Row T4: the couple should file jointly, got ${JSON.stringify(link).slice(0, 200)}`)
  await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/kopplung/person-b`, { firstName: 'Jonas', lastName: 'Beispiel' })
  await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/abgabe`, { waitUntil: 'networkidle' })
  // Step 1 must pass first: hints are confirmed as the user would, a blocking conflict ends the row.
  const confirmHints = page.locator(tid('gate-warnung-bestaetigen'))
  const filingType = page.locator(tid('abgabe-veranlagungsart'))
  await Promise.race([
    filingType.waitFor({ state: 'visible', timeout: 15_000 }),
    confirmHints.waitFor({ state: 'visible', timeout: 15_000 }),
  ]).catch(() => {})
  if (await confirmHints.isVisible()) await confirmHints.click()
  await filingType.waitFor({ state: 'visible', timeout: 15_000 }).catch(async () => {
    const screenText = (await page.locator(tid('screen-container')).first().innerText().catch(() => '')).slice(0, 400)
    fail(`Row T4: "abgabe-veranlagungsart" should be visible once step 1 passes; the screen says: ${screenText}`)
  })
  const filingText = await textOf(page, tid('abgabe-veranlagungsart'))
  if (!filingText.includes('Zusammenveranlagung') || !filingText.includes('Angaben für die Erklärung')) {
    fail(`Row T4: the Abgabe should say the couple files jointly, got "${filingText}"`)
  }
  await visible(page, 'abgabe-vergleich-oeffnen', 'Row T4')
  console.log(`[${TAG}] ✅ Row T4 — the Abgabe names the recorded Zusammenveranlagung and offers the comparison`)
}
