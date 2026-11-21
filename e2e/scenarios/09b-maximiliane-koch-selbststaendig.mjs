// Scenario 09b: Maximiliane Koch with the self-employment switch ON (ADR-0101) — where scenario 09 ends at the
// Gewerbe-Gate (switch off), she walks on: the basis page without the gate, the tile in the cockpit, the area
// „Selbstständig“ with profile → quick entry → book → bank import → assets → closing → VAT → trade tax →
// losses → ELSTER fill-in help → export → checkout; and the additions of ADR-0101 §22: the pensioner's business
// question, the provision paid outside a wage, several businesses, company car, Voranmeldungen, the sale of the
// business and § 34a, wages, the Kleinunternehmer limits and the E-Bilanz transmission.
//
// Needs a stack with SELBSTSTAENDIGE_ENABLED=true (ATTACH mode: API_ORIGIN, WEB_ORIGIN, DATABASE_URL set; `run-all`
// is not given this unit: scenario 09 pins the switch-off behaviour on the same stack). The profile, the quick entry,
// the book and the bank import go to the real server. What the stack cannot produce on demand is served by route
// mocks with the API's response shape: the ELSTER states (published / not published / by meaning / not paid), the
// Bilanz closing, the losses and the refusals (409 chain, 402 tier, 503 tier not configured).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fail, leaveStrom, answerBasis, runStandaloneScenario, chooseTopics, fillTopic, waitForStromStep } from './helpers/scenario-harness.mjs'
import { startPersona } from './helpers/persona-steps.mjs'

const YEAR = 2025
const API = `**/v1/steuerjahre/${YEAR}/selbststaendig`
const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
const SPARKASSE_CSV = [
  'Auftragskonto;Buchungstag;Valutadatum;Buchungstext;Verwendungszweck;Beguenstigter/Zahlungspflichtiger;Kontonummer/IBAN;BIC (SWIFT-Code);Betrag;Waehrung;Kundenreferenz (End-to-End)',
  'DE02100500000054540402;02.04.25;02.04.25;ENTGELT;Bueroartikel Rechnung 5;Buero GmbH;DE89370400440532013000;COBADEFFXXX;-42,00;EUR;',
  'DE02100500000054540402;03.04.25;03.04.25;GUTSCHRIFT;Honorar Projekt Alpha;Kunde AG;DE12500105170648489890;INGDDEFFXXX;1190,00;EUR;',
].join('\n')

export async function runScenario09b(browser, webOrigin) {
  console.log('\n--- Scenario 09b: Maximiliane Koch (Selbstständig, switch on) ---')
  const { ctx, page } = await startPersona(browser, webOrigin, 'scenario-09b', {
    email: `du+maxi.koch.b.${Date.now()}@beispiel.de`, firstName: 'Maximiliane', lastName: 'Koch', taxId: '34827190562',
  })
  const byId = (id) => page.locator(`[data-testid="${id}"]`)
  const byPrefix = (prefix) => page.locator(`[data-testid^="${prefix}"]`)
  const see = (id, timeout = 15_000) => byId(id).waitFor({ state: 'visible', timeout }).catch(() => fail(`[09b] ${id} should be visible`))
  const gone = async (id) => { if (await byId(id).count()) fail(`[09b] ${id} should not be there`) }
  const go = async (pageSlug) => {
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/selbststaendig${pageSlug ? `/${pageSlug}` : ''}`, { waitUntil: 'networkidle' })
  }

  // What the server stored for the year (the app's own read, with the session cookie).
  const apiOrigin = process.env.API_ORIGIN ?? ''
  const expectStored = async (expected, label) => {
    const answers = await page.evaluate(async ([api, year]) => (await (await fetch(`${api}/v1/steuerjahre/${year}/interview`, { credentials: 'include' })).json()).answers, [apiOrigin, YEAR])
    for (const [step, value] of Object.entries(expected)) if (answers?.[step] !== value) fail(`[09b] ${label}: ${step} should be ${value}, is ${answers?.[step]}`)
  }

  // --- The basis page: the switch is on, so „Selbstständig“ walks on instead of stopping at the gate ------------
  await byId('cockpit-interview').click()
  // A pensioner is asked about a business on the same page (ADR-0101 §22); she is self-employed, so she goes back.
  await waitForStromStep(page, 'basis')
  await page.locator('[data-testid="interview-option-job-Rente"]').click()
  await see('strom-feld-rente-selbststaendig')
  await page.locator('[data-testid="interview-option-rente-selbststaendig-Ja"]').click()
  await page.locator('[data-testid="interview-option-rente-selbststaendig-Nein"]').click()
  await answerBasis(page, { job: 'Selbstständig', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })
  await gone('strom-hinweis-gewerbe')
  // Provision outside a wage (ADR-0101 §22): first only the other insurance, then the pension instead.
  await chooseTopics(page, ['versicherungen'])
  await waitForStromStep(page, 'versicherungen')
  await expectStored({ versicherungen: 'Ja', altersvorsorge: 'Nein' }, 'first selection')
  await page.locator('[data-testid="strom-zurueck"]').click()
  await waitForStromStep(page, 'auswahl')
  await page.locator('[data-testid="strom-thema-versicherungen"]').click()
  await page.locator('[data-testid="strom-thema-altersvorsorge"]').click()
  await page.locator('[data-testid="strom-weiter"]').click()
  if (await byId('strom-abwaehlen-ja').isVisible().catch(() => false)) await byId('strom-abwaehlen-ja').click()
  await waitForStromStep(page, 'altersvorsorge')
  await expectStored({ versicherungen: 'Nein', altersvorsorge: 'Ja' }, 'second selection')
  await page.locator('[data-testid="katalog-option-av-ksk-Nein"]').click()
  await fillTopic(page, 'altersvorsorge', { 'av-rv-betrag': 0, 'av-versorgungswerk-betrag': 8000, 'av-basisrente-betrag': 0, 'av-ksk': 'Ja' })
  // Weiter saves first: read the stored answers once the page has moved on, not while the save is still out.
  await byId('strom-schritt-altersvorsorge').waitFor({ state: 'detached', timeout: 15_000 }).catch(async () => fail(`[09b] the pension page did not move on:\n${(await page.locator('body').innerText().catch(() => '')).slice(0, 600)}`))
  await expectStored({ 'av-versorgungswerk-betrag': '8000', 'av-ksk': 'Ja' }, 'pension amounts')
  await leaveStrom(page)

  // --- The cockpit offers the area as a tile; it opens an overview of one phone screen ------------------------------
  await byId('cockpit-kachel-selbststaendig').waitFor({ state: 'visible', timeout: 15_000 })
  await byId('cockpit-kachel-selbststaendig').click()
  await see('selbststaendig-uebersicht')
  await see('business-status')
  await see('business-offen')
  await see('business-offen-art')
  console.log('[09b] PASS: the gate is gone, the tile and the overview are there')

  // A couple filing jointly gets a switch between A and B (route mock of the link; the household is a single here).
  await page.route(`**/v1/steuerjahre/${YEAR}/kopplung`, async (route) => {
    const res = await route.fetch()
    await route.fulfill({ response: res, json: { ...(await res.json()), filingType: 'zusammen', personBHasOwnAccount: false, personB: { firstName: 'Nora' } } })
  })
  await go('')
  await see('business-person')
  await see('business-gewinn')
  await see('business-person-A')
  await see('business-person-B')
  await page.unroute(`**/v1/steuerjahre/${YEAR}/kopplung`)

  // --- Profile: the app suggests, she confirms --------------------------------------------------------------------
  await byId('business-link-profil').click()
  await see('selbststaendig-profil')
  await byId('profil-frage-ownExpertWork-ja').click()
  await byId('profil-frage-tradesGoods-nein').click()
  await see('profil-vorschlag')
  await byId('profil-art-gewerbe').click()
  await byId('profil-modus-euer').click()
  await byId('profil-konten-SKR03').click()
  await byId('profil-ust-ist').click()
  await see('profil-gemeinde')
  await byId('profil-gemeinde-name').fill('Berlin')
  await byId('profil-hebesatz-suchen').click()
  await byPrefix('profil-hebesatz-').first().waitFor({ state: 'visible', timeout: 10_000 })
  if (await page.locator('[data-testid^="profil-hebesatz-nehmen-"]').count()) await page.locator('[data-testid^="profil-hebesatz-nehmen-"]').first().click()
  await byId('profil-gemeinde-name').fill('Zzzzqxw')
  await byId('profil-hebesatz-suchen').click()
  await see('profil-hebesatz-keiner')
  await byId('profil-hebesatz-korrektur').fill('410')
  await byId('profil-hebesatz-korrektur').blur()
  await byId('profil-beginn').fill('01.02.2024')
  await byId('profil-zu-beruf').click()
  await see('beruf-seite')
  await byId('beruf-bisher-gewerbe').click()
  await byId('beruf-aehnlich-nein').click()
  await byId('business-zurueck').click()
  await byId('profil-zu-gewerbedaten').click()
  await see('gewerbedaten-seite')
  await byId('gewerbedaten-einheitswertEur').fill('50000')
  await byId('gewerbedaten-rentImmovableEur').fill('12000')
  await byId('gewerbedaten-speichern').click()
  await see('gewerbedaten-gespeichert')
  await byId('business-zurueck').click()
  await byId('profil-zu-beteiligungen').click()
  await see('beteiligungen-seite')
  await see('beteiligungen-leer')
  await byId('beteiligung-name').fill('Alt GbR')
  await byId('beteiligung-art-gewerbe').click()
  await byId('beteiligung-gewinn').fill('8000')
  await byId('beteiligung-messbetrag').fill('280')
  await byId('beteiligung-gewerbesteuer').fill('1100')
  await byId('beteiligung-hinzufuegen').click()
  await see('beteiligung-0')
  await byId('beteiligung-entfernen-0').click()
  await byId('business-zurueck').click()
  await byId('business-zurueck').click()
  await see('selbststaendig-uebersicht')
  console.log('[09b] PASS: profile confirmed, Hebesatz looked up and corrected')

  // --- Quick entry: totals per EÜR line become bookings --------------------------------------------------------------
  await byId('business-link-erfassung').click()
  await see('erfassung-seite')
  await byId('erfassung-einnahmen_umsatzsteuerpflichtig').fill('12000')
  await byId('erfassung-ausgaben_kfz').fill('800')
  await byId('erfassung-buchen').click()
  await see('erfassung-gebucht')
  await see('erfassung-einnahmen')
  await see('erfassung-ausgaben')
  await see('erfassung-gewinn')
  // A Bilanz has no totals per line.
  await page.route(`${API}/abschluss`, (route) => route.fulfill(json({ mode: 'bilanz', integrity: { ok: true }, euer: null, bilanz: { incomeStatement: { profit: 250000 }, balanceSheet: { totalAktiva: 900000, totalPassiva: 900000 } } })))
  await go('erfassung')
  await see('erfassung-nur-euer')
  console.log('[09b] PASS: quick entry booked, the Bilanz says totals per line are EÜR only')

  // --- Book: list, new booking, Storno, Festschreibung, the states ---------------------------------------------------------
  await page.unroute(`${API}/abschluss`)
  await go('buch')
  await see('buch-liste')
  await see('buch-eintrag-1')
  await byId('buch-neu').click()
  await see('buch-formular')
  await byId('buch-buchen').click()
  await see('buch-formular-fehler')
  await byId('buch-datum').fill('01.03.2025')
  await byId('buch-text').fill('Druckerpapier')
  await byId('buch-belegnummer').fill('RE-17')
  await byId('buch-soll').fill('4930')
  await byId('buch-haben').fill('1200')
  await byId('buch-betrag').fill('119,00')
  await byId('buch-schluessel-vst19').click()
  await byId('buch-buchen').click()
  await byPrefix('buch-eintrag-').nth(2).waitFor({ state: 'visible', timeout: 10_000 })
  await byId('buch-storno-1').click()
  await byPrefix('buch-eintrag-').nth(3).waitFor({ state: 'visible', timeout: 10_000 })
  await byId('buch-fest-datum').fill('31.01.2025')
  await byId('buch-festschreiben').click()
  await page.getByText('Fest bis 31.01.2025').waitFor({ state: 'visible', timeout: 10_000 })
  await page.route(`${API}/buch`, (route) => route.fulfill(json({ chart: 'SKR03', mode: 'euer', lockedThrough: null, integrity: { ok: false, reason: 'Eintrag 2 passt nicht zum Protokoll.', firstBadSeq: 2 }, entries: [] })))
  await go('buch')
  await see('buch-integritaet-fehler')
  await see('buch-leer')
  await page.unroute(`${API}/buch`)
  await go('buch')
  await see('beleg-geschaeft')
  await byId('beleg-richtung-einnahme').click()
  await byId('beleg-richtung-ausgabe').click()
  await see('beleg-geschaeft-datei')
  // A file the device cannot read says so, in the area.
  await page.setInputFiles('[data-testid="beleg-geschaeft-datei-input"]', { name: 'leer.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') })
  await see('beleg-geschaeft-hinweis')
  console.log('[09b] PASS: book, Storno, Festschreibung, broken chain named plainly')

  // --- Bank: a statement as a file; the app suggests, she accepts or ignores -----------------------------------------------
  await go('bank')
  await see('bank-import')
  await byId('bank-quelle-sparkasse').click()
  await byId('bank-datei-waehlen').waitFor({ state: 'visible' })
  await page.setInputFiles('[data-testid="bank-datei-input"]', { name: 'umsaetze.csv', mimeType: 'text/csv', buffer: Buffer.from(SPARKASSE_CSV, 'utf8') })
  await see('bank-ergebnis')
  await byId('bank-quelle-eigene').click()
  await see('bank-mapping')
  await byId('bank-map-trenner-semikolon').click()
  await byId('bank-map-dezimal-komma').click()
  await byId('bank-map-datum-DD.MM.YY').click()
  await byId('bank-map-betrag-zwei').click()
  await byId('bank-map-betrag-eine').click()
  await byId('bank-map-bookingDate').fill('Buchungstag')
  await byId('bank-map-amount').fill('Betrag')
  await byId('bank-map-reference').fill('Verwendungszweck')
  await byId('bank-quelle-sparkasse').click()
  await page.locator('[data-testid^="bank-zeile-"]').first().waitFor({ state: 'visible', timeout: 10_000 })
  // A row with a suggestion shows it; one without asks for an account first.
  if (await page.locator('[data-testid^="bank-vorschlag-"]').count()) console.log('[09b] a bank row came with a suggestion')
  if (await page.locator('[data-testid^="bank-konto-"]').count()) await page.locator('[data-testid^="bank-konto-"]').first().fill('4930')
  await page.locator('[data-testid^="bank-merken-"]').first().click()
  await page.locator('[data-testid^="bank-buchen-"]').first().click()
  await page.locator('[data-testid^="bank-ignorieren-"]').first().click()
  await page.route(`${API}/bank`, (route) => route.fulfill(json([])))
  await go('bank')
  await see('bank-leer')
  await page.unroute(`${API}/bank`)
  console.log('[09b] PASS: bank import with preset, accept and ignore')

  // --- Assets ------------------------------------------------------------------------------------------------------------------
  await go('anlagen')
  await see('anlagen-seite')
  await see('anlagen-leer')
  await byId('anlage-neu').click()
  await see('anlage-formular')
  await byId('anlage-bezeichnung').fill('Laptop')
  await byId('anlage-konto').fill('0410')
  await byId('anlage-datum').fill('15.02.2025')
  await byId('anlage-kosten').fill('1.500,00')
  await byId('anlage-methode-linear').click()
  await see('anlage-nutzungsdauer')
  await page.selectOption('[data-testid="anlage-kategorie"]', 'computer')
  await gone('anlage-nutzungsdauer')
  await byId('anlage-speichern').click()
  await byPrefix('anlage-abgang-').first().waitFor({ state: 'visible', timeout: 10_000 })
  await byId('anlage-afa-buchen').click()
  await byPrefix('anlage-abgang-').first().click()
  await see('anlage-abgang-datum')
  await see('anlage-abgang-erloes')
  await see('anlage-abgang-buchen')
  // § 15a UStG: the input VAT of the laptop, deducted in full, half deductible this year (below 1.000 €: no correction).
  await byPrefix('anlage-15a-').first().click()
  await see('anlage-15a')
  await byId('anlage-15a-vorsteuer').fill('285,00')
  await byId('anlage-15a-ursprung').fill('100')
  await byId('anlage-15a-jahr').fill('50')
  await byId('anlage-15a-speichern').click()
  await byId('anlage-15a').waitFor({ state: 'detached', timeout: 10_000 })
  // A building (§ 7 Abs. 4 EStG) with its use and completion, and a printer with the § 7g Sonder-AfA.
  await byId('anlage-neu').click()
  await byId('anlage-bezeichnung').fill('Lager')
  await byId('anlage-konto').fill('0090')
  await byId('anlage-datum').fill('01.03.2025')
  await byId('anlage-kosten').fill('200.000,00')
  await byId('anlage-methode-building').click()
  await see('anlage-gebaeude')
  await byId('anlage-nutzung-wohnen').click()
  await byId('anlage-nutzung-betrieb').click()
  await byId('anlage-gebaeude-completed').fill('01.01.2000')
  await byId('anlage-speichern').click()
  await byId('anlage-formular').waitFor({ state: 'detached', timeout: 10_000 })
  await byId('anlage-neu').click()
  await byId('anlage-bezeichnung').fill('Drucker')
  await byId('anlage-konto').fill('0410')
  await byId('anlage-datum').fill('01.04.2025')
  await byId('anlage-kosten').fill('1.000,00')
  await byId('anlage-methode-linear').click()
  await page.selectOption('[data-testid="anlage-kategorie"]', 'computer')
  await byId('anlage-sonder-afa').fill('200,00')
  await see('anlage-gewinn-vorjahr')
  await byId('anlage-gewinn-vorjahr').fill('50.000,00')
  await byId('anlage-speichern').click()
  await byId('anlage-formular').waitFor({ state: 'detached', timeout: 10_000 })
  console.log('[09b] PASS: asset registered, depreciation booked, disposal form, § 15a, building and § 7g')

  // --- Closing -------------------------------------------------------------------------------------------------------------------
  await go('abschluss')
  await see('abschluss-seite')
  await see('abschluss-gewinn')
  await page.route(`${API}/abschluss`, (route) => route.fulfill(json({ mode: 'bilanz', integrity: { ok: true }, euer: null, bilanz: { incomeStatement: { profit: 250000 }, balanceSheet: { totalAktiva: 900000, totalPassiva: 900000 } } })))
  await page.route(`${API}/abschluss/eroeffnung`, (route) => route.fulfill(json({ number: 1, date: `${YEAR + 1}-01-01`, documentNumber: 'EB', receiptRef: null, text: 'Eröffnungsbilanz', lines: [], reversalOf: null }, 201)))
  await go('abschluss')
  await see('abschluss-aktiva')
  await see('abschluss-passiva')
  await byId('abschluss-eroeffnung').click()
  await see('abschluss-uebertragen')
  await page.unroute(`${API}/abschluss`)
  await page.unroute(`${API}/abschluss/eroeffnung`)

  // --- VAT, trade tax, losses ------------------------------------------------------------------------------------------------
  await go('umsatzsteuer')
  await see('umsatzsteuer-seite')
  await see('ust-saldo')
  await byId('ust-vorauszahlungen').fill('1000')
  await byId('ust-vorauszahlungen').blur()
  // The real server computes: the Hebesatz was corrected to 410 on the profile.
  await go('gewerbesteuer')
  await see('gewerbesteuer-seite')
  await see('gewst-steuer')
  // Without a Hebesatz the trade tax stays open and leads to the profile.
  await page.route(`${API}/gewerbesteuer`, (route) => route.fulfill(json({ status: 'offen', missing: ['hebesatz'] })))
  await go('gewerbesteuer')
  await see('gewst-offen')
  await see('gewst-zum-profil')
  await page.unroute(`${API}/gewerbesteuer`)
  await page.route(`${API}/gewerbesteuer`, (route) => route.fulfill(json({ status: 'berechnet', profitEur: 50000, result: { additionsEur: 0, deductionsEur: 0, tradeIncomeBeforeLossEur: 50000, lossUsedEur: 10000, lossRemainingEur: 2000, roundedTradeIncomeEur: 40000, allowanceEur: 24500, baseAmountEur: 525, multiplierPercent: 400, tradeTaxEur: 2100 }, multiplier: { percent: 400, source: 'tabelle', tableYear: YEAR, note: null } })))
  await go('gewerbesteuer')
  await see('gewst-steuer')
  await see('gewst-kette')
  await see('gewst-gewinn')
  await see('gewst-fehlbetrag')
  await see('gewst-gewerbeertrag')
  await see('gewst-fehlbetrag-rest')
  await page.route(`${API}/gewerbesteuer`, (route) => route.fulfill(json({ status: 'entfaellt', reason: 'Freiberufler zahlen keine Gewerbesteuer.' })))
  await go('gewerbesteuer')
  await see('gewst-entfaellt')
  await page.unroute(`${API}/gewerbesteuer`)
  await page.route(`${API}`, (route) => (route.request().method() === 'GET' ? route.fetch().then(async (r) => route.fulfill(json({ ...(await r.json()), smallBusiness: true }))) : route.fallback()))
  await go('umsatzsteuer')
  await see('ust-klein')
  await page.unroute(`${API}`)
  await page.route(`${API}/verluste`, (route) => route.fulfill(json({ facts: {}, rules: {}, businessProfitEur: -8000, year: { newLossEur: 8000, carryForwardDeductedEur: 0, remainingCarryForwardEur: 8000 }, carryBack: { intoYearBeforeEur: 5000, intoSecondYearBeforeEur: 0, remainingEur: 3000 } })))
  await go('verluste')
  await see('verluste-seite')
  await see('verluste-vortrag')
  await see('verluste-neu')
  await byId('verluste-platz-0').fill('4000')
  await byId('verluste-platz-0').blur()
  await byId('verluste-zurueckgetragen').fill('0')
  await byId('verluste-zurueckgetragen').blur()
  await see('verluste-ruecktrag')
  await byId('verluste-ruecktrag-verzicht').click()
  await byId('verluste-ruecktrag-ja').click()
  await page.unroute(`${API}/verluste`)
  console.log('[09b] PASS: Bilanz closing, VAT, trade tax in all three states, losses with the carry-back as a whole')

  // --- ELSTER fill-in help: line by line, by meaning, not published, not paid ----------------------------------------------
  const help = (form, extra) => ({ form, year: YEAR, status: 'published', note: null, sourceUrl: null, lineNumbersAvailable: true, lines: [], ...extra })
  await page.route(`${API}/elster/anlage-euer`, (route) => route.fulfill(json(help('anlage-euer', { lines: [{ id: 'euer.betriebseinnahmen', zeile: '12', kennzahlen: ['111'], label: 'Betriebseinnahmen', value: 12000 }, { id: 'euer.offen', zeile: '13', kennzahlen: [], label: 'Ungeklärt', value: null }] }))))
  await page.route(`${API}/elster/anlage-g`, (route) => route.fulfill(json(help('anlage-g', { lineNumbersAvailable: false, lines: [{ id: 'anlage-g.gewinn', zeile: null, kennzahlen: [], label: 'Gewinn', value: 11200 }] }))))
  await page.route(`${API}/elster/gewst-1-a`, (route) => route.fulfill(json(help('gewst-1-a', { year: 2026, status: 'not_published', note: 'Noch nicht veröffentlicht.' }))))
  await page.route(`${API}/elster/anlage-sonstiges`, (route) => route.fulfill(json(help('anlage-sonstiges', { status: 'not_available' }))))
  await page.route(`${API}/elster/ust-2-a`, (route) => route.fulfill(json({ statusCode: 402, code: 'SELF_EMPLOYMENT_NOT_UNLOCKED', message: 'Nicht freigeschaltet.' }, 402)))
  // The list names only the forms with values: the business forms, then the return, each copy on its own (ADR-0101 §16).
  const lotta = { id: 'kind-1', kind: 'child', person: null, name: 'Lotta', number: 1 }
  const elsterForms = [
    ...['anlage-euer', 'anlage-g', 'ust-2-a', 'gewst-1-a'].map((form) => ({ form, group: 'business', instance: null })),
    { form: 'anlage-sonstiges', group: 'income-tax', instance: null },
    { form: 'anlage-kind', group: 'income-tax', instance: lotta },
  ]
  await page.route(`${API}/elster`, (route) => route.fulfill(json({ year: YEAR, forms: elsterForms })))
  await page.route(/\/selbststaendig\/elster\/anlage-kind(\?|$)/, (route) =>
    route.fulfill(json(help('anlage-kind', { instance: lotta, lines: [{ id: 'anlKind.kz66', zeile: '27', kennzahlen: ['66'], label: 'Beiträge zu Krankenversicherungen des Kindes', column: null, value: '420' }] }))),
  )
  await go('elster')
  await see('elster-seite')
  await see('elster-formular-anlage-euer')
  await see('elster-zeile-euer.betriebseinnahmen')
  await see('elster-wert-euer.betriebseinnahmen')
  await see('elster-kopieren-euer.betriebseinnahmen')
  await see('elster-zeilen')
  // Lines without a value do not apply: behind one toggle.
  await byId('elster-weitere-zeilen').click()
  await see('elster-zeile-euer.offen')
  await byId('elster-formular-anlage-g').click()
  await see('elster-nach-bedeutung')
  await see('elster-zeile-anlage-g.gewinn')
  await byId('elster-formular-anlage-kind-1').click()
  await see('elster-zeile-anlKind.kz66')
  await byId('elster-formular-gewst-1-a').click()
  await see('elster-nicht-veroeffentlicht')
  await byId('elster-formular-anlage-sonstiges').click()
  await see('elster-nicht-verfuegbar')
  await byId('elster-formular-ust-2-a').click()
  await see('elster-nicht-freigeschaltet')
  await byId('elster-freischalten').click()
  await see('freischalten-seite')
  // Back from the checkout (`?zahlung=erfolg`) the area returns to the help, which says the year is unlocked.
  await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/selbststaendig/elster?zahlung=erfolg`, { waitUntil: 'networkidle' })
  await see('elster-freigeschaltet')
  await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/selbststaendig/elster?zahlung=abbruch`, { waitUntil: 'networkidle' })
  await see('elster-abgebrochen')
  // A year without any value to type says so instead of offering empty forms.
  await page.unroute(`${API}/elster`)
  await page.route(`${API}/elster`, (route) => route.fulfill(json({ year: YEAR, forms: [] })))
  await go('elster')
  await see('elster-keine-formulare')
  await page.unroute(`${API}/elster`)
  // A year with self-employment is filed through Mein ELSTER: cockpit and Abgabe say so and lead here.
  await page.goto(`${webOrigin}/app`, { waitUntil: 'networkidle' })
  await see('cockpit-elster-hinweis')
  await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/abgabe`, { waitUntil: 'networkidle' })
  await see('abgabe-elster-hinweis')
  await see('abgabe-zur-ausfuellhilfe')
  console.log('[09b] PASS: ELSTER help — form list with copies, lines, by meaning, not published, not available, not paid, nothing to type')

  // --- Export: GoBD zip, Verfahrensdokumentation, E-Bilanz (not sent) ---------------------------------------------------------
  await go('export')
  await see('export-seite')
  await see('export-verfahren')
  await see('export-ebilanz')
  await see('ebilanz-nicht-uebermittelt')
  await see('ebilanz-datei')
  await see('gobd-export')
  await page.route(`${API}/export/gobd`, (route) => route.fulfill(json({ statusCode: 402, code: 'SELF_EMPLOYMENT_NOT_UNLOCKED', message: 'Nicht freigeschaltet.' }, 402)))
  await byId('gobd-export').click()
  await see('export-nicht-freigeschaltet')
  await see('export-freischalten')
  await page.route(`${API}/export/gobd`, (route) => route.fulfill(json({ statusCode: 409, code: 'BOOK_INTEGRITY_BROKEN', message: 'Kette bei Eintrag 2 gebrochen.' }, 409)))
  await byId('gobd-export').click()
  await see('buch-integritaet-fehler')
  await page.unroute(`${API}/export/gobd`)
  await page.route(`${API}/verfahrensdokumentation`, (route) => route.fulfill(json({ values: {}, text: '', missing: ['FIRMA'] })))
  await go('export')
  await see('verfahren-FIRMA')
  await see('verfahren-speichern')
  await page.route(`${API}/verfahrensdokumentation`, (route) => route.fulfill(json({ values: { FIRMA: 'Koch' }, text: '', missing: [] })))
  await go('export')
  await see('verfahren-vollstaendig')
  await page.unroute(`${API}/verfahrensdokumentation`)

  // --- ADR-0101 §22: several businesses on the overview; a further one is added and opened -------------------------------
  await go('')
  await see('business-betriebe')
  await see('business-betrieb-1')
  await byId('business-betrieb-neu').click()
  await byId('business-betrieb-name').fill('Onlineshop')
  await byId('business-betrieb-anlegen').click()
  await see('business-betrieb-2')
  await byId('business-betrieb-1').click()
  await see('selbststaendig-uebersicht')
  console.log('[09b] PASS: a second business added and switched between')

  // --- Company car: computed first, booked on request; the 1 % rule refused at 50 % or less ------------------------------
  await go('firmenwagen')
  await see('firmenwagen-seite')
  await byId('kfz-antrieb-elektro').click()
  await byId('kfz-listPriceGrossEur').fill('52000')
  await byId('kfz-acquired').fill('2024-05-01')
  await byId('kfz-totalCostsEur').fill('14000')
  await byId('kfz-distanceKm').fill('15')
  await byId('kfz-days').fill('200')
  await byId('kfz-methode-pauschal').click()
  await byId('kfz-ueber50-ja').click()
  await byId('kfz-berechnen').click()
  await see('kfz-ergebnis')
  await see('kfz-privatanteil')
  await see('kfz-ust')
  await see('kfz-wege')
  await byId('kfz-buchen').click()
  await see('kfz-gebucht')
  await byId('kfz-ueber50-nein').click()
  await byId('kfz-berechnen').click()
  await see('kfz-nicht-zulaessig')
  await byId('kfz-methode-fahrtenbuch').click()
  await byId('kfz-berechnen').click()
  await see('kfz-offen')
  console.log('[09b] PASS: company car computed, booked, refused below 50 %, logbook asks for its facts')

  // --- Voranmeldungen: without a year before no Voranmeldung; the periods, the Sondervorauszahlung and the ZM ---------------
  await go('voranmeldungen')
  await see('voranmeldungen-seite')
  await see('va-befreit')
  await page.route(`${API}/umsatzsteuer/voranmeldungen`, (route) =>
    route.fulfill(json({
      period: 'monat', periodSource: 'vorjahressteuer', extension: true, specialPrepaymentEur: 1091,
      periods: [{ label: '03/2025', from: '2025-03-01', to: '2025-03-31', due: '2025-05-10', kennzahlen: { '81': 1000, '66': 19, '83': 171 }, vatDueEur: 171 }],
      totalEur: 1262,
      ecSalesList: { period: 'quartal', reports: [{ label: 'Q2/2025', due: '2025-07-25', rows: [{ vatId: 'ATU12345678', goodsEur: 5000, servicesEur: 0 }] }] },
    })),
  )
  await go('voranmeldungen')
  await see('va-zeitraum')
  await see('va-svz')
  await see('va-03/2025')
  await see('va-03/2025-83')
  await see('va-summe')
  await see('va-zm')
  await byId('va-dauerfrist').click()
  await byId('va-periode-quartal').click()
  await page.unroute(`${API}/umsatzsteuer/voranmeldungen`)
  // The Kleinunternehmer limits: crossed in the founding year, and a year before without a book.
  const vat = { figures: {}, result: { outputVat: { standard: 0, reduced: 0, zero: 0 }, inputVatDeductibleEur: 0, inputVatCorrectionEur: 0, vatOfYearEur: 0, prepaymentsEur: 0, balanceEur: 0 }, cashAccountingAllowed: true, inputVatCorrections: [] }
  const small = { eligible: false, priorYearLimitEur: 25000, currentYearLimitEur: 25000, crossed: 'current_year', foundingYear: true, priorYearKnown: true, turnoverEur: 26000, matchesProfile: false, taxedFrom: '2025-12-01' }
  await page.route(`${API}`, (route) => (route.request().method() === 'GET' ? route.fetch().then(async (r) => route.fulfill(json({ ...(await r.json()), smallBusiness: true }))) : route.fallback()))
  await page.route(`${API}/umsatzsteuer`, (route) =>
    route.fulfill(json({ ...vat, result: { ...vat.result, inputVatCorrectionEur: -570 }, smallBusiness: small, inputVatCorrections: [{ assetId: 'a1', label: 'Lager', correctionEur: -570, inPrepayment: false }] })),
  )
  await go('umsatzsteuer')
  await see('ust-klein-grenze')
  // § 15a UStG: the year's correction and the line per asset.
  await see('ust-15a')
  await see('ust-15a-liste')
  // From 2025 the rule ends with the supply that passed the limit (§ 19 Abs. 1 Satz 1 UStG).
  await see('ust-klein-ab')
  await page.unroute(`${API}/umsatzsteuer`)
  await page.route(`${API}/umsatzsteuer`, (route) => route.fulfill(json({ ...vat, smallBusiness: { ...small, eligible: true, crossed: null, foundingYear: false, priorYearKnown: false, matchesProfile: true, taxedFrom: null }, inputVatCorrections: [] })))
  await go('umsatzsteuer')
  await see('ust-klein-vorjahr')
  await page.unroute(`${API}/umsatzsteuer`)
  await page.unroute(`${API}`)
  console.log('[09b] PASS: Voranmeldungen, Sondervorauszahlung, ZM and the Kleinunternehmer limits')

  // --- Sale of the business (§ 16, § 34) and the Thesaurierung (§ 34a, Bilanz only) ---------------------------------------
  await go('sondertarife')
  await see('sondertarife-seite')
  await byId('sonder-art-veraeusserung').click()
  await byId('sonder-date').fill(`${YEAR}-09-30`)
  await byId('sonder-priceEur').fill('200000')
  await byId('sonder-costsEur').fill('5000')
  await byId('sonder-capitalAccountEur').fill('95000')
  await byId('sonder-freibetrag').click()
  await byId('sonder-methode-fuenftel').click()
  await byId('sonder-aufgabe-speichern').click()
  await see('sonder-gewinn')
  await see('sonder-steuerpflichtig')
  await byId('sonder-requestedEur').fill('10000')
  await byId('sonder-thesaurierung-speichern').click()
  await see('sonder-nur-bilanz')
  await page.route(`${API}/sondertarife`, (route) => route.fulfill(json({ disposal: null, retained: { nonWithdrawnEur: 60000, favouredEur: 50000, rate: 0.2825, taxEur: 14125, recaptureBaseEur: 0, recaptureEur: 0, nextCarriedForwardEur: 35098.13 }, retainedOnlyBilanz: false })))
  await go('sondertarife')
  await see('sonder-thesaurierung-ergebnis')
  await page.unroute(`${API}/sondertarife`)
  console.log('[09b] PASS: § 16 gain with allowance, § 34a refused for an EÜR and shown for a Bilanz')

  // --- Wages: a Minijob computed by the app, an employee from the payroll, the Lohnsteuer-Anmeldung ------------------------
  await go('lohn')
  await see('lohn-seite')
  await byId('lohn-art-minijob').click()
  await byId('lohn-employee').fill('Ben')
  await byId('lohn-month').fill('1')
  await byId('lohn-grossEur').fill('520')
  await byId('lohn-privat-versichert').click()
  await byId('lohn-privat-versichert').click()
  await byId('lohn-rv-befreit').click()
  // An employer with more than 30 employees pays no U1 (§ 1 Abs. 1 AAG).
  await byId('lohn-ueber-30').click()
  await byId('lohn-buchen').click()
  await see('lohn-minijob')
  await byId('lohn-art-regulaer').click()
  await byId('lohn-employee').fill('Anna')
  await byId('lohn-month').fill('1')
  await byId('lohn-grossEur').fill('3000')
  await byId('lohn-wageTaxEur').fill('300')
  await byId('lohn-churchTaxEur').fill('24')
  await byId('lohn-employeeSocialEur').fill('600')
  await byId('lohn-employerSocialEur').fill('620')
  // The other communities open on „Andere“; choosing ev closes them again.
  await byId('lohn-kirche-andere').click()
  await see('lohn-kirche-iw')
  await byId('lohn-kirche-ev').click()
  await byId('lohn-buchen').click()
  await see('lohn-laeufe')
  await see('lohn-anmeldungen')
  // January's 300 € × 12 = 3.600 €: quarterly (§ 41a Abs. 2 EStG).
  await see('lohn-lsta-Q1/2025')
  // A community the Land's Anmeldung has no line for is said so (served by a route mock).
  await page.route(`${API}/lohn`, (route) => (route.request().method() === 'GET' ? route.fetch().then(async (r) => route.fulfill(json({ ...(await r.json()), unassignedChurchCodes: ['iw'] }))) : route.fallback()))
  await go('lohn')
  await see('lohn-kirche-ohne-zeile')
  await page.unroute(`${API}/lohn`)
  console.log('[09b] PASS: Minijob and employee booked, Lohnsteuer-Anmeldung per quarter')

  // --- E-Bilanz: sent only where the operator set up ERiC; ERiC's refusal shown --------------------------------------------
  await page.route(`${API}/e-bilanz`, (route) => route.fulfill(json({ xbrl: '<x/>', transmitted: false, transmissionReady: true, note: 'Bereit.' })))
  await page.route(`${API}/e-bilanz/uebermittlung`, (route) => route.fulfill(json({ status: 'ok', mode: 'senden', ticket: 'TK-1', protocol: null })))
  await go('export')
  await byId('ebilanz-senden').click()
  await see('ebilanz-ok')
  await page.unroute(`${API}/e-bilanz/uebermittlung`)
  await page.route(`${API}/e-bilanz/uebermittlung`, (route) => route.fulfill(json({ status: 'abgelehnt', messages: ['Pflichtfeld fehlt'] })))
  await byId('ebilanz-pruefen').click()
  await see('ebilanz-abgelehnt')
  await page.unroute(`${API}/e-bilanz/uebermittlung`)
  await page.unroute(`${API}/e-bilanz`)
  console.log('[09b] PASS: E-Bilanz sent where set up, a refusal named')

  // --- The owl drafts a booking (ADR-0101 §18): a readable booking card, taken over or undone like any draft -------------------
  const draft = (actionId, status) => ({
    actionId, status, screen: 'buchung', field: 'draft', instance: null, label: 'Buchung: Druckerpapier', previousValue: null, expectedPreviousValue: null,
    newValue: JSON.stringify({ date: `${YEAR}-03-01`, documentNumber: 'RE-17', text: 'Druckerpapier', lines: [{ account: '4930', side: 'debit', amount: 11900, taxKey: 'vst19' }, { account: '1200', side: 'credit', amount: 11900 }] }),
    beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, reason: 'Aus der Rechnung gelesen.', sourceId: 'estg-4-3', paragraph: '§ 4 Abs. 3 EStG',
  })
  await page.route('**/advisor/session', async (route) => {
    const res = await route.fetch().catch(() => null)
    if (res === null) return
    const body = await res.json()
    body.messages = [...body.messages, { id: 'stub-buchung', role: 'assistant', content: 'Zwei Buchungen vorbereitet.', meta: { actions: [draft('act-b-pending', 'pending'), draft('act-b-applied', 'applied')] }, createdAt: new Date().toISOString() }]
    await route.fulfill({ response: res, json: body })
  })
  await page.goto(`${webOrigin}/app/eule`, { waitUntil: 'networkidle' })
  await see('buchung-entwurf-karte')
  await byPrefix('buchung-entwurf').first().waitFor({ state: 'visible', timeout: 10_000 })
  await see('buchung-entwurf-kopf')
  await see('buchung-entwurf-uebernehmen')
  await see('buchung-entwurf-verwerfen')
  await see('buchung-entwurf-gebucht')
  await see('buchung-entwurf-rueckgaengig')
  await page.unroute('**/advisor/session', { behavior: 'ignoreErrors' })

  // --- Checkout at the self-employment price; an unconfigured tier says so --------------------------------------------------------
  await page.route(`${API}/checkout`, (route) => route.fulfill(json({ statusCode: 503, code: 'PAYMENT_TIER_NOT_CONFIGURED', message: 'x' }, 503)))
  await go('freischalten')
  await byId('checkout-selbststaendig').click()
  await see('checkout-nicht-eingerichtet')
  await page.unroute(`${API}/checkout`)

  // --- A failed first read says so, and a write that fails says why ----------------------------------------------------------------
  await page.route(`${API}`, (route) => route.fulfill(json({ statusCode: 500, message: 'x' }, 500)))
  await go('profil')
  await see('business-fehler')
  await page.unroute(`${API}`)
  await page.route(`${API}`, (route) => (route.request().method() === 'PUT' ? route.fulfill(json({ statusCode: 400, message: 'Die Art lässt sich nicht mehr ändern.' }, 400)) : route.fallback()))
  await go('profil')
  await byId('profil-modus-bilanz').click()
  await see('business-speichern-fehler')
  await page.unroute(`${API}`)
  console.log('[09b] PASS: export, checkout and the honest error states')

  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 09b: Maximiliane Koch (Selbstständig, Schalter an)', runScenario09b).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
