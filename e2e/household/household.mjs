// Household gate (#452, ADR-0062): two real accounts on the real stack, driven through the API with
// their own session cookies, plus one look at the Kinder mask in a real browser.
//
//   Row A — AC 10: estimate, cockpit and printout check of a joint couple with children are byte for
//           byte the same before and after the household migration.
//   Row B — AC 4:  a typo across years ("Milla" 2024 / "Mila" 2025) produces exactly one question.
//   Row C — AC 1/3: in 2026 last year's child is preselected („aus 2025“), the over-25 one is not;
//           one click adopts the child with name, birth date and Steuer-ID.
//   Row D — AC 2:  the spouse linked once in 2025 is linked in 2026 without an invitation code.
//   Row E — AC 6:  the spouse edits the shared child; A sees "changed by the partner".
//   Row F — AC 5:  "ab 2027 nicht mehr verknüpft" (divorce) ends the link; 2026 keeps it.
//   Row G — AC 5:  "endgültig löschen" removes a child from every year.
import { request as playwrightRequest } from 'playwright-core'
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { FLOW_COPY, skipSplash, signUpOutOfBand } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }
const PASSWORD = 'Sicheres-Passwort-1!'
const TAG = 'household'

async function account(apiOrigin, webOrigin, sql, label) {
  const email = `household-${label}-${Date.now()}@beispiel.de`
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', TAG)
  await signUpOutOfBand(apiOrigin, webOrigin, email, PASSWORD)
  sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)
  const api = await playwrightRequest.newContext({ baseURL: apiOrigin, extraHTTPHeaders: { origin: webOrigin } })
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
  const res = await api.post('/api/auth/sign-in/email', { data: { email, password: PASSWORD } })
  if (!res.ok()) fail(`${label}: sign-in failed (${res.status()})`)
  return { email, api }
}

async function call(api, method, path, data) {
  const res = await api.fetch(path, { method, ...(data === undefined ? {} : { data }) })
  if (!res.ok()) fail(`${method} ${path} answered ${res.status()}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

async function snapshot(api, year) {
  const [estimate, cockpit, printout] = await Promise.all([
    call(api, 'GET', `/v1/steuerjahre/${year}/steuerschaetzung`),
    call(api, 'GET', `/v1/steuerjahre/${year}/cockpit`),
    call(api, 'GET', `/v1/steuerjahre/${year}/ausdruck/pruefung`),
  ])
  return JSON.stringify({ estimate, cockpit, printout })
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const a = await account(apiOrigin, webOrigin, sql, 'thomas')
    const b = await account(apiOrigin, webOrigin, sql, 'sabine')

    // A joint couple with two children; answers go one after another (409 ANSWER_UNREACHABLE otherwise).
    for (const [questionId, value] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', '2 oder mehr'], ['familienstand', 'Verheiratet']]) {
      await call(a.api, 'POST', '/v1/steuerjahre/2025/interview/antworten', { questionId, value })
    }
    await call(a.api, 'POST', '/v1/steuerjahre/2024/kinder', { firstName: 'Milla', lastName: 'Weber', geburtsdatum: '2019-05-12' })
    await call(a.api, 'POST', '/v1/steuerjahre/2025/kinder', { firstName: 'Mila', lastName: 'Weber', geburtsdatum: '2019-05-12', taxId: '86095742719', kinship: '1' })
    await call(a.api, 'POST', '/v1/steuerjahre/2025/kinder', { firstName: 'Jonas', lastName: 'Weber', geburtsdatum: '1999-03-01', kinship: '1' })
    const link2025 = await call(a.api, 'PUT', '/v1/steuerjahre/2025/kopplung', { filingType: 'zusammen' })
    await call(b.api, 'POST', `/v1/steuerjahre/2025/kopplung/beitreten/${link2025.invitationCode}`)

    // Row A — the migration changes no result.
    const before = await snapshot(a.api, 2025)
    const household2025 = await call(a.api, 'GET', '/v1/steuerjahre/2025/haushalt')
    const after = await snapshot(a.api, 2025)
    if (before !== after) fail('Row A: estimate, cockpit or printout check changed through the household migration')
    console.log(`[${TAG}] ✅ Row A — estimate, cockpit and printout check identical before and after the migration`)

    // Row B — exactly one question for the typo, gone once answered.
    if (household2025.candidates.length !== 1) fail(`Row B: expected exactly one „dieselben?“ question, got ${household2025.candidates.length}`)
    await call(a.api, 'POST', `/v1/steuerjahre/2025/haushalt/dubletten/${household2025.candidates[0].id}`, { same: false })
    const again = await call(a.api, 'GET', '/v1/steuerjahre/2025/haushalt')
    if (again.candidates.length !== 0) fail('Row B: an answered question must not come back')
    console.log(`[${TAG}] ✅ Row B — one question for "Milla"/"Mila", answered once`)

    // Row C — the new year preselects and adopts without retyping.
    const h2026 = await call(a.api, 'GET', '/v1/steuerjahre/2026/haushalt')
    const mila = h2026.persons.find((p) => p.firstName === 'Mila')
    const jonas = h2026.persons.find((p) => p.firstName === 'Jonas')
    if (!mila?.preselected || mila.fromYear !== 2025) fail(`Row C: Mila should be preselected „aus 2025“, got ${JSON.stringify(mila)}`)
    if (!jonas || jonas.preselected || !jonas.selectable) fail(`Row C: Jonas (over 25) must be selectable but not preselected, got ${JSON.stringify(jonas)}`)
    await call(a.api, 'POST', '/v1/steuerjahre/2026/haushalt/kinder/uebernehmen', { personIds: [mila.personId] })
    const kinder2026 = await call(a.api, 'GET', '/v1/steuerjahre/2026/kinder')
    const adopted = kinder2026.kinder.find((k) => k.firstName === 'Mila')
    if (!adopted || adopted.geburtsdatum !== '2019-05-12' || adopted.taxId !== '86095742719') fail(`Row C: adopted child incomplete: ${JSON.stringify(adopted)}`)
    console.log(`[${TAG}] ✅ Row C — 2026: Mila preselected „aus 2025“, Jonas (over 25) not; adopted with name, birth date, Steuer-ID`)

    // Row D — linked once, linked every year.
    const link2026 = await call(a.api, 'PUT', '/v1/steuerjahre/2026/kopplung', { filingType: 'zusammen' })
    if (!link2026.personBHasOwnAccount || link2026.invitationCode !== null) fail(`Row D: 2026 should keep the spouse without a new code, got ${JSON.stringify(link2026)}`)
    console.log(`[${TAG}] ✅ Row D — 2026 keeps the spouse with own account, no new invitation code`)

    // Row E — shared children, edited by the spouse.
    const sharedForB = await call(b.api, 'GET', '/v1/steuerjahre/2026/kinder')
    const sharedMila = sharedForB.kinder.find((k) => k.firstName === 'Mila')
    if (!sharedMila) fail('Row E: the spouse must see the shared child')
    await call(b.api, 'PUT', `/v1/steuerjahre/2026/kinder/${sharedMila.id}`, { firstName: 'Mila Sophie' })
    const seenByA = (await call(a.api, 'GET', '/v1/steuerjahre/2026/haushalt')).persons.find((p) => p.personId === mila.personId)
    if (seenByA?.firstName !== 'Mila Sophie' || seenByA.updatedBySelf !== false) fail(`Row E: A should see the spouse's change, got ${JSON.stringify(seenByA)}`)
    console.log(`[${TAG}] ✅ Row E — the spouse edits the shared child; A sees "changed by the partner"`)

    // Row F — divorce from 2027.
    await call(a.api, 'POST', '/v1/steuerjahre/2027/haushalt/partner/nicht-mehr-dabei')
    const link2027 = await call(a.api, 'PUT', '/v1/steuerjahre/2027/kopplung', { filingType: 'zusammen' })
    if (link2027.personBHasOwnAccount || link2027.invitationCode === null) fail(`Row F: after ending the link, 2027 must not reuse the spouse, got ${JSON.stringify(link2027)}`)
    const keep2026 = await call(a.api, 'GET', '/v1/steuerjahre/2026/kopplung')
    if (!keep2026.personBHasOwnAccount) fail('Row F: ending the link from 2027 must leave 2026 linked')
    console.log(`[${TAG}] ✅ Row F — "ab 2027 nicht mehr verknüpft" ends the link; 2026 stays linked`)

    // Row G — deleting for good reaches every year.
    await call(a.api, 'DELETE', `/v1/steuerjahre/2026/haushalt/personen/${jonas.personId}`)
    const kinder2025 = await call(a.api, 'GET', '/v1/steuerjahre/2025/kinder')
    if (kinder2025.kinder.some((k) => k.firstName === 'Jonas')) fail('Row G: Jonas must be gone from 2025 too')
    console.log(`[${TAG}] ✅ Row G — „endgültig löschen“ removes the child from every year`)

    // The Kinder mask shows the household in a real browser.
    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await skipSplash(page, webOrigin)
    await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', TAG)
    await page.getByPlaceholder(FLOW_COPY.loginEmailPlaceholder).fill(a.email)
    await page.getByPlaceholder(FLOW_COPY.loginPasswordPlaceholder).fill(PASSWORD)
    await page.getByRole('button', { name: FLOW_COPY.loginSubmit }).click()
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
    await page.goto(`${webOrigin}/app/steuerjahr/2026/kinder`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="haushalt-kinder"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('[data-testid="haushalt-dabei-0"]').waitFor({ state: 'visible', timeout: 10_000 })
    console.log(`[${TAG}] ✅ Row H — the Kinder mask shows the household in the browser`)
    await ctx.close()

    await a.api.dispose()
    await b.api.dispose()
    console.log(`[${TAG}] PASS — household migration is result-neutral; selection, link, sharing, divorce and deletion verified.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((error) => {
  console.error(`[${TAG}] FAIL —`, error?.message ?? error)
  process.exit(1)
})
