// Scenario 27: the real case of a Grenzgänger couple (ADR-0094), 2024 and 2025, through the masks of the Strom.
// The facts come from the API acceptance case (apps/api/test/acceptance/echtfaelle/grenzgaenger-paar.case.ts)
// and are not copied: every answer of the case is typed or tapped where a user meets it, every document is
// uploaded as a PDF with a text layer (rendered from the case by echtfall-grenzgaenger/generate.mjs), and the
// app's own estimate must hit the same target as the API test, to the cent: the notice with the researched
// corrections (docs/research/grenzgaenger-switzerland/README.html), plus the app's known deviations.
//
// A case field that no mask asks is named in NOT_ASKED with its reason; any other field the gate cannot
// find in its mask fails the gate, so a removed field is noticed.
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { fail, registerAndOnboard, answerBasis, chooseTopics, waitForStromStep, waitForNetworkQuiet, newContextAtBreakpoint, guardAgainst429, runStandaloneScenario } from './helpers/scenario-harness.mjs'
import { GRENZGAENGER_PAAR } from '../../apps/api/test/acceptance/echtfaelle/grenzgaenger-paar.case.ts'
import { DOCUMENT_DIR } from './echtfall-grenzgaenger/generate.mjs'

const TAG = 'scenario-27'
const tid = (id) => `[data-testid="${id}"]`

/** Case fields no mask asks, with the reason. They stay out of the walk; the target holds without them. */
const NOT_ASKED = {
  'commute.periodFrom': 'the way-to-work mask has no start date for the first way (only the job-change switch has dates)',
  'commute.periodTo': 'the way-to-work mask has no end date for the first way',
  'interview.partner': 'the Lebenslagen question „Partner“ has no Strom step and no mask',
  'interview.homeoffice': 'the Lebenslagen question „Homeoffice“ has no Strom step; the days are asked in the way-to-work mask',
  'kind.registeredWithMeAllYear': 'not asked of a married couple (by design)',
  'kind.childBenefitToMeAllYear': 'not asked of a married couple (by design)',
}

/** The Strom basis questions, answered on its first page. */
const BASIS = ['job', 'ausland', 'de-job', 'kinder', 'familienstand', 'partner-job', 'partner-ausland', 'partner-de-job']
/** Lebenslagen the user leaves unselected: the selection page records them as „Nein“. */
const UNSELECTED = ['kv-pv', 'altersvorsorge', 'versicherungen', 'riester', 'lohnersatz', 'nebenjob', 'abfindung', 'umzug', 'dhf', 'fortbildung']
/** Topic answers: the gate of a topic and the page its amounts are typed on. */
const TOPICS = {
  'haushalt-gate': { slug: 'haushalt', fields: ['haushalt-handwerker-betrag', 'haushalt-handwerker-rechnungsbetrag'], zero: ['haushalt-dienstleistung-betrag', 'haushalt-minijob-betrag'] },
  'gesundheit-gate': { slug: 'krankheitskosten', fields: ['gesundheit-betrag'], zero: ['gesundheit-erstattung'] },
  spenden: { slug: 'spenden', fields: ['spenden-betrag'], zero: [] },
  einkuenfte: { slug: 'einkuenfte', kind: 'Kapitalerträge', options: ['kap-depot'], zero: [] },
  'vorauszahlungen-gate': { slug: 'vorauszahlungen', fields: ['vorauszahlungen-betrag'], zero: [] },
}

const dmy = (iso) => iso.split('-').toReversed().join('.')

/** Every case answer is consumed once; what is left at the end was not entered, and fails the gate. */
function ledger(answers) {
  const open = new Map(answers.map((a) => [`${a.screen}.${a.field}${a.person === 'B' ? '@B' : ''}`, a.value]))
  return {
    take(screen, field, person) {
      const key = `${screen}.${field}${person === 'B' ? '@B' : ''}`
      if (!open.has(key)) return undefined
      const value = open.get(key)
      open.delete(key)
      return value
    },
    peek: (screen, field, person) => open.get(`${screen}.${field}${person === 'B' ? '@B' : ''}`),
    of: (screen, person) => [...open.keys()].filter((k) => k.startsWith(`${screen}.`) && k.endsWith('@B') === (person === 'B')).map((k) => k.slice(screen.length + 1).replace(/@B$/, '')),
    rest: () => [...open.keys()].filter((k) => !(k.replace(/@B$/, '') in NOT_ASKED)),
  }
}

async function visible(page, id, timeout = 15_000) {
  await page.locator(tid(id)).first().waitFor({ state: 'visible', timeout })
}

async function present(page, id, timeout = 3_000) {
  return page.locator(tid(id)).first().waitFor({ state: 'visible', timeout }).then(() => true, () => false)
}

/** Types a value and leaves the field, so the masks that save on blur save it. */
async function type(page, id, value) {
  const input = page.locator(tid(id)).first()
  await input.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => fail(`[${TAG}] field "${id}" is not in its mask`))
  await input.fill(String(value))
  await input.press('Tab')
}

async function goStrom(page, webOrigin, year, slug) {
  await page.goto(`${webOrigin}/app/steuerjahr/${year}/strom/${slug}`, { waitUntil: 'networkidle' })
  await waitForStromStep(page, slug)
}

/** Uploads a PDF of the case through a mask's file input and waits until the app has read it. */
async function uploadPdf(page, inputId, fileName) {
  const buffer = await fs.readFile(path.join(DOCUMENT_DIR, fileName))
  const parsed = page.waitForResponse((r) => r.url().includes('/belege/parse') && r.request().method() === 'POST', { timeout: 60_000 })
  await page.locator(tid(inputId)).setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer })
  const res = await parsed
  if (!res.ok()) fail(`[${TAG}] ${fileName} should be read, got ${res.status()}: ${(await res.text()).slice(0, 300)}`)
  let body = await res.json()
  // A household of several: „Für wen?“ first (ADR-0092); the person the document names is preselected.
  const question = body.assignment?.question
  if (question) {
    if (!question.preselected) fail(`[${TAG}] ${fileName} should preselect the person it names, got ${JSON.stringify(question)}`)
    const again = page.waitForResponse((r) => r.url().includes('/belege/parse') && (r.request().postData() ?? '').includes(`"holder":"${question.preselected}"`), { timeout: 60_000 })
    await page.locator(tid(`beleg-zuordnung-fuer-${question.preselected.replace(':', '-')}`)).click()
    body = await (await again).json()
  }
  return body
}

/** The Eule's draft stage: picks the recommended path of every two-path card, then takes every draft over. */
async function takeOverDrafts(page, fileName, dailyBenefitPath) {
  await visible(page, 'eule-draft-stage', 30_000).catch(() => fail(`[${TAG}] ${fileName}: the read values should wait as drafts in the Eule`))
  const choices = page.locator('[data-testid^="draft-choose-"]')
  if ((await choices.count()) > 0) {
    if (!dailyBenefitPath) fail(`[${TAG}] ${fileName}: a two-path card appeared where the case expects none`)
    const pick = page.locator(`[data-testid^="draft-choose-"][data-testid$="-${dailyBenefitPath}"]`).first()
    await pick.click()
  } else if (dailyBenefitPath) {
    fail(`[${TAG}] ${fileName}: the daily benefit should offer its two paths`)
  }
  const apply = page.locator(tid('eule-batch-apply-btn'))
  await apply.waitFor({ state: 'visible', timeout: 10_000 })
  const applied = page.waitForResponse((r) => r.url().includes('/advisor/actions/apply-batch') && r.request().method() === 'POST', { timeout: 30_000 })
  await apply.click()
  const res = await applied
  if (!res.ok()) fail(`[${TAG}] ${fileName}: taking the drafts over answered ${res.status()}: ${(await res.text()).slice(0, 300)}`)
  await waitForNetworkQuiet(page)
}

/** The Swiss certificate mask of A (`schweiz`) or B (`partner-schweiz`). */
async function swissMask(page, webOrigin, c, book, person) {
  const slug = person === 'B' ? 'partner-schweiz' : 'schweiz'
  const y = c.year
  await goStrom(page, webOrigin, y, slug)
  if (book.take('interview', 'ch-wohnsitz', person) !== 'Deutschland') fail(`[${TAG}] the case should live in Germany`)
  await page.locator(tid('ch-wohnsitz-deutschland')).click()
  await type(page, 'ch-tage-input', book.take('interview', 'ch-nichtrueckkehrtage', person))
  await page.locator(tid('ch-tage-weiter')).click()

  // The certificate: uploaded in the mask, its values wait in the Eule and are taken over there.
  const doc = c.documents.find((d) => d.kind === 'chLohnausweis' && d.person === person)
  await visible(page, 'ch-lohnausweis-upload-card')
  await uploadPdf(page, 'ch-lohnausweis-upload-btn-input', doc.fileName)
  await visible(page, 'ch-lohnausweis-ergebnis-zu-vorschlaegen', 30_000)
  await page.locator(tid('ch-lohnausweis-ergebnis-zu-vorschlaegen')).click()
  await takeOverDrafts(page, doc.fileName, doc.dailyBenefitPath)
  await goStrom(page, webOrigin, y, slug)
  if (await present(page, 'ch-tage-input', 2_000)) {
    await page.locator(tid('ch-wohnsitz-deutschland')).click().catch(() => {})
    await type(page, 'ch-tage-input', '0')
    await page.locator(tid('ch-tage-weiter')).click()
  }
  await visible(page, 'ch-feld-lohn')

  // What the certificate does not say: chips first (they open or close fields), then the amounts.
  const chips = {
    familienzulagenImBruttolohn: { true: 'ch-ngre-familienzulagen-im-brutto-ja', false: 'ch-ngre-familienzulagen-im-brutto-nein' },
    kvZuschussAnspruch: { true: 'ch-ngre-kv-zuschuss-ja', false: 'ch-ngre-kv-zuschuss-nein' },
    nGreSonderfaelle: { true: 'ch-ngre-sonderfaelle-ja', false: 'ch-ngre-sonderfaelle-nein' },
  }
  for (const [field, ids] of Object.entries(chips)) {
    const value = book.take('chLohnausweis', field, person)
    if (value === undefined) continue
    const id = ids[value]
    await page.locator(tid(id)).click().catch(() => fail(`[${TAG}] chip "${id}" is not in the mask of ${person}`))
    await waitForNetworkQuiet(page)
  }
  const rate = book.take('chLohnausweis', 'wechselkurs', person)
  const vorsorge = new Set(['krankenkasseChf', 'krankenkasseZusatzChf'])
  for (const field of book.of('chLohnausweis', person)) {
    await type(page, vorsorge.has(field) ? `ch-vorsorge-${field}` : `ch-ngre-${field}`, book.take('chLohnausweis', field, person))
    await waitForNetworkQuiet(page)
  }
  // The annual average rate of the case: the chip prefills it, the user checks it and saves.
  await page.locator(tid('ch-wechselkurs-jahresdurchschnitt')).click()
  await page.locator(tid('ch-wechselkurs-kurs')).fill(rate.replace('.', ','))
  const [saved] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/wechselkurs'), { timeout: 10_000 }).catch(() => null),
    page.locator(tid('ch-wechselkurs-speichern')).click(),
  ])
  if (!saved?.ok()) fail(`[${TAG}] the exchange rate of ${person} was not saved`)
  await waitForNetworkQuiet(page)
  await page.locator(tid('ch-lohnausweis-weiter')).click()
}

/** The way to work of A (`arbeitsweg`) or B (`partner-arbeitsweg`). */
async function commuteMask(page, webOrigin, c, book, person) {
  await goStrom(page, webOrigin, c.year, person === 'B' ? 'partner-arbeitsweg' : 'arbeitsweg')
  await visible(page, 'arbeitstage-km')
  // The distance first: changing it clears the shortest-route confirmation.
  await type(page, 'arbeitstage-km', book.take('commute', 'oneWayKm', person))
  await page.locator(tid(`arbeitstage-transport-${book.take('commute', 'transport', person)}`)).click()
  if (book.take('commute', 'shortestRouteConfirmed', person) === 'true') await page.locator(tid('arbeitstage-kuerzeste')).click()
  const fields = { travelDays: 'arbeitstage-fahrtage', homeOfficeDays: 'arbeitstage-homeoffice', workEquipmentEur: 'werbungskosten-arbeitsmittel', accountFeesEur: 'werbungskosten-kontofuehrung' }
  for (const [field, id] of Object.entries(fields)) {
    const value = book.take('commute', field, person)
    if (value !== undefined) await type(page, id, value)
  }
  await waitForNetworkQuiet(page)
  const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/arbeitsweg'), { timeout: 10_000 }).catch(() => null)
  await page.locator(tid('arbeitstage-weiter')).click()
  const res = await saved
  if (!res?.ok()) fail(`[${TAG}] the way to work of ${person} was not saved`)
}

/** The German LStB of A (2024): uploaded in the mask, every yellow field confirmed, taken over. */
async function lstbMask(page, webOrigin, c, person) {
  const doc = c.documents.find((d) => d.kind === 'lstb' && d.person === person)
  if (!doc) return
  await goStrom(page, webOrigin, c.year, person === 'B' ? 'partner-lohnsteuerbescheinigung' : 'lohnsteuerbescheinigung')
  await visible(page, 'lstb-scan-card')
  await uploadPdf(page, 'lstb-scan-file-input', doc.fileName)
  await visible(page, 'lstb-scan-draft-banner', 30_000)
  for (const button of await page.locator('[data-testid^="lstb-confirm-field-"], [data-testid^="lstb-confirm-line-"]').all()) {
    if (await button.isVisible()) await button.click()
  }
  const apply = page.locator(tid('lstb-scan-apply'))
  if (await apply.isDisabled()) fail(`[${TAG}] ${doc.fileName}: the scan cannot be taken over: ${(await page.locator(tid('lstb-scan-card')).innerText()).slice(0, 400)}`)
  const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && /\/lstb(\?|$)/.test(r.url()), { timeout: 15_000 })
  await apply.click()
  if (!(await saved).ok()) fail(`[${TAG}] ${doc.fileName}: the LStB was not saved`)
  if (await present(page, 'lstb-overwrite-conflict-modal', 1_500)) await page.locator(tid('lstb-overwrite-confirm')).click()
  await waitForNetworkQuiet(page)
  await page.locator(tid('lstb-weiter')).click()
}

/** The child, in the Strom's children step. */
async function childMask(page, webOrigin, c, book) {
  await goStrom(page, webOrigin, c.year, 'kinder')
  if (await present(page, 'kind-neu', 2_000)) await page.locator(tid('kind-neu')).click()
  await type(page, 'kind-vorname', c.child.firstName)
  await type(page, 'kind-nachname', c.child.lastName)
  await type(page, 'kind-geburtsdatum', dmy(c.child.birthDate))
  const take = (field) => book.take('kind', field)
  await page.locator(tid(`kind-verhaeltnis-${take('kinship')}`)).click()
  const kinshipB = take('kinshipB')
  const b = page.locator(tid(`kind-verhaeltnis-b-${kinshipB}`))
  if (!(await b.isVisible())) await page.locator(tid('kind-weitere-angaben')).click()
  await b.click()
  await type(page, 'kind-familienkasse', take('familyBenefitsOffice'))
  if (take('domesticResidenceAllYear') === 'true') await page.locator(tid('kind-inland-ja')).click()
  if (await page.locator(tid('kind-weitere-angaben')).isVisible()) await page.locator(tid('kind-weitere-angaben')).click()
  await type(page, 'kind-kindergeld', take('childBenefitClaimEur'))
  await page.locator(tid(`kind-zulage-von-${take('swissFamilyAllowancePayer').toLowerCase()}`)).click()
  if (take('healthInsuranceAbroad') === 'true') await page.locator(tid('kind-kv-ausland')).click()
  const health = page.getByLabel('Krankenversicherung des Kindes', { exact: true })
  await health.fill(take('healthBasicEur'))
  await health.press('Tab')
  await type(page, 'kind-betreuung', take('childcareEur'))
  await type(page, 'kind-betreuung-anbieter', take('childcareProvider'))
  await type(page, 'kind-betreuung-von', take('childcareFrom'))
  await type(page, 'kind-betreuung-bis', take('childcareTo'))
  const saved = page.waitForResponse((r) => /\/kinder/.test(r.url()) && ['POST', 'PUT'].includes(r.request().method()), { timeout: 15_000 })
  await page.locator(tid('kind-speichern')).click()
  const res = await saved
  if (!res.ok()) fail(`[${TAG}] the child was not saved: ${res.status()} ${(await res.text()).slice(0, 300)}`)
  await visible(page, 'kind-gespeichert')
  await page.locator(tid('kinder-weiter')).click()
}

/** The Stammdaten of A and B, before the Strom: the children step and the Kapital mask read „verheiratet“ from them. */
async function masterData(page, webOrigin, c, book) {
  await page.goto(`${webOrigin}/app/steuerjahr/${c.year}/stammdaten`, { waitUntil: 'networkidle' })
  await visible(page, 'stammdaten-geburtsdatum')
  for (const field of ['geburtsdatum', 'strasse', 'hausnummer', 'plz', 'wohnort']) await type(page, `stammdaten-${field}`, book.take('stammdaten', field, 'A'))
  await page.locator(tid(`stammdaten-familienstand-${book.take('stammdaten', 'familienstand', 'A')}`)).click()
  if (book.take('stammdaten', 'kirchensteuerpflichtig', 'A') === 'false') {
    await page.locator(tid('stammdaten-religion-VD')).click()
    await page.locator(tid('stammdaten-einwilligung')).click()
  }
  const saved = page.waitForResponse((r) => r.url().includes('/stammdaten') && r.request().method() === 'PUT', { timeout: 15_000 })
  await page.locator(tid('stammdaten-speichern')).click()
  if (!(await saved).ok()) fail(`[${TAG}] the Stammdaten of A were not saved`)
  await waitForNetworkQuiet(page)
  if (await present(page, 'kopplung-zusammen', 5_000)) {
    await page.locator(tid('kopplung-zusammen')).click()
    await waitForNetworkQuiet(page)
  }
  await visible(page, 'personb-vorname')
  await type(page, 'personb-vorname', GRENZGAENGER_PAAR.personB.firstName)
  await type(page, 'personb-nachname', GRENZGAENGER_PAAR.personB.lastName)
  await type(page, 'personb-geburtsdatum', book.take('stammdaten', 'geburtsdatum', 'B'))
  if (book.take('stammdaten', 'kirchensteuerpflichtig', 'B') === 'false') {
    await page.locator(tid('personb-religion-VD')).click()
    await page.locator(tid('personb-einwilligung')).click()
  }
  // B has no Familienstand of its own: it is A's, with the joint return.
  if (book.take('stammdaten', 'familienstand', 'B') !== 'verheiratet') fail(`[${TAG}] B should be married to A`)
  const savedB = page.waitForResponse((r) => r.url().includes('/kopplung/person-b') && r.request().method() === 'PUT', { timeout: 15_000 })
  await page.locator(tid('personb-speichern')).click()
  if (!(await savedB).ok()) fail(`[${TAG}] the details of B were not saved`)
  await waitForNetworkQuiet(page)
}

async function selectionAndTopics(page, webOrigin, c, book) {
  await goStrom(page, webOrigin, c.year, 'auswahl')
  const chosen = Object.keys(TOPICS).filter((id) => book.peek('interview', id) === 'Ja' || (id === 'einkuenfte' && book.peek('interview', id) !== undefined))
  const kinds = {}
  for (const id of chosen) {
    if (TOPICS[id].kind) {
      if (book.take('interview', id) !== TOPICS[id].kind) fail(`[${TAG}] ${id}: the case should name ${TOPICS[id].kind}`)
      kinds[id] = TOPICS[id].kind
    } else book.take('interview', id)
  }
  for (const id of UNSELECTED) if (book.take('interview', id) !== 'Nein') fail(`[${TAG}] ${id}: the case should leave it unselected`)
  await chooseTopics(page, chosen, kinds)
  for (const id of chosen) {
    const topic = TOPICS[id]
    await waitForStromStep(page, topic.slug)
    for (const field of topic.fields ?? []) await type(page, `katalog-input-${field}`, book.take('interview', field))
    for (const field of topic.zero) if (await present(page, `katalog-input-${field}`, 1_000)) await type(page, `katalog-input-${field}`, '0')
    for (const field of topic.options ?? []) await page.locator(tid(`katalog-option-${field}-${book.take('interview', field)}`)).click()
    await page.locator(tid('strom-weiter')).click()
  }
  await waitForStromStep(page, 'fertig')
}

async function capitalMask(page, webOrigin, c, book) {
  await page.goto(`${webOrigin}/app/steuerjahr/${c.year}/kapital`, { waitUntil: 'networkidle' })
  await visible(page, 'kapital-kapitalertraege')
  await page.locator(tid(`kapital-inhaber-${book.take('kapital', 'inhaber')}`)).click()
  for (const field of book.of('kapital')) await type(page, `kapital-${field}`, book.take('kapital', field))
  await waitForNetworkQuiet(page)
  await page.locator(tid('kapital-weiter')).click()
  await waitForNetworkQuiet(page)
}

/** The occupation lives in the Eule's settings. */
async function occupation(page, webOrigin, book) {
  const beruf = book.take('interview', 'beruf')
  await page.goto(`${webOrigin}/app/eule`, { waitUntil: 'networkidle' })
  await page.locator(tid('eule-settings-btn')).click()
  if (await present(page, 'beruf-aendern', 2_000)) await page.locator(tid('beruf-aendern')).click()
  await visible(page, 'beruf-picker')
  const saved = page.waitForResponse((r) => r.url().includes('/interview') && (r.request().postData() ?? '').includes('beruf'), { timeout: 10_000 }).catch(() => null)
  await page.locator(tid(`beruf-${beruf}`)).click()
  if (!(await saved)?.ok()) fail(`[${TAG}] the occupation was not saved`)
}

async function runYear(browser, webOrigin, c) {
  const y = c.year
  const book = ledger(c.answers)
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)
  const { personA, personB } = GRENZGAENGER_PAAR
  await registerAndOnboard(page, { email: `du+echtfall-${y}-${Date.now()}@beispiel.de`, firstName: personA.firstName, lastName: personA.lastName, taxId: '04452397686' }, webOrigin, TAG)

  // The basis page: the household as the case answers it.
  await goStrom(page, webOrigin, y, 'basis')
  const basis = Object.fromEntries(BASIS.map((id) => [id, book.take('interview', id)]))
  await answerBasis(page, basis)
  await waitForStromStep(page, 'partner')
  await type(page, 'strom-partner-vorname', personB.firstName)
  await type(page, 'strom-partner-nachname', personB.lastName)
  await type(page, 'strom-partner-geburtsdatum', book.peek('stammdaten', 'geburtsdatum', 'B'))
  await page.locator(tid('strom-weiter')).click()
  await waitForNetworkQuiet(page)

  await masterData(page, webOrigin, c, book)
  await swissMask(page, webOrigin, c, book, 'A')
  await commuteMask(page, webOrigin, c, book, 'A')
  await lstbMask(page, webOrigin, c, 'A')
  await swissMask(page, webOrigin, c, book, 'B')
  await commuteMask(page, webOrigin, c, book, 'B')
  await childMask(page, webOrigin, c, book)
  await selectionAndTopics(page, webOrigin, c, book)
  await capitalMask(page, webOrigin, c, book)
  await occupation(page, webOrigin, book)

  const left = book.rest()
  if (left.length > 0) fail(`[${TAG}] ${y}: case fields not entered through a mask: ${left.join(', ')}`)

  // The Strom's summary: its estimate, read from the response the page itself loads.
  const estimateRes = page.waitForResponse((r) => r.url().includes(`/steuerjahre/${y}/steuerschaetzung`) && r.request().method() === 'GET', { timeout: 30_000 })
  await page.goto(`${webOrigin}/app/steuerjahr/${y}/strom/fertig`, { waitUntil: 'networkidle' })
  const estimate = await (await estimateRes).json()
  console.log(`[${TAG}] ${y} estimate: ${JSON.stringify({ kind: estimate.kind, taxableIncome: estimate.taxableIncome, result: estimate.result, anrechnung: estimate.anrechnung })}`)
  const zvE = c.target.taxableIncome + c.appDeviations.reduce((sum, d) => sum + d.taxableIncomeEur, 0)
  const expected = Math.round((c.target.resultAfterPrepayments + c.appDeviations.reduce((sum, d) => sum + d.resultEur, 0)) * 100) / 100
  if (estimate.kind !== 'spanne') fail(`[${TAG}] ${y}: expected a computed estimate, got ${estimate.kind}`)
  if (estimate.taxableIncome?.from !== zvE || estimate.taxableIncome?.to !== zvE) fail(`[${TAG}] ${y}: zvE should be ${zvE}, got ${JSON.stringify(estimate.taxableIncome)}`)
  const result = Math.round(estimate.result.from * 100) / 100
  if (result !== expected || estimate.result.to !== estimate.result.from) fail(`[${TAG}] ${y}: the result should be ${expected} €, got ${JSON.stringify(estimate.result)}`)
  // And the summary says it to the cent, in the right direction.
  await visible(page, 'strom-fertig-erstattung')
  const shown = await page.locator(tid('strom-fertig-erstattung')).innerText()
  // A whole amount is shown without „,00“.
  const cents = Number.isInteger(expected) ? 0 : 2
  const euros = Math.abs(expected).toLocaleString('de-DE', { minimumFractionDigits: cents, maximumFractionDigits: cents })
  if (!shown.includes(euros) || !shown.includes(expected >= 0 ? 'Erstattung' : 'Nachzahlung')) fail(`[${TAG}] ${y}: the summary should show ${euros} € ${expected >= 0 ? 'Erstattung' : 'Nachzahlung'}, shows "${shown}"`)
  console.log(`[${TAG}] ✅ ${y}: zvE ${zvE} €, result ${expected} € — the target ${c.target.resultAfterPrepayments} € plus the known deviations (${c.appDeviations.map((d) => d.id).join(', ')})`)
  await ctx.close()
}

export async function runScenario27(browser, webOrigin) {
  console.log('\n--- Scenario 27: Echtfall Grenzgänger-Ehepaar mit Kind, 2024 und 2025, durch die Masken ---')
  for (const c of GRENZGAENGER_PAAR.years) await runYear(browser, webOrigin, c)
  console.log(`[${TAG}] not asked by any mask: ${Object.keys(NOT_ASKED).join(', ')}`)
  console.log('[Scenario 27] PASS: the real case hits its target through the masks in both years.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 27: Echtfall Grenzgänger-Paar', runScenario27).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
