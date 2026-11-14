// Scenario 25: Familie Sommer — the escalation case. Both spouses work for a German employer until June and
// as Grenzgänger in Switzerland from July (German social insurance and pension, then AHV and a Pensionskasse
// with its Obligatorium), three children in Kindergarten and Kita, a dentist's bill of 1.700 € and a cosmetic
// operation that must not count. Every document is an invented one in the layout of a real one; each must
// find its field, and the joint return must come out complete for the printout.
//
//   Row A — chat: the LStB naming Person B is drafted for B, the dentist's bill into the Krankheitskosten,
//           the cosmetic operation is refused with its reason.
//   Row B — the other documents (Lohnausweise, Pensionskasse, premium letters, health insurer, Kita, donation)
//           are read through the same parse route and every draft is taken over without a conflict.
//   Row C — cockpit: Person B has a Swiss certificate tile; B's mask asks B's own Grenzgänger questions.
//   Row D — the masks without documents: rates, N-Gre facts, both commutes with a change of job, the children.
//   Row E — the joint estimate counts both mixed years, the printout misses nothing, and every amount sits
//           where it belongs (Krankheitskosten 1.700 € + self-borne, never the 3.800 € operation).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { newContextAtBreakpoint, guardAgainst429, fail, runStandaloneScenario } from './helpers/scenario-harness.mjs'
import { createAccount, call, answer, browserLogin, until } from '../harness/api-account.mjs'
import { renderTextPdf } from '../fixtures/synthetic-documents.mjs'
import * as D from '../fixtures/escalation-documents.mjs'

const TAG = 'scenario-25'
const Y = 2025
const tid = (id) => `[data-testid="${id}"]`

async function visible(page, id, row, timeout = 15_000) {
  await page
    .locator(tid(id))
    .first()
    .waitFor({ state: 'visible', timeout })
    .catch(() => fail(`${row}: "${id}" should be visible`))
}

/** Every draft of the year, newest state first wins. */
async function drafts(api) {
  const session = await call(api, 'GET', `/v1/steuerjahre/${Y}/advisor/session`)
  return session.messages.flatMap((m) => [...(m.meta?.actions ?? []), ...(m.meta?.action ? [m.meta.action] : [])])
}

async function uploadInChat(page, name, lines) {
  const pdf = await renderTextPdf(page.context().browser(), lines.split('\n'))
  // The attach button opens and closes the receipt panel; it stays open after an upload.
  if ((await page.locator(tid('advisor-receipt-file-input')).count()) === 0) await page.locator(tid('advisor-receipt-attach-btn')).click()
  const parsed = page.waitForResponse((r) => r.url().includes('/belege/parse') && r.request().method() === 'POST', { timeout: 60_000 })
  await page.locator(tid('advisor-receipt-file-input')).setInputFiles({ name, mimeType: 'application/pdf', buffer: pdf })
  const res = await parsed
  if (!res.ok()) fail(`Row A: ${name} should be read, got ${res.status()}`)
  return res.json()
}

export async function runScenario25(browser, webOrigin, sql) {
  console.log('\n--- Scenario 25: Familie Sommer — both spouses change to Switzerland, three children, Krankheitskosten ---')
  const apiOrigin = process.env.API_ORIGIN
  if (!apiOrigin) fail('Scenario 25 needs API_ORIGIN (ATTACH mode)')
  const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
  const api = user.api

  await call(api, 'PUT', '/v1/profile', { firstName: 'Elias', lastName: 'Sommer', steuerId: '31000000000' })
  await call(api, 'PUT', '/v1/stammdaten', {
    geburtsdatum: '1987-03-12', strasse: 'Lindenweg', hausnummer: '4', plz: '79539', wohnort: 'Lörrach',
    religion: 'VD', religionConsent: true, familienstand: 'verheiratet', iban: 'DE89370400440532013000', finanzamt: 'Lörrach',
  })
  await answer(api, Y, [['job', 'Angestellt'], ['ausland', 'Ja, in die Schweiz'], ['kinder', '2 oder mehr'], ['familienstand', 'Verheiratet']])
  await answer(api, Y, [['partner-job', 'Angestellt'], ['partner-ausland', 'Ja, in die Schweiz']])
  await answer(api, Y, [['ch-wohnsitz', 'Deutschland'], ['ch-nichtrueckkehrtage', '0']])
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/kopplung`, { filingType: 'zusammen' })
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/kopplung/person-b`, {
    firstName: 'Nora', lastName: 'Sommer', steuerId: '31000007919', geburtsdatum: '1989-11-30', religion: 'VD', religionConsent: true, beruf: 'Pflegefachfrau',
  })
  for (const [firstName, geburtsdatum, taxId] of [['Lio', '2019-04-03', '31000015838'], ['Ida', '2021-08-21', '31000023757'], ['Mats', '2023-02-09', '31000031676']]) {
    await call(api, 'POST', `/v1/steuerjahre/${Y}/kinder`, { firstName, lastName: 'Sommer', geburtsdatum, taxId })
  }

  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail, '/api/auth/')
  await browserLogin(page, webOrigin, user.email, TAG)
  // A year route makes 2025 the open year of the app, as a user opening the return does.
  await page.goto(`${webOrigin}/app/steuerjahr/${Y}/kinder`, { waitUntil: 'networkidle' })

  // Row A — the chat reads B's LStB by its name, the dentist's bill, and refuses the cosmetic operation.
  await page.goto(`${webOrigin}/app/eule`, { waitUntil: 'networkidle' })
  await visible(page, 'advisor-receipt-attach-btn', 'Row A')
  const lstbB = await uploadInChat(page, 'lstb-nora.pdf', D.lstb({ name: 'Nora Sommer', employer: 'Südpraxis GmbH', gross: 21000, wageTax: 2150, rv: 1953, kv: 1722, pv: 315, av: 273 }))
  if (lstbB.lstb?.person !== 'B') fail(`Row A: the LStB naming Nora should be Person B's, got ${JSON.stringify(lstbB.lstb?.person)}`)
  const dentist = await uploadInChat(page, 'zahnarzt.pdf', D.dentist)
  if (dentist.stagedAction?.field !== 'gesundheit-betrag' || dentist.stagedAction?.newValue !== '1700') {
    fail(`Row A: the dentist's bill should be drafted as 1.700 € Krankheitskosten, got ${JSON.stringify(dentist.stagedAction)}`)
  }
  await uploadInChat(page, 'klinik.pdf', D.cosmetic)
  await visible(page, 'advisor-receipt-notice', 'Row A')
  if (!(await page.locator(tid('advisor-receipt-notice')).innerText()).includes('keine außergewöhnliche Belastung')) {
    fail('Row A: the cosmetic operation should be refused with its reason')
  }
  const afterChat = await drafts(api)
  if (!afterChat.some((a) => a.screen === 'lstb' && a.person === 'B' && a.newValue === '21000')) fail('Row A: B’s gross wage should wait as a draft for B')
  if (afterChat.some((a) => a.field === 'gesundheit-betrag' && a.newValue === '3800')) fail('Row A: the operation must never become a draft')
  console.log(`[${TAG}] ✅ Row A — the chat drafts B's LStB for B and the dentist's bill, and refuses the cosmetic operation`)

  // Row B — the other documents through the same route, then every draft is taken over.
  const documents = [
    { kind: 'lstb', rawText: D.lstb({ name: 'Elias Sommer', employer: 'Nordwerk GmbH', gross: 36000, wageTax: 6210, rv: 3348, kv: 2952, pv: 540, av: 468 }) },
    { kind: 'auto', rawText: D.lohnausweis({ last: 'Sommer', first: 'Elias', street: 'Lindenweg 4', ahv: '756.1111.2222.33', born: '12.03.1987', employer: 'Rheinbrücke AG', lohn: 54000, brutto: 54000, ahvSum: 3456, bvg: 2700, netto: 47844, qst: 2430 }) },
    { kind: 'auto', rawText: D.lohnausweis({ last: 'Sommer', first: 'Nora', street: 'Lindenweg 4', ahv: '756.4444.5555.66', born: '30.11.1989', employer: 'Klinik Basel AG', lohn: 31200, brutto: 31200, ahvSum: 1997, bvg: 1450, netto: 27753, qst: 1404 }) },
    { kind: 'auto', rawText: D.pensionRows({ title: 'Herr', name: 'Elias Sommer', spar: "2'200.00", risiko: '500.00', sparObl: "1'700.00", risikoObl: '400.00' }) },
    { kind: 'auto', rawText: D.pensionRows({ title: 'Frau', name: 'Nora Sommer', spar: "1'200.00", risiko: '250.00', sparObl: '900.00', risikoObl: '200.00' }) },
    { kind: 'auto', rawText: D.premiumLetter({ name: 'Elias Sommer', ktg: '182,40', nbu: '214,60' }) },
    { kind: 'auto', rawText: D.premiumLetter({ name: 'Nora Sommer', ktg: '104,10', nbu: '121,90' }) },
    {
      kind: 'auto',
      rawText: D.familyHealth([
        { name: 'Elias Sommer', own: '300.00', premium: "2'100.00" },
        { name: 'Nora Sommer', own: '0.00', premium: "1'950.00" },
        { name: 'Lio Sommer', own: '0.00', premium: '480.00' },
        { name: 'Ida Sommer', own: '0.00', premium: '480.00' },
        { name: 'Mats Sommer', own: '0.00', premium: '480.00' },
      ]),
    },
    { kind: 'auto', rawText: D.kita({ child: 'Lio', provider: 'Kindergarten Musterdorf', monthly: 100, from: '01.01.2025' }) },
    { kind: 'auto', rawText: D.kita({ child: 'Ida', provider: 'Kita Sonnenschein', monthly: 300, from: '01.01.2025' }) },
    { kind: 'auto', rawText: D.kita({ child: 'Mats', provider: 'Kita Sonnenschein', monthly: 350, from: '01.01.2025' }) },
    { kind: 'auto', rawText: D.donation },
  ]
  for (const [i, doc] of documents.entries()) {
    await call(api, 'POST', '/v1/belege/parse', { taxYear: Y, fileName: `beleg-${i + 1}.pdf`, mimeType: 'application/pdf', textSource: 'pdf_text', ...doc })
  }
  const pending = (await drafts(api)).filter((a) => a.status === 'pending')
  for (const a of pending) {
    const res = await api.fetch(`/v1/steuerjahre/${Y}/advisor/actions/${a.actionId}/apply`, { method: 'POST', data: {} })
    if (!res.ok()) fail(`Row B: taking over ${a.screen}.${a.field}${a.person === 'B' ? ' (B)' : ''} answered ${res.status()}: ${(await res.text()).slice(0, 200)}`)
  }
  console.log(`[${TAG}] ✅ Row B — ${documents.length + 3} documents, ${pending.length} drafts taken over without a conflict`)

  // Row C — B's Swiss certificate from the cockpit: B's own Grenzgänger questions, then B's mask.
  await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
  await visible(page, 'partner-schweiz', 'Row C')
  await page.locator(tid('partner-schweiz')).click()
  await visible(page, 'ch-partner-hinweis', 'Row C')
  await page.locator(tid('ch-wohnsitz-deutschland')).click()
  await visible(page, 'ch-tage-input', 'Row C')
  await page.locator(tid('ch-tage-input')).fill('0')
  const savedFacts = page.waitForResponse((r) => r.url().includes('/ch-lohnausweis/grenzgaenger') && r.url().includes('person=B') && r.request().method() === 'PUT', { timeout: 15_000 })
  await page.locator(tid('ch-tage-weiter')).click()
  if (!(await savedFacts).ok()) fail('Row C: B’s Grenzgänger answers should be saved')
  await visible(page, 'ch-wechselkurs-jahresdurchschnitt', 'Row C')
  await page.locator(tid('ch-wechselkurs-jahresdurchschnitt')).click()
  const savedRate = page.waitForResponse((r) => r.url().includes('/ch-lohnausweis/wechselkurs') && r.url().includes('person=B') && r.request().method() === 'PUT', { timeout: 15_000 })
  await page.locator(tid('ch-wechselkurs-speichern')).click()
  if (!(await savedRate).ok()) fail('Row C: B’s exchange rate should be saved for B')
  const swissB = await call(api, 'GET', `/v1/steuerjahre/${Y}/ch-lohnausweis?person=B`)
  if (swissB.status !== 'echter-grenzgaenger' || swissB.exchangeRate?.mode !== 'jahresdurchschnitt') {
    fail(`Row C: B should be a Grenzgänger with the annual average rate, got ${JSON.stringify({ status: swissB.status, rate: swissB.exchangeRate })}`)
  }
  console.log(`[${TAG}] ✅ Row C — Person B's Swiss certificate opens from the cockpit with B's own Grenzgänger questions`)

  // Row D — what no document carries: the user's rate, both employers, the commutes, the children.
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/ch-lohnausweis/wechselkurs`, { month: '2025', rate: 1.065, mode: 'jahresdurchschnitt' })
  const employer = (name, street, place) => ({ arbeitgeberName: name, arbeitgeberStrasse: street, arbeitgeberPlzOrt: place, familienzulagenChf: 0, krankentaggeldChf: 0, krankentaggeldArbeitgeberProzent: 100, nbuvArbeitgeberProzent: 100, specialCases: false })
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/ch-lohnausweis/n-gre`, employer('Rheinbrücke AG', 'Rheinweg 2', '4058 Basel'))
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/ch-lohnausweis/n-gre?person=B`, employer('Klinik Basel AG', 'Spitalstrasse 9', '4056 Basel'))
  const way = (km1, km2, place) => ({
    workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 3, homeOfficeDays: 0,
    oneWayKm: km1, transport: 'pkw', workplace: '79999 Musterdorf, Werkstrasse 1', periodFrom: '01.01.2025', periodTo: '30.06.2025',
    secondOneWayKm: km2, secondTransport: 'pkw', secondWorkplace: place, secondFrom: '01.07.2025', secondTo: '31.12.2025',
  })
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/arbeitsweg`, way(18, 32, '4058 Basel, Rheinweg 2'))
  await call(api, 'PUT', `/v1/steuerjahre/${Y}/arbeitsweg?person=B`, way(9, 27, '4056 Basel, Spitalstrasse 9'))
  for (const k of (await call(api, 'GET', `/v1/steuerjahre/${Y}/kinder`)).kinder) {
    await call(api, 'PUT', `/v1/steuerjahre/${Y}/kinder/${k.id}`, {
      firstName: k.firstName, lastName: k.lastName, geburtsdatum: k.geburtsdatum, kinship: '1', kinshipB: '1',
      familyBenefitsOffice: 'Familienkasse Baden-Württemberg West', domesticResidenceAllYear: true, registeredWithMeAllYear: true, childBenefitToMeAllYear: true,
    })
  }
  console.log(`[${TAG}] ✅ Row D — rates, both employers, both commutes with the change of job and the children recorded`)

  // Row E — the joint estimate, the printout check and where every amount went.
  const estimate = await call(api, 'GET', `/v1/steuerjahre/${Y}/steuerschaetzung`)
  if (estimate.kind !== 'spanne' || estimate.jointAssessment !== true) fail(`Row E: a joint estimate is expected, got ${JSON.stringify(estimate).slice(0, 300)}`)
  // Both German wage taxes and both Swiss withholding taxes (2.430 and 1.404 CHF at 1,065).
  const credited = 6210 + 2150 + Math.round(2430 * 1.065) + Math.round(1404 * 1.065)
  if (Math.abs(estimate.anrechnung - credited) > 2) fail(`Row E: both mixed years should be credited (${credited}), got ${estimate.anrechnung}`)
  const check = await call(api, 'GET', `/v1/steuerjahre/${Y}/ausdruck/pruefung`)
  if (check.missing.length > 0) fail(`Row E: the printout should miss nothing, misses ${check.missing.join(', ')}`)
  const interview = (await call(api, 'GET', `/v1/steuerjahre/${Y}/interview?eintrag=gesundheit`)).answers
  // 1.700 € dentist + 300 CHF self-borne (at the annual average while no rate was chosen) — never the operation.
  if (interview['gesundheit-gate'] !== 'Ja' || Number(interview['gesundheit-betrag']) !== 1700 + Math.round(300 * 1.065)) {
    fail(`Row E: the Krankheitskosten should be 1.700 € plus the self-borne costs, got ${JSON.stringify(interview)}`)
  }
  const kids = (await call(api, 'GET', `/v1/steuerjahre/${Y}/kinder`)).kinder
  const care = Object.fromEntries(kids.map((k) => [k.firstName, `${k.childcareEur}|${k.childcareFrom}|${k.childcareTo}|${k.healthBasicEur}`]))
  const wantedCare = { Lio: '1200|01.01.2025|31.12.2025|511', Ida: '3600|01.01.2025|31.12.2025|511', Mats: '4200|01.01.2025|31.12.2025|511' }
  if (JSON.stringify(care) !== JSON.stringify(wantedCare)) fail(`Row E: each child's care and premium should be recorded, got ${JSON.stringify(care)}`)
  const lstbB2 = await call(api, 'GET', `/v1/steuerjahre/${Y}/lstb?person=B`)
  const lstbA = await call(api, 'GET', `/v1/steuerjahre/${Y}/lstb`)
  if (lstbA.state?.bruttoarbeitslohn !== 36000 || lstbB2.state?.bruttoarbeitslohn !== 21000) {
    fail(`Row E: each spouse keeps their own LStB, got A ${JSON.stringify(lstbA.state)} B ${JSON.stringify(lstbB2.state)}`)
  }
  await until(
    async () => (await call(api, 'GET', `/v1/steuerjahre/${Y}/ch-lohnausweis?person=B`)).nGre?.krankenkasseChf ?? (await call(api, 'GET', `/v1/steuerjahre/${Y}/ch-lohnausweis?person=B`)).items?.find((i) => i.kind === 'Krankenkasse')?.amountChf,
    1950,
    'Row E: B’s Swiss health insurance premium should be B’s',
  )
  console.log(`[${TAG}] ✅ Row E — joint estimate with both mixed years, printout complete, every amount in its field`)

  await ctx.close()
  await api.dispose()
  console.log('[Scenario 25] PASS: Familie Sommer — every document and figure of the escalation case found its field.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 25: Familie Sommer (Eskalationsfall)', runScenario25).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
