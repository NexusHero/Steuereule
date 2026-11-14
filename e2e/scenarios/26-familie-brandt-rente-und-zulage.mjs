// Scenario 26: Familie Brandt — what scenario 25 left untested (ADR-0088), on a phone-width screen.
//
//   Row A — interview: a married user says Person B is retired; the cockpit shows B a pension tile only, and
//           B's pension is recorded for B from there.
//   Row B — children: the Swiss Kinderzulage comes with the user's wage; each child names its payer.
//   Row C — catalogues: B's own Sonderausgaben („Für wen?“) are B's, the user's stay the user's.
//   Row D — the estimate counts B's pension next to the user's Swiss wage.
//   Row E — another couple: B keeps an own account, joins by code and records a change of job herself;
//           the user's joint estimate counts both of B's wages.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { newContextAtBreakpoint, guardAgainst429, fail, runStandaloneScenario } from './helpers/scenario-harness.mjs'
import { createAccount, call, answer, browserLogin, until } from '../harness/api-account.mjs'

const TAG = 'scenario-26'
const Y = 2025
const tid = (id) => `[data-testid="${id}"]`

async function visible(page, id, row, timeout = 15_000) {
  await page
    .locator(tid(id))
    .first()
    .waitFor({ state: 'visible', timeout })
    .catch(() => fail(`${row}: "${id}" should be visible`))
}

const swissRecord = async (api, query, { gross, ahv, bvg, qst, allowancesChf }) => {
  for (const [field, value] of [['lohn', gross], ['bruttolohn-total', gross], ['ahv-beitraege', ahv], ['berufliche-vorsorge', bvg], ['nettolohn', gross - ahv - bvg], ['quellensteuer', qst]]) {
    await call(api, 'PUT', `/v1/steuerjahre/${Y}/ch-lohnausweis/${field}${query}`, { kind: 'erfasst', value })
  }
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/ch-lohnausweis/wechselkurs${query}`, { month: '2025', rate: 1.065, mode: 'jahresdurchschnitt' })
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/ch-lohnausweis/n-gre${query}`, {
    arbeitgeberName: 'Beispiel AG', arbeitgeberStrasse: 'Rheinweg 2', arbeitgeberPlzOrt: '4058 Basel', familienzulagenChf: allowancesChf,
    krankentaggeldChf: 0, pkArbeitnehmerChf: bvg, pkArbeitgeberChf: bvg, krankentaggeldArbeitgeberProzent: 100, nbuvArbeitgeberProzent: 100, specialCases: false,
  })
}

export async function runScenario26(browser, webOrigin, sql) {
  console.log('\n--- Scenario 26: Familie Brandt — retired Person B, Kinderzulage, „Für wen?“, B with an own account ---')
  const apiOrigin = process.env.API_ORIGIN
  if (!apiOrigin) fail('Scenario 26 needs API_ORIGIN (ATTACH mode)')
  const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
  const api = user.api
  await call(api, 'PUT', '/v1/profile', { firstName: 'Jonas', lastName: 'Brandt' })
  await call(api, 'PUT', '/v1/stammdaten', { familienstand: 'verheiratet', religion: 'VD', religionConsent: true, plz: '79539' })
  await answer(api, Y, [['job', 'Angestellt'], ['ausland', 'Ja, in die Schweiz'], ['kinder', '2 oder mehr'], ['familienstand', 'Verheiratet'], ['partner-job', 'Rente']])
  await answer(api, Y, [['ch-wohnsitz', 'Deutschland'], ['ch-nichtrueckkehrtage', '0']])
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/kopplung`, { filingType: 'zusammen' })
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/kopplung/person-b`, { firstName: 'Ute', lastName: 'Brandt' })
  await swissRecord(api, '', { gross: 96_000, ahv: 6_144, bvg: 4_800, qst: 4_320, allowancesChf: 5_160 })
  for (const [firstName, geburtsdatum] of [['Paul', '2016-05-02'], ['Greta', '2019-09-14']]) {
    await call(api, 'POST', `/v1/steuerjahre/${Y}/kinder`, { firstName, lastName: 'Brandt', geburtsdatum })
  }

  // Phone width: the partner tiles stack under the user's.
  const ctx = await newContextAtBreakpoint(browser, 's')
  const page = await ctx.newPage()
  guardAgainst429(page, fail, '/api/auth/')
  await browserLogin(page, webOrigin, user.email, TAG)
  await page.goto(`${webOrigin}/app/steuerjahr/${Y}/kinder`, { waitUntil: 'networkidle' })

  // Row A — a retired Person B: only the pension tile, and B's pension mask from it.
  await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
  await visible(page, 'partner-rente', 'Row A')
  // UX review H2: every tile names the form it fills, the partner's too.
  if (!(await page.locator(tid('partner-rente-formular')).innerText()).includes('Anlage R')) fail('Row A: the partner\'s pension tile should name Anlage R')
  if ((await page.locator(tid('partner-lstb')).count()) > 0) fail('Row A: a retired Person B should get no LStB tile')
  if ((await page.locator(tid('partner-schweiz')).count()) > 0) fail('Row A: a retired Person B should get no Swiss certificate tile')
  await page.locator(tid('partner-rente')).click()
  await visible(page, 'rente-partner-hinweis', 'Row A')
  if (!(await page.locator(tid('rente-partner-hinweis')).innerText()).includes('Ute')) fail('Row A: the pension mask should say it is Ute’s')
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/rente/art?person=B`, { kind: 'GesetzlicheRente' })
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/rente/jahresbetrag?person=B`, { kind: 'erfasst', value: 18_000 })
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/rente/rentenbeginnJahr?person=B`, { kind: 'erfasst', value: 2020 })
  const ownPension = await call(api, 'GET', `/v1/steuerjahre/${Y}/rente`)
  if (ownPension.kind !== null) fail('Row A: B’s pension must not land in the user’s record')
  console.log(`[${TAG}] ✅ Row A — a retired Person B gets the pension tile only, recorded for B`)

  // Row B — the Kinderzulage comes with the user's wage: the first child names its payer.
  await page.goto(`${webOrigin}/app/steuerjahr/${Y}/kinder`, { waitUntil: 'networkidle' })
  const kids = (await call(api, 'GET', `/v1/steuerjahre/${Y}/kinder`)).kinder
  await page.getByLabel(`Kind ${kids[0].firstName} bearbeiten`).click()
  await visible(page, 'kind-weitere-angaben', 'Row B')
  // The further details open by themselves once a Kinderzulage is known for the child.
  if ((await page.locator(tid('kind-zulage-von-b')).count()) === 0) await page.locator(tid('kind-weitere-angaben')).click()
  await visible(page, 'kind-zulage-von-b', 'Row B')
  await page.locator(tid('kind-zulage-von-b')).click()
  await page.locator(tid('kind-zulage-von-a')).click()
  const savedChild = page.waitForResponse((r) => r.url().includes('/kinder/') && r.request().method() === 'PUT', { timeout: 15_000 })
  await page.locator(tid('kind-speichern')).click()
  if (!(await savedChild).ok()) fail('Row B: the child should be saved')
  // 5.160 CHF at 1,065 = 5.495 €; the payer named for Paul only, Greta shares what nobody is assigned to.
  await until(
    async () => JSON.stringify((await call(api, 'GET', `/v1/steuerjahre/${Y}/kinder`)).kinder.map((k) => [k.swissFamilyAllowancePayer ?? null, k.swissFamilyAllowanceEur])),
    JSON.stringify([['A', '5495'], [null, null]]),
    'Row B: the user’s allowances should go to the child they are paid for',
  )
  console.log(`[${TAG}] ✅ Row B — the Swiss Kinderzulage goes to the child whose payer is named`)

  // Row C — „Für wen?“: B's Riester is B's.
  await page.goto(`${webOrigin}/app/steuerjahr/${Y}/katalog/sonderausgaben`, { waitUntil: 'networkidle' })
  await visible(page, 'katalog-fuer-wen', 'Row C')
  await page.locator(tid('katalog-fuer-b')).click()
  await visible(page, 'katalog-option-spenden-Nein', 'Row C')
  // UX review H7: the partner's side says whose answers these are, and donations count for both.
  await visible(page, 'katalog-fuer-partner', 'Row C')
  if (!(await page.locator(tid('katalog-fuer-partner')).innerText()).includes('Ute')) fail('Row C: the question should say it is asked for Ute')
  await visible(page, 'katalog-gemeinsam-spenden', 'Row C')
  await page.locator(tid('katalog-option-spenden-Nein')).click()
  await until(
    async () => (await call(api, 'GET', `/v1/steuerjahre/${Y}/interview?eintrag=sonderausgaben&person=B`)).answers.spenden ?? null,
    'Nein',
    'Row C: the answer should be B’s',
  )
  if ((await call(api, 'GET', `/v1/steuerjahre/${Y}/interview?eintrag=sonderausgaben`)).answers.spenden !== undefined) fail('Row C: the user’s Sonderausgaben must stay untouched')
  await page.locator(tid('katalog-fuer-a')).click()
  await visible(page, 'katalog-option-spenden-Nein', 'Row C')
  console.log(`[${TAG}] ✅ Row C — „Für wen?“ keeps B’s Sonderausgaben apart from the user’s`)

  // Row D — the estimate counts B's pension next to the user's Swiss wage.
  const estimate = await call(api, 'GET', `/v1/steuerjahre/${Y}/steuerschaetzung`)
  if (estimate.kind !== 'spanne' || estimate.jointAssessment !== true) fail(`Row D: a joint estimate is expected, got ${JSON.stringify(estimate).slice(0, 200)}`)
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/rente/jahresbetrag?person=B`, { kind: 'erfasst', value: 28_000 })
  const higher = await call(api, 'GET', `/v1/steuerjahre/${Y}/steuerschaetzung`)
  // 10.000 € more pension at the 80 % share of a 2020 start: 8.000 € more taxable income.
  if (higher.taxableIncome.from - estimate.taxableIncome.from !== 8_000) fail(`Row D: B’s pension should count, zvE moved ${higher.taxableIncome.from - estimate.taxableIncome.from}`)
  console.log(`[${TAG}] ✅ Row D — B's pension counts in the joint estimate`)
  await ctx.close()

  // Row E — B with an own account and a change of job; the user's joint estimate counts both of B's wages.
  const owner = await createAccount({ apiOrigin, webOrigin, sql, tag: `${TAG}-e` })
  await call(owner.api, 'PUT', '/v1/stammdaten', { familienstand: 'verheiratet', religion: 'VD', religionConsent: true, plz: '79539' })
  await answer(owner.api, Y, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein'], ['familienstand', 'Verheiratet'], ['partner-job', 'Angestellt'], ['partner-ausland', 'Ja, in die Schweiz']])
  await call(owner.api, 'PUT', `/v1/steuerjahre/${Y}/kopplung`, { filingType: 'zusammen' })
  for (const [field, value] of [['bruttoarbeitslohn', 52_000], ['lohnsteuer', 8_400], ['sozialversicherung', 10_600]]) {
    await call(owner.api, 'PUT', `/v1/steuerjahre/${Y}/lstb/${field}`, { kind: 'erfasst', value })
  }
  const code = (await call(owner.api, 'GET', `/v1/steuerjahre/${Y}/kopplung`)).invitationCode
  if (!code) fail('Row E: the joint return should offer an invitation code')
  const spouse = await createAccount({ apiOrigin, webOrigin, sql, tag: `${TAG}-b` })
  await call(spouse.api, 'POST', `/v1/steuerjahre/${Y}/kopplung/beitreten/${code}`)
  await answer(spouse.api, Y, [['job', 'Angestellt'], ['ausland', 'Ja, in die Schweiz'], ['kinder', 'Nein'], ['familienstand', 'Verheiratet'], ['partner-job', 'Angestellt'], ['partner-ausland', 'Nein']])
  await answer(spouse.api, Y, [['ch-wohnsitz', 'Deutschland'], ['ch-nichtrueckkehrtage', '0']])
  for (const [field, value] of [['bruttoarbeitslohn', 20_000], ['lohnsteuer', 2_000], ['sozialversicherung', 4_000]]) {
    await call(spouse.api, 'PUT', `/v1/steuerjahre/${Y}/lstb/${field}`, { kind: 'erfasst', value })
  }
  await swissRecord(spouse.api, '', { gross: 30_000, ahv: 1_920, bvg: 1_400, qst: 1_350, allowancesChf: 0 })
  const joint = await call(owner.api, 'GET', `/v1/steuerjahre/${Y}/steuerschaetzung`)
  // Both German wage taxes and B's Quellensteuer (1.350 CHF at 1,065).
  if (joint.kind !== 'spanne' || joint.anrechnung !== 8_400 + 2_000 + Math.round(1_350 * 1.065)) {
    fail(`Row E: the joint estimate should count B’s change of job, got ${JSON.stringify(joint).slice(0, 240)}`)
  }
  console.log(`[${TAG}] ✅ Row E — B with an own account records a change of job; the joint estimate counts both wages`)

  await Promise.all([api.dispose(), owner.api.dispose(), spouse.api.dispose()])
  console.log('[Scenario 26] PASS: Familie Brandt — retired Person B, Kinderzulage, „Für wen?“ and an own-account B work.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 26: Familie Brandt (Rente und Zulage)', runScenario26).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
