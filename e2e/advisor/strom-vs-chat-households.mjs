// The invented households of strom-vs-chat.mjs: per household the Strom walk in the browser (the
// migrated scenarios' steps, plus the masks for what 25/26 seed over the API), the chat as a customer
// would write it (natural sentences, the invented documents, a fact sheet for the owl's questions),
// and what the fixture expects in the flattened read-back. Every name, number and document is invented.
// Facts the fixture does not carry but the printout needs (master data of 07, 17, 26) are invented here
// for both paths alike and marked „ergänzt“.
import { SCENARIO_1_LENA, SCENARIO_4_WEBER } from '../fixtures/scenarios-2025.fixture.mjs'
import * as D from '../fixtures/escalation-documents.mjs'
import { answerBasis, chooseTopics, fillTopic, leaveStrom, waitForStromStep } from '../scenarios/helpers/scenario-harness.mjs'
import { openCockpitTopic } from '../harness/flows.mjs'

const tid = (id) => `[data-testid="${id}"]`
const IBAN = 'DE89370400440532013000'

async function fill(page, id, value) {
  const input = page.locator(tid(id))
  await input.waitFor({ state: 'visible', timeout: 10_000 })
  await input.fill(String(value))
  await input.blur()
}

async function click(page, id) {
  const target = page.locator(tid(id)).first()
  await target.waitFor({ state: 'visible', timeout: 10_000 })
  await target.click()
}

async function cockpitSettled(page) {
  await page.locator(tid('sheet-schliessen')).waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {})
  await page.locator(tid('cockpit-kacheln')).waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(600)
}

async function startStrom(page) {
  await click(page, 'cockpit-interview')
}

async function lstbMask(page, { gross, wageTax, social }) {
  await fill(page, 'lstb-bruttoarbeitslohn', gross)
  await fill(page, 'lstb-lohnsteuer', wageTax)
  await fill(page, 'lstb-sozialversicherung', social)
  await page.waitForTimeout(300)
  await click(page, 'lstb-weiter')
}

/** The way-to-work mask; `change` records a second way from a date (ADR-0079). */
async function commuteMask(page, c) {
  await page.locator(tid('arbeitstage-urlaub')).waitFor({ state: 'visible', timeout: 10_000 })
  if (c.vacationDays !== undefined) await fill(page, 'arbeitstage-urlaub', c.vacationDays)
  if (c.sickDays !== undefined) await fill(page, 'arbeitstage-krank', c.sickDays)
  if (c.homeOfficeDays !== undefined) await fill(page, 'arbeitstage-homeoffice', c.homeOfficeDays)
  if (c.region) await click(page, `feiertage-region-${c.region}`)
  await fill(page, 'arbeitstage-km', c.oneWayKm)
  if (c.transport) await click(page, `arbeitstage-transport-${c.transport}`)
  if (c.workplace) await fill(page, 'arbeitstage-arbeitsort', c.workplace)
  if (c.change) {
    await click(page, 'arbeitsweg-wechsel')
    await fill(page, 'arbeitsweg-bis', c.change.until)
    await fill(page, 'arbeitsweg-zweiter-ab', c.change.from)
    await fill(page, 'arbeitsweg-zweiter-km', c.change.oneWayKm)
    await click(page, `arbeitsweg-zweiter-transport-${c.change.transport}`)
    await fill(page, 'arbeitsweg-zweiter-ort', c.change.workplace)
  }
  await page.waitForTimeout(300)
  await click(page, 'arbeitstage-weiter')
}

/** The Swiss salary certificate mask: residence, days, the figures, the rate, provision and N-Gre. */
async function swissMask(page, s) {
  await click(page, 'ch-wohnsitz-deutschland')
  await fill(page, 'ch-tage-input', s.nonReturnDays)
  await click(page, 'ch-tage-weiter')
  await page.locator(tid('ch-feld-lohn')).waitFor({ state: 'visible', timeout: 10_000 })
  for (const [field, value] of Object.entries(s.fields)) await fill(page, `ch-feld-${field}`, value)
  if (s.annualRate) {
    await click(page, 'ch-wechselkurs-jahresdurchschnitt')
    await page.locator(tid('ch-wechselkurs-kurs')).fill(s.rate)
    const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/wechselkurs'), { timeout: 10_000 }).catch(() => null)
    await click(page, 'ch-wechselkurs-speichern')
    await saved
  }
  for (const [field, value] of Object.entries(s.provision ?? {})) await fill(page, `ch-vorsorge-${field}`, value)
  for (const [field, value] of Object.entries(s.nGre ?? {})) {
    await fill(page, `ch-ngre-${field}`, value)
    await page.waitForTimeout(250)
  }
  await click(page, 'ch-ngre-sonderfaelle-nein')
  await page.waitForTimeout(600)
  await click(page, 'ch-lohnausweis-weiter')
}

async function childMask(page, child, note = () => {}) {
  await page.locator(`${tid('kind-neu')}, ${tid('kind-vorname')}`).first().waitFor({ state: 'visible', timeout: 10_000 })
  if (await page.locator(tid('kind-neu')).isVisible()) await click(page, 'kind-neu')
  await fill(page, 'kind-vorname', child.firstName)
  await fill(page, 'kind-nachname', child.lastName)
  await fill(page, 'kind-geburtsdatum', child.birthDate)
  if (child.taxId) await fill(page, 'kind-steuerid', child.taxId)
  if ((await page.locator(tid('kind-kindergeld')).count()) === 0 && (await page.locator(tid('kind-weitere-angaben')).count()) > 0) await click(page, 'kind-weitere-angaben')
  if (child.childBenefit !== undefined) await fill(page, 'kind-kindergeld', child.childBenefit)
  if (child.kinship) await click(page, `kind-verhaeltnis-${child.kinship}`)
  if (child.kinshipB && (await page.locator(tid(`kind-verhaeltnis-b-${child.kinshipB}`)).count())) await click(page, `kind-verhaeltnis-b-${child.kinshipB}`)
  if (child.office) await fill(page, 'kind-familienkasse', child.office)
  if (child.domestic && (await page.locator(tid('kind-inland-ja')).count())) await click(page, 'kind-inland-ja')
  if (child.registered && (await page.locator(tid('kind-gemeldet-ja')).count())) await click(page, 'kind-gemeldet-ja')
  if (child.benefitToMe && (await page.locator(tid('kind-kindergeld-an-mich-ja')).count())) await click(page, 'kind-kindergeld-an-mich-ja')
  if (child.care) {
    await fill(page, 'kind-betreuung', child.care.amount)
    await fill(page, 'kind-betreuung-von', child.care.from)
    await fill(page, 'kind-betreuung-bis', child.care.to)
    if (child.care.provider && (await page.locator(tid('kind-betreuung-anbieter')).count())) await fill(page, 'kind-betreuung-anbieter', child.care.provider)
  }
  if (child.healthAbroad !== undefined) {
    const premium = page.getByLabel('Krankenversicherung des Kindes', { exact: true })
    await premium.fill(String(child.healthAbroad))
    await premium.blur()
    await click(page, 'kind-kv-ausland')
  }
  if (child.allowancePayer) {
    if (await page.locator(tid(`kind-zulage-von-${child.allowancePayer}`)).count()) await click(page, `kind-zulage-von-${child.allowancePayer}`)
    else note(`${child.firstName}: the children mask offers no „Die Kinderzulage kommt mit dem Lohn von“ (it reads the marital status from the master data, not yet entered in the Strom)`)
  }
  const saved = page.waitForResponse((r) => r.url().includes('/kinder') && ['PUT', 'POST'].includes(r.request().method()), { timeout: 10_000 }).catch(() => null)
  await click(page, 'kind-speichern')
  await saved
  await page.waitForTimeout(400)
}

/** Master data from the cockpit; `partner` couples the year and records Person B (ADR-0054). */
async function masterData(page, m, partner) {
  await cockpitSettled(page)
  await click(page, 'cockpit-stammdaten')
  await fill(page, 'stammdaten-geburtsdatum', m.birthDate)
  if (m.occupation) await fill(page, 'stammdaten-beruf', m.occupation)
  await fill(page, 'stammdaten-strasse', m.street)
  await fill(page, 'stammdaten-hausnummer', m.houseNumber)
  await fill(page, 'stammdaten-plz', m.postalCode)
  await fill(page, 'stammdaten-wohnort', m.city)
  await click(page, `stammdaten-familienstand-${m.maritalStatus}`)
  if (m.marriedSince) await fill(page, 'stammdaten-familienstandSeit', m.marriedSince)
  await click(page, `stammdaten-religion-${m.religion}`)
  await click(page, 'stammdaten-einwilligung')
  await fill(page, 'stammdaten-finanzamt', m.taxOffice)
  await fill(page, 'stammdaten-iban', m.iban)
  if (partner) {
    await click(page, 'kopplung-zusammen')
    await fill(page, 'personb-vorname', partner.firstName)
    await fill(page, 'personb-nachname', partner.lastName)
    if (partner.taxId) await fill(page, 'personb-steuerid', partner.taxId)
    if (partner.birthDate) await fill(page, 'personb-geburtsdatum', partner.birthDate)
    if (partner.occupation) await fill(page, 'personb-beruf', partner.occupation)
    if (partner.religion && (await page.locator(tid(`personb-religion-${partner.religion}`)).count())) {
      await click(page, `personb-religion-${partner.religion}`)
      if (await page.locator(tid('personb-einwilligung')).count()) await click(page, 'personb-einwilligung')
    }
    await click(page, 'personb-speichern')
    await page.waitForTimeout(500)
  }
  await click(page, 'stammdaten-speichern')
  await page.waitForTimeout(600)
  await click(page, 'stammdaten-zurueck')
  await cockpitSettled(page)
}

async function fromCockpit(page, tile) {
  await cockpitSettled(page)
  await click(page, tile)
}


// ---- What the fixture expects, in the flattened read-back (lists sorted: children by first name, objects by street) --
const person = (p) => ({ 'profile.firstName': p.firstName, 'profile.lastName': p.lastName, ...(p.taxId ? { 'profile.steuerId': p.taxId } : {}), ...(p.taxNumber ? { 'profile.steuernummer': p.taxNumber } : {}) })
const master = (m) => ({
  'stammdaten.geburtsdatum': m.birthDate, 'stammdaten.strasse': m.street, 'stammdaten.hausnummer': m.houseNumber, 'stammdaten.plz': m.postalCode, 'stammdaten.wohnort': m.city,
  ...(m.occupation ? { 'stammdaten.beruf': m.occupation } : {}), 'stammdaten.religion': m.religion, 'stammdaten.familienstand': m.maritalStatus,
  ...(m.marriedSince ? { 'stammdaten.familienstandSeit': m.marriedSince } : {}), 'stammdaten.iban': m.iban, 'stammdaten.finanzamt': m.taxOffice,
})
const partnerB = (b) => ({
  'kopplung.filingType': 'zusammen', 'kopplung.personB.firstName': b.firstName, 'kopplung.personB.lastName': b.lastName,
  ...(b.taxId ? { 'kopplung.personB.steuerId': b.taxId } : {}), ...(b.birthDate ? { 'kopplung.personB.geburtsdatum': b.birthDate } : {}),
  ...(b.occupation ? { 'kopplung.personB.beruf': b.occupation } : {}), ...(b.religion ? { 'kopplung.personB.religion': b.religion } : {}),
})
const basis = (who, answers) => Object.fromEntries(Object.entries(answers).map(([k, v]) => [`interview${who}.${k}`, v]))
const lstbOf = (who, gross, wageTax, social) => ({ [`lstb${who}.bruttoarbeitslohn`]: gross, [`lstb${who}.lohnsteuer`]: wageTax, [`lstb${who}.sozialversicherung`]: social })
const wayOf = (who, c) => Object.fromEntries(
  Object.entries({ vacationDays: c.vacationDays, sickDays: c.sickDays, homeOfficeDays: c.homeOfficeDays, oneWayKm: c.oneWayKm, transport: c.transport, workplace: c.workplace, publicHolidayRegion: c.region })
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [`arbeitsweg${who}.inputs.${k}`, v]),
)
const childOf = (i, c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined).map(([k, v]) => [`kinder.kinder[${i}].${k}`, v]))
const swissOf = (who, fields, nGre, extra = {}) => ({
  ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [`chLohnausweis${who}.fields[${k}]`, v])),
  ...Object.fromEntries(Object.entries(nGre).map(([k, v]) => [`chLohnausweis${who}.nGre.${k}`, v])),
  [`chLohnausweis${who}.status`]: 'echter-grenzgaenger', [`chLohnausweis${who}.exchangeRate.mode`]: 'jahresdurchschnitt', [`chLohnausweis${who}.exchangeRate.rate`]: 1.065,
  ...extra,
})

// ---- 01 Lena Hoffmann ----------------------------------------------------------------------------
const L = SCENARIO_1_LENA
const lena = {
  id: 'lena',
  title: '#01 Lena Hoffmann — ledig, angestellt, Pendlerin, Spende',
  onboarding: { firstName: L.profile.firstName, lastName: L.profile.lastName, taxId: L.profile.taxId, taxNumber: L.profile.taxNumber },
  async strom(page) {
    await startStrom(page)
    await answerBasis(page, L.interview)
    await waitForStromStep(page, 'lohnsteuerbescheinigung')
    await lstbMask(page, { gross: L.lstb.grossWage, wageTax: L.lstb.wageTax, social: L.lstb.socialSecurity })
    await waitForStromStep(page, 'arbeitsweg')
    await commuteMask(page, L.commute)
    await chooseTopics(page, ['spenden'])
    await fillTopic(page, 'spenden', { 'spenden-betrag': L.specialExpenses.donations })
    await waitForStromStep(page, 'fertig')
    await leaveStrom(page)
    await masterData(page, L.masterData)
  },
  chat: {
    turns: [
      'Hallo! Ich möchte meine Steuererklärung für 2025 machen. Ich heiße Lena Hoffmann, bin ledig, als Ingenieurin angestellt und habe keine Kinder.',
      'Auf meiner Lohnsteuerbescheinigung stehen 94.999 € Bruttoarbeitslohn, 21.797 € einbehaltene Lohnsteuer und zusammen 17.314 € Arbeitnehmeranteile zur Sozialversicherung.',
      'Ich fahre an fünf Tagen die Woche mit dem Auto zur Arbeit, 70 km einfach, nach 76131 Karlsruhe, Durlacher Allee 50. Ich hatte 30 Urlaubstage, war 4 Tage krank und war keinen Tag im Homeoffice. Ich wohne in Baden-Württemberg.',
      'Außerdem habe ich 2025 insgesamt 300 € gespendet.',
      'Für das Formular: Steuer-ID 31234567890, Steuernummer 0612345678, geboren am 14.05.1991. Ich wohne in der Kartäuserstraße 12, 79102 Freiburg. Mein Finanzamt ist Freiburg-Stadt, meine IBAN DE89370400440532013000. Ich bin konfessionslos und willige ein, dass ihr das speichert.',
    ],
    facts: [
      { when: ['urlaub', 'krank'], say: 'Urlaub 30 Tage, krank 4 Tage, Homeoffice 0 Tage, Fünf-Tage-Woche.' },
      { when: ['arbeitsort', 'tätigkeitsstätte', 'arbeitgeber'], say: 'Meine erste Tätigkeitsstätte ist 76131 Karlsruhe, Durlacher Allee 50, 70 km einfach mit dem Auto.' },
      { when: ['werbungskosten', 'arbeitsmittel', 'fortbildung'], say: 'Weitere Werbungskosten, Arbeitsmittel oder Fortbildungen hatte ich nicht.' },
      { when: ['handwerker', 'haushaltsnah', 'riester', 'krankheitskosten'], say: 'Handwerker, haushaltsnahe Dienste, Riester oder Krankheitskosten hatte ich nicht.' },
      { when: ['religion', 'konfession', 'kirchensteuer'], say: 'Ich bin konfessionslos und willige in die Speicherung ein.' },
      { when: ['finanzamt', 'iban', 'bankverbindung'], say: 'Finanzamt Freiburg-Stadt, IBAN DE89370400440532013000.' },
      { when: ['geburtsdatum', 'adresse', 'anschrift'], say: 'Geboren am 14.05.1991, Kartäuserstraße 12, 79102 Freiburg.' },
    ],
  },
  expected: { ...person(L.profile), ...master(L.masterData), ...basis('A', L.interview), ...lstbOf('A', L.lstb.grossWage, L.lstb.wageTax, L.lstb.socialSecurity), ...wayOf('A', L.commute), 'interviewA.spenden': 'Ja', 'interviewA.spenden-betrag': 300 },
  expectedEstimate: L.expectedEstimate,
  expectedPdf: L.expectedPdfFields,
}

// ---- 04 Weber couple -----------------------------------------------------------------------------
const W = SCENARIO_4_WEBER
const weber = {
  id: 'weber',
  title: '#04 Thomas & Sabine Weber — Zusammenveranlagung, Kapital 50.000 €, drei Mietobjekte',
  onboarding: { firstName: W.thomas.profile.firstName, lastName: W.thomas.profile.lastName, taxId: W.thomas.profile.taxId, taxNumber: W.thomas.profile.taxNumber },
  async strom(page) {
    await startStrom(page)
    await answerBasis(page, { ...W.thomas.interview, 'partner-job': 'Angestellt', 'partner-ausland': 'Nein' })
    await waitForStromStep(page, 'lohnsteuerbescheinigung')
    await lstbMask(page, { gross: W.thomas.lstb.grossWage, wageTax: W.thomas.lstb.wageTax, social: W.thomas.lstb.socialSecurity })
    await waitForStromStep(page, 'arbeitsweg')
    await commuteMask(page, W.thomas.commute)
    await chooseTopics(page, ['einkuenfte'], { einkuenfte: 'Beides' })
    await fillTopic(page, 'einkuenfte', { 'kap-depot': 'Deutscher Broker', 'vermietung-art': 'Mehrere' })
    await waitForStromStep(page, 'fertig')
    await leaveStrom(page)
    await masterData(page, W.thomas.masterData, { ...W.sabine })
    await fromCockpit(page, 'partner-lstb')
    await lstbMask(page, { gross: W.sabine.lstb.grossWage, wageTax: W.sabine.lstb.wageTax, social: W.sabine.lstb.socialSecurity })
    await fromCockpit(page, 'partner-arbeitsweg')
    await commuteMask(page, W.sabine.commute)
    await cockpitSettled(page)
    await openCockpitTopic(page, 'kapital')
    await click(page, 'kapital-inhaber-gemeinsam')
    for (const field of ['kapitalertraege', 'sparerPauschbetrag', 'kapitalertragsteuer', 'solidaritaetszuschlag', 'kirchensteuer']) await fill(page, `kapital-${field}`, W.capital[field])
    await click(page, 'kapital-weiter')
    await cockpitSettled(page)
    await openCockpitTopic(page, 'vermietung')
    for (const [i, r] of W.rentals.entries()) {
      if ((await page.locator(tid(`vermietung-${i}-mieteinnahmen`)).count()) === 0) await click(page, 'objekt-hinzufuegen')
      await fill(page, `vermietung-${i}-mieteinnahmen`, r.grossRent)
      await fill(page, `vermietung-${i}-werbungskosten`, r.advertisingCosts)
      await fill(page, `vermietung-${i}-anschaffungskosten`, r.buildingCost)
      await fill(page, `vermietung-${i}-baujahr`, r.yearOfConstruction)
      await fill(page, `vermietung-${i}-adresse`, r.address.street)
      await fill(page, `vermietung-${i}-plz`, r.address.postalCode)
      await fill(page, `vermietung-${i}-ort`, r.address.city)
      await fill(page, `vermietung-${i}-wohnflaeche`, r.address.livingArea)
      await fill(page, `vermietung-${i}-einheiten`, r.address.units)
      await click(page, i === 0 ? 'vermietung-afa-wie-vorjahr-ja' : `vermietung-${i}-afa-wie-vorjahr-ja`)
      await page.waitForTimeout(300)
    }
    await click(page, 'vermietung-weiter')
    await cockpitSettled(page)
  },
  chat: {
    turns: [
      'Hallo! Ich möchte die gemeinsame Steuererklärung 2025 für meine Frau und mich machen, wir sind seit dem 15.05.1999 verheiratet und wollen zusammen veranlagt werden. Ich bin Thomas Weber, Bauingenieur, geboren am 09.11.1972, Steuer-ID 51234567890, Steuernummer 9312345678. Kinder haben wir keine.',
      'Meine Frau heißt Sabine Weber, geboren am 30.04.1975, Steuer-ID 51234567891, sie ist Architektin. Wir sind beide angestellt, nur in Deutschland. Wir wohnen in der Gänsheidestraße 8, 70184 Stuttgart, Finanzamt Stuttgart II, IBAN DE89370400440532013000. Wir sind beide konfessionslos und willigen ein, dass ihr das speichert.',
      'Meine Lohnsteuerbescheinigung: 82.000 € brutto, 9.890 € Lohnsteuer, 15.473 € Sozialversicherung (Arbeitnehmeranteile). Die von Sabine: 48.000 € brutto, 10.420 € Lohnsteuer, 10.008 € Sozialversicherung.',
      'Ich fahre mit dem Auto 15 km zur Arbeit nach Stuttgart Zentrum, Sabine mit dem Auto 8 km nach Stuttgart Ost, beide fünf Tage die Woche, kein Homeoffice. Ich hatte 30 Urlaubstage und 5 Krankheitstage, Sabine 30 Urlaubstage und 4 Krankheitstage. Wir wohnen in Baden-Württemberg.',
      'Wir haben ein gemeinsames Depot bei einem deutschen Broker: 50.000 € Kapitalerträge, davon 2.000 € Sparer-Pauschbetrag genutzt, 12.000 € Kapitalertragsteuer und 660 € Solidaritätszuschlag einbehalten, keine Kirchensteuer.',
      'Außerdem vermieten wir drei Objekte. Erstens eine Eigentumswohnung in der Hölderlinstraße 3, 70174 Stuttgart: 85 m², 1 Einheit, 14.400 € Mieteinnahmen, 3.200 € Werbungskosten, Gebäude-Anschaffungskosten 280.000 €, Baujahr 1995, AfA wie im Vorjahr.',
      'Zweitens ein Mehrfamilienhaus in der Mühlstraße 21, 73728 Esslingen: 220 m², 3 Wohnungen, 38.400 € Mieteinnahmen, 9.800 € Werbungskosten, Anschaffungskosten Gebäude 620.000 €, Baujahr 1978, AfA wie im Vorjahr.',
      'Drittens eine Eigentumswohnung in der Schorndorfer Straße 55, 71638 Ludwigsburg: 65 m², 1 Einheit, 10.200 € Mieteinnahmen, 2.600 € Werbungskosten, Anschaffungskosten Gebäude 240.000 €, Baujahr 2018, AfA wie im Vorjahr.',
    ],
    facts: [
      { when: ['urlaub', 'krank'], say: 'Ich: 30 Urlaubstage, 5 Krankheitstage. Sabine: 30 Urlaubstage, 4 Krankheitstage. Beide kein Homeoffice, Fünf-Tage-Woche.' },
      { when: ['kirchensteuer', 'konfession', 'religion'], say: 'Wir sind beide konfessionslos (Einwilligung erteilt), auf den Kapitalerträgen wurde keine Kirchensteuer einbehalten.' },
      { when: ['afa', 'abschreibung'], say: 'Bei allen drei Objekten bleibt die AfA wie im Vorjahr, 2 % linear.' },
      { when: ['wohnfläche', 'einheiten'], say: 'Hölderlinstraße 3: 85 m², 1 Einheit. Mühlstraße 21: 220 m², 3 Einheiten. Schorndorfer Straße 55: 65 m², 1 Einheit.' },
      { when: ['werbungskosten', 'arbeitsmittel', 'fortbildung'], say: 'Weitere Werbungskosten als Arbeitnehmer haben wir beide nicht.' },
      { when: ['handwerker', 'haushaltsnah', 'spenden', 'krankheitskosten'], say: 'Handwerker, haushaltsnahe Dienste, Spenden oder Krankheitskosten hatten wir 2025 nicht.' },
    ],
  },
  expected: {
    ...person(W.thomas.profile), ...master(W.thomas.masterData), ...partnerB(W.sabine), ...basis('A', { ...W.thomas.interview, 'partner-job': 'Angestellt', 'partner-ausland': 'Nein' }),
    ...lstbOf('A', W.thomas.lstb.grossWage, W.thomas.lstb.wageTax, W.thomas.lstb.socialSecurity), ...lstbOf('B', W.sabine.lstb.grossWage, W.sabine.lstb.wageTax, W.sabine.lstb.socialSecurity),
    ...wayOf('A', W.thomas.commute), ...wayOf('B', W.sabine.commute),
    'kapital.inhaber': 'gemeinsam', 'kapital.depot.kind': 'deutscher-broker', 'kapital.kapitalertraege': 50000, 'kapital.sparerPauschbetrag': 2000, 'kapital.kapitalertragsteuer': 12000, 'kapital.solidaritaetszuschlag': 660, 'kapital.kirchensteuer': 0,
    ...Object.fromEntries(W.rentals.flatMap((r, i) => {
      const [street, number] = [r.address.street.replace(/(?<!\s)\s+\d+$/, ''), r.address.street.match(/(?<!\d)(\d+)$/)[1]]
      return Object.entries({ mieteinnahmen: r.grossRent, werbungskosten: r.advertisingCosts, anschaffungskosten: r.buildingCost, baujahr: r.yearOfConstruction, strasse: street, hausnummer: number, plz: r.address.postalCode, city: r.address.city, livingArea: r.address.livingArea, einheiten: r.address.units, depreciationAsLastYear: true })
        .map(([k, v]) => [`vermietung.properties[${i}].${k}`, v])
    })),
    'vermietung.properties[0].facts.depreciation.amount': 5600, 'vermietung.properties[1].facts.depreciation.amount': 12400, 'vermietung.properties[2].facts.depreciation.amount': 4800,
  },
  expectedPdf: W.expectedPdfFields,
}

// ---- 05 Hans Meyer -------------------------------------------------------------------------------
const meyer = {
  id: 'meyer',
  title: '#05 Hans Meyer — Rentner, gesetzliche Rente 24.000 €, Kapitalerträge 8.000 €',
  onboarding: { firstName: 'Hans', lastName: 'Meyer', taxId: '61234567890' },
  async strom(page) {
    await startStrom(page)
    await answerBasis(page, { job: 'Rente', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })
    await waitForStromStep(page, 'rente')
    await page.locator('text=Gesetzliche Rente').click()
    const amount = page.getByLabel(/Jahresbetrag der Rente/i)
    await amount.fill('24000')
    await amount.blur()
    await page.waitForTimeout(400)
    const start = page.getByLabel(/Jahr des Rentenbeginns/i)
    await start.fill('2021')
    await start.blur()
    await page.locator('text=Steuerpflichtiger Anteil').waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByRole('button', { name: 'Weiter', exact: true }).click()
    await chooseTopics(page, ['einkuenfte'], { einkuenfte: 'Kapitalerträge' })
    await fillTopic(page, 'einkuenfte', { 'kap-depot': 'Deutscher Broker' })
    await waitForStromStep(page, 'fertig')
    await leaveStrom(page)
    await cockpitSettled(page)
    await openCockpitTopic(page, 'kapital')
    await page.locator(tid('kapital-sparerPauschbetrag')).waitFor({ state: 'visible', timeout: 15_000 })
    for (const [field, value] of [['kapitalertraege', 8000], ['sparerPauschbetrag', 1000], ['kapitalertragsteuer', 1750], ['solidaritaetszuschlag', 96], ['kirchensteuer', 0]]) await fill(page, `kapital-${field}`, value)
    await click(page, 'kapital-weiter')
    await masterData(page, { birthDate: '14.03.1956', occupation: 'Rentner', street: 'Goethestraße', houseNumber: '10', postalCode: '70174', city: 'Stuttgart', maritalStatus: 'ledig', religion: 'VD', taxOffice: 'Stuttgart I', iban: IBAN })
  },
  chat: {
    turns: [
      'Guten Tag, ich bin Hans Meyer, Rentner, ledig, keine Kinder, und möchte meine Steuererklärung 2025 machen. Meine Steuer-ID ist 61234567890.',
      'Ich bekomme eine gesetzliche Altersrente von 24.000 € im Jahr, Rentenbeginn war 2021.',
      'Dazu habe ich Kapitalerträge bei einem deutschen Broker: 8.000 €, davon 1.000 € Sparer-Pauschbetrag genutzt, 1.750 € Kapitalertragsteuer und 96 € Solidaritätszuschlag einbehalten, keine Kirchensteuer.',
      'Ich bin am 14.03.1956 geboren und wohne in der Goethestraße 10, 70174 Stuttgart. Finanzamt Stuttgart I, IBAN DE89370400440532013000. Ich bin konfessionslos, die Angabe dürft ihr speichern.',
    ],
    facts: [
      { when: ['beruf'], say: 'Als Beruf bitte „Rentner“.' },
      { when: ['kranken', 'pflegeversicherung'], say: 'Weitere Kranken- oder Pflegeversicherungsbeiträge habe ich nicht anzugeben.' },
      { when: ['handwerker', 'haushaltsnah', 'spenden'], say: 'Handwerker, haushaltsnahe Dienste oder Spenden hatte ich 2025 nicht.' },
      { when: ['kirchensteuer', 'konfession', 'religion'], say: 'Ich bin konfessionslos (Einwilligung erteilt), keine Kirchensteuer.' },
    ],
  },
  expected: {
    ...person({ firstName: 'Hans', lastName: 'Meyer', taxId: '61234567890' }),
    ...master({ birthDate: '14.03.1956', occupation: 'Rentner', street: 'Goethestraße', houseNumber: '10', postalCode: '70174', city: 'Stuttgart', maritalStatus: 'ledig', religion: 'VD', taxOffice: 'Stuttgart I', iban: IBAN }),
    ...basis('A', { job: 'Rente', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }),
    'renteA.kind': 'GesetzlicheRente', 'renteA.jahresbetrag': 24000, 'renteA.rentenbeginnJahr': 2021,
    'kapital.depot.kind': 'deutscher-broker', 'kapital.kapitalertraege': 8000, 'kapital.sparerPauschbetrag': 1000, 'kapital.kapitalertragsteuer': 1750, 'kapital.solidaritaetszuschlag': 96, 'kapital.kirchensteuer': 0,
  },
}

// ---- 07 David Richter ----------------------------------------------------------------------------
const richter = {
  id: 'richter',
  title: '#07 David Richter — alleinerziehend, ein Kind, ÖPNV',
  onboarding: { firstName: 'David', lastName: 'Richter', taxId: '81234567890' },
  async strom(page) {
    await startStrom(page)
    await answerBasis(page, { job: 'Angestellt', ausland: 'Nein', kinder: '1 Kind', familienstand: 'Geschieden oder getrennt' })
    await waitForStromStep(page, 'lohnsteuerbescheinigung')
    await lstbMask(page, { gross: 52000, wageTax: 8400, social: 11000 })
    await waitForStromStep(page, 'arbeitsweg')
    await commuteMask(page, { vacationDays: 28, sickDays: 3, homeOfficeDays: 0, region: 'NW', oneWayKm: 25, transport: 'oepnv', workplace: 'Köln' })
    await waitForStromStep(page, 'kinder')
    await childMask(page, { firstName: 'Felix', lastName: 'Richter', birthDate: '12.04.2019', taxId: '91234567890', childBenefit: 3060, kinship: '1', office: 'Familienkasse Nordrhein-Westfalen', domestic: true, registered: true, benefitToMe: true })
    await click(page, 'kinder-weiter')
    await chooseTopics(page, [])
    await fillTopic(page, 'alleinerziehend', { 'ae-weitere-person': 'Nein', 'ae-haushaltsgemeinschaft': 'Nein' })
    await waitForStromStep(page, 'fertig')
    await leaveStrom(page)
    // ergänzt: the fixture has no master data for David; invented alike for both paths.
    await masterData(page, { birthDate: '22.08.1985', occupation: 'Kaufmann', street: 'Venloer Straße', houseNumber: '101', postalCode: '50672', city: 'Köln', maritalStatus: 'geschieden', religion: 'VD', taxOffice: 'Köln-Mitte', iban: IBAN })
  },
  chat: {
    turns: [
      'Hallo, ich bin David Richter, geschieden und alleinerziehend mit meinem Sohn Felix, und möchte meine Steuererklärung 2025 machen. Steuer-ID 81234567890.',
      'Ich bin angestellt. Laut Lohnsteuerbescheinigung: 52.000 € brutto, 8.400 € Lohnsteuer, 11.000 € Sozialversicherung.',
      'Zur Arbeit nach Köln fahre ich mit Bus und Bahn, 25 km einfach, fünf Tage die Woche. 28 Tage Urlaub, 3 Tage krank, kein Homeoffice. Ich wohne in Nordrhein-Westfalen.',
      'Felix Richter ist mein leiblicher Sohn, geboren am 12.04.2019, Steuer-ID 91234567890. Er lebt das ganze Jahr bei mir in Deutschland und ist bei mir gemeldet. Das Kindergeld von 3.060 € bekomme ich von der Familienkasse Nordrhein-Westfalen.',
      'In meinem Haushalt lebt außer Felix und mir keine weitere erwachsene Person, auch keine Haushaltsgemeinschaft.',
      'Für das Formular: geboren am 22.08.1985, Beruf Kaufmann, Venloer Straße 101, 50672 Köln, Finanzamt Köln-Mitte, IBAN DE89370400440532013000. Ich bin konfessionslos und willige in die Speicherung ein.',
    ],
    facts: [
      { when: ['kinderbetreuung', 'kita', 'betreuung'], say: 'Kinderbetreuungskosten hatte ich keine.' },
      { when: ['anderen elternteil', 'mutter', 'unterhalt'], say: 'Felix’ Mutter wohnt nicht bei uns; Unterhalt zahle ich keinen, Felix lebt ganz bei mir.' },
      { when: ['werbungskosten', 'arbeitsmittel', 'fortbildung'], say: 'Weitere Werbungskosten hatte ich nicht.' },
      { when: ['handwerker', 'haushaltsnah', 'spenden', 'krankheitskosten'], say: 'Handwerker, haushaltsnahe Dienste, Spenden oder Krankheitskosten hatte ich nicht.' },
    ],
  },
  expected: {
    ...person({ firstName: 'David', lastName: 'Richter', taxId: '81234567890' }),
    ...master({ birthDate: '22.08.1985', occupation: 'Kaufmann', street: 'Venloer Straße', houseNumber: '101', postalCode: '50672', city: 'Köln', maritalStatus: 'geschieden', religion: 'VD', taxOffice: 'Köln-Mitte', iban: IBAN }),
    ...basis('A', { job: 'Angestellt', ausland: 'Nein', kinder: '1 Kind', familienstand: 'Geschieden oder getrennt', 'ae-weitere-person': 'Nein', 'ae-haushaltsgemeinschaft': 'Nein' }),
    ...lstbOf('A', 52000, 8400, 11000), ...wayOf('A', { vacationDays: 28, sickDays: 3, homeOfficeDays: 0, oneWayKm: 25, transport: 'oepnv', workplace: 'Köln', region: 'NW' }),
    ...childOf(0, { firstName: 'Felix', lastName: 'Richter', geburtsdatum: '12.04.2019', taxId: '91234567890', childBenefitClaimEur: 3060, kinship: '1', familyBenefitsOffice: 'Familienkasse Nordrhein-Westfalen', domesticResidenceAllYear: true, registeredWithMeAllYear: true, childBenefitToMeAllYear: true }),
  },
}

// ---- 17 Maximilian Allesgeber ---------------------------------------------------------------------
const allesgeber = {
  id: 'allesgeber',
  title: '#17 Maximilian Allesgeber — alle Lebenslagen (Umzug, DHF, Lohnersatz, Abfindung, Minijob)',
  onboarding: { firstName: 'Maximilian', lastName: 'Allesgeber', taxId: '04452397686', taxNumber: '181/140/01235' },
  async strom(page) {
    await startStrom(page)
    await answerBasis(page, { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })
    await waitForStromStep(page, 'lohnsteuerbescheinigung')
    await lstbMask(page, { gross: 70000, wageTax: 14000, social: 13000 })
    await waitForStromStep(page, 'arbeitsweg')
    await fill(page, 'arbeitstage-km', 10)
    await click(page, 'arbeitstage-weiter')
    await chooseTopics(page, ['dhf', 'umzug', 'abfindung', 'lohnersatz', 'nebenjob'], { nebenjob: 'Minijob' })
    await fillTopic(page, 'umzug', { 'umzug-kosten': 3500 })
    await fillTopic(page, 'doppelte-haushaltsfuehrung', { 'dhf-miete': 1200 })
    await fillTopic(page, 'lohnersatz', { 'lohnersatz-betrag': 4000 })
    await fillTopic(page, 'abfindung', { 'abfindung-betrag': 25000 })
    await waitForStromStep(page, 'fertig')
    await leaveStrom(page)
    // ergänzt: invented master data, alike for both paths.
    await masterData(page, { birthDate: '01.02.1980', occupation: 'Vertriebsleiter', street: 'Musterstraße', houseNumber: '5', postalCode: '70173', city: 'Stuttgart', maritalStatus: 'ledig', religion: 'VD', taxOffice: 'Stuttgart I', iban: IBAN })
  },
  chat: {
    turns: [
      'Hallo, ich bin Maximilian Allesgeber, ledig, keine Kinder, angestellt, und möchte meine Steuererklärung 2025 machen. Steuer-ID 04452397686, Steuernummer 181/140/01235.',
      'Lohnsteuerbescheinigung: 70.000 € brutto, 14.000 € Lohnsteuer, 13.000 € Sozialversicherung. Mein Arbeitsweg ist 10 km einfach.',
      'Ich bin 2025 aus beruflichen Gründen umgezogen, der Umzug hat 3.500 € gekostet. Außerdem habe ich eine doppelte Haushaltsführung, die Zweitwohnung kostet 1.200 € Miete.',
      'Ich habe 4.000 € Lohnersatzleistungen bekommen (Krankengeld) und eine Abfindung von 25.000 € von meinem alten Arbeitgeber.',
      'Und ich habe nebenher einen Minijob.',
      'Für das Formular: geboren am 01.02.1980, Beruf Vertriebsleiter, Musterstraße 5, 70173 Stuttgart, Finanzamt Stuttgart I, IBAN DE89370400440532013000. Ich bin konfessionslos und willige in die Speicherung ein.',
    ],
    facts: [
      { when: ['urlaub', 'krank', 'verkehrsmittel', 'arbeitsort'], say: 'Zu Urlaub, Krankheitstagen, Verkehrsmittel und Arbeitsort kann ich nichts weiter sagen; bitte nur die 10 km eintragen.' },
      { when: ['minijob', 'nebenjob', 'pauschal'], say: 'Der Minijob ist pauschal versteuert, mehr gibt es dazu nicht.' },
      { when: ['handwerker', 'haushaltsnah', 'spenden', 'riester', 'krankheitskosten'], say: 'Handwerker, haushaltsnahe Dienste, Spenden, Riester oder Krankheitskosten hatte ich nicht.' },
    ],
  },
  expected: {
    ...person({ firstName: 'Maximilian', lastName: 'Allesgeber', taxId: '04452397686', taxNumber: '18114001235' }),
    ...master({ birthDate: '01.02.1980', occupation: 'Vertriebsleiter', street: 'Musterstraße', houseNumber: '5', postalCode: '70173', city: 'Stuttgart', maritalStatus: 'ledig', religion: 'VD', taxOffice: 'Stuttgart I', iban: IBAN }),
    ...basis('A', { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig', umzug: 'Ja', 'umzug-kosten': 3500, dhf: 'Ja', 'dhf-miete': 1200, lohnersatz: 'Ja', 'lohnersatz-betrag': 4000, abfindung: 'Ja', 'abfindung-betrag': 25000, nebenjob: 'Minijob' }),
    ...lstbOf('A', 70000, 14000, 13000), 'arbeitswegA.inputs.oneWayKm': 10,
  },
}

// ---- 25 Familie Sommer ---------------------------------------------------------------------------
const SOMMER_DOCS = {
  lstbElias: D.lstb({ name: 'Elias Sommer', employer: 'Nordwerk GmbH', gross: 36000, wageTax: 6210, rv: 3348, kv: 2952, pv: 540, av: 468 }),
  lstbNora: D.lstb({ name: 'Nora Sommer', employer: 'Südpraxis GmbH', gross: 21000, wageTax: 2150, rv: 1953, kv: 1722, pv: 315, av: 273 }),
  chElias: D.lohnausweis({ last: 'Sommer', first: 'Elias', street: 'Lindenweg 4', ahv: '756.1111.2222.33', born: '12.03.1987', employer: 'Rheinbrücke AG', lohn: 54000, brutto: 54000, ahvSum: 3456, bvg: 2700, netto: 47844, qst: 2430 }),
  chNora: D.lohnausweis({ last: 'Sommer', first: 'Nora', street: 'Lindenweg 4', ahv: '756.4444.5555.66', born: '30.11.1989', employer: 'Klinik Basel AG', lohn: 31200, brutto: 31200, ahvSum: 1997, bvg: 1450, netto: 27753, qst: 1404 }),
  pkElias: D.pensionRows({ title: 'Herr', name: 'Elias Sommer', spar: "2'200.00", risiko: '500.00', sparObl: "1'700.00", risikoObl: '400.00' }),
  pkNora: D.pensionRows({ title: 'Frau', name: 'Nora Sommer', spar: "1'200.00", risiko: '250.00', sparObl: '900.00', risikoObl: '200.00' }),
  premiumElias: D.premiumLetter({ name: 'Elias Sommer', ktg: '182,40', nbu: '214,60' }),
  premiumNora: D.premiumLetter({ name: 'Nora Sommer', ktg: '104,10', nbu: '121,90' }),
  health: D.familyHealth([
    { name: 'Elias Sommer', own: '300.00', premium: "2'100.00" },
    { name: 'Nora Sommer', own: '0.00', premium: "1'950.00" },
    { name: 'Lio Sommer', own: '0.00', premium: '480.00' },
    { name: 'Ida Sommer', own: '0.00', premium: '480.00' },
    { name: 'Mats Sommer', own: '0.00', premium: '480.00' },
  ]),
  kitaLio: D.kita({ child: 'Lio', provider: 'Kindergarten Musterdorf', monthly: 100, from: '01.01.2025' }),
  kitaIda: D.kita({ child: 'Ida', provider: 'Kita Sonnenschein', monthly: 300, from: '01.01.2025' }),
  kitaMats: D.kita({ child: 'Mats', provider: 'Kita Sonnenschein', monthly: 350, from: '01.01.2025' }),
  dentist: D.dentist,
  cosmetic: D.cosmetic,
  donation: D.donation,
}
const SOMMER_CHILDREN = [
  { firstName: 'Lio', birthDate: '03.04.2019', taxId: '31000015838', care: { amount: 1200, from: '01.01.2025', to: '31.12.2025', provider: 'Kindergarten Musterdorf' } },
  { firstName: 'Ida', birthDate: '21.08.2021', taxId: '31000023757', care: { amount: 3600, from: '01.01.2025', to: '31.12.2025', provider: 'Kita Sonnenschein' } },
  { firstName: 'Mats', birthDate: '09.02.2023', taxId: '31000031676', care: { amount: 4200, from: '01.01.2025', to: '31.12.2025', provider: 'Kita Sonnenschein' } },
].map((c) => ({ ...c, lastName: 'Sommer', kinship: '1', kinshipB: '1', office: 'Familienkasse Baden-Württemberg West', domestic: true, registered: true, benefitToMe: true, healthAbroad: 511 }))
const sommerWay = (km1, km2, place) => ({
  vacationDays: 30, sickDays: 3, homeOfficeDays: 0, region: 'BW', oneWayKm: km1, transport: 'pkw', workplace: '79999 Musterdorf, Werkstrasse 1',
  change: { until: '30.06.2025', from: '01.07.2025', oneWayKm: km2, transport: 'pkw', workplace: place },
})
const sommer = {
  id: 'sommer',
  title: '#25 Familie Sommer — beide Jobwechsel DE→CH zum 01.07., drei Kinder mit Kita, Zahnarzt, Schönheits-OP',
  onboarding: { firstName: 'Elias', lastName: 'Sommer', taxId: '31000000000' },
  async strom(page, { note }) {
    await startStrom(page)
    await answerBasis(page, { job: 'Angestellt', ausland: 'Ja, in die Schweiz', kinder: '2 oder mehr', familienstand: 'Verheiratet', 'partner-job': 'Angestellt', 'partner-ausland': 'Ja, in die Schweiz' })
    await waitForStromStep(page, 'schweiz')
    // The documents' figures, typed into the masks (the masks read no documents; only the chat does).
    await swissMask(page, {
      nonReturnDays: 0,
      fields: { lohn: 54000, 'bruttolohn-total': 54000, 'ahv-beitraege': 3456, 'berufliche-vorsorge': 2700, nettolohn: 47844, quellensteuer: 2430 },
      annualRate: true, rate: '1,065',
      provision: { krankenkasseChf: 2100 },
      nGre: { arbeitgeberName: 'Rheinbrücke AG', arbeitgeberStrasse: 'Rheinweg 2', arbeitgeberPlzOrt: '4058 Basel', familienzulagenChf: 0, krankentaggeldChf: 0, pkArbeitnehmerChf: 2100, pkArbeitgeberGesamtChf: 2700, pkArbeitgeberChf: 2100, krankentaggeldArbeitgeberProzent: 100, krankentaggeldArbeitgeberChf: 182, nbuvArbeitgeberProzent: 100, nbuvArbeitgeberChf: 215 },
    })
    await waitForStromStep(page, 'arbeitsweg')
    await commuteMask(page, sommerWay(18, 32, '4058 Basel, Rheinweg 2'))
    await waitForStromStep(page, 'lohnsteuerbescheinigung')
    await lstbMask(page, { gross: 36000, wageTax: 6210, social: 3348 + 2952 + 540 + 468 })
    await waitForStromStep(page, 'kinder')
    for (const child of SOMMER_CHILDREN) await childMask(page, child)
    await click(page, 'kinder-weiter')
    await chooseTopics(page, ['gesundheit-gate', 'spenden'])
    // 1.700 € dentist + 300 CHF self-borne at 1,065 (what scenario 25 expects in the field); never the 3.800 € operation.
    await fillTopic(page, 'krankheitskosten', { 'gesundheit-betrag': 1700 + Math.round(300 * 1.065), 'gesundheit-erstattung': 0 })
    await fillTopic(page, 'spenden', { 'spenden-betrag': 300 })
    await waitForStromStep(page, 'fertig')
    await leaveStrom(page)
    await masterData(page, { birthDate: '12.03.1987', street: 'Lindenweg', houseNumber: '4', postalCode: '79539', city: 'Lörrach', maritalStatus: 'verheiratet', religion: 'VD', taxOffice: 'Lörrach', iban: IBAN }, { firstName: 'Nora', lastName: 'Sommer', taxId: '31000007919', birthDate: '30.11.1989', occupation: 'Pflegefachfrau', religion: 'VD' })
    await fromCockpit(page, 'partner-schweiz')
    await swissMask(page, {
      nonReturnDays: 0,
      fields: { lohn: 31200, 'bruttolohn-total': 31200, 'ahv-beitraege': 1997, 'berufliche-vorsorge': 1450, nettolohn: 27753, quellensteuer: 1404 },
      annualRate: true, rate: '1,065',
      provision: { krankenkasseChf: 1950 },
      nGre: { arbeitgeberName: 'Klinik Basel AG', arbeitgeberStrasse: 'Spitalstrasse 9', arbeitgeberPlzOrt: '4056 Basel', familienzulagenChf: 0, krankentaggeldChf: 0, pkArbeitnehmerChf: 1100, pkArbeitgeberGesamtChf: 1450, pkArbeitgeberChf: 1100, krankentaggeldArbeitgeberProzent: 100, krankentaggeldArbeitgeberChf: 104, nbuvArbeitgeberProzent: 100, nbuvArbeitgeberChf: 122 },
    })
    await fromCockpit(page, 'partner-arbeitsweg')
    await commuteMask(page, sommerWay(9, 27, '4056 Basel, Spitalstrasse 9'))
    // B's German certificate: the cockpit offers a partner LStB only while B is not a Grenzgänger, even
    // with a change of job recorded (CockpitPartnerSection germanCertificate); noted when it is missing.
    await cockpitSettled(page)
    if (await page.locator(tid('partner-lstb')).count()) {
      await click(page, 'partner-lstb')
      await lstbMask(page, { gross: 21000, wageTax: 2150, social: 1953 + 1722 + 315 + 273 })
      await cockpitSettled(page)
    } else note('Sommer: no partner-lstb tile for Person B (Grenzgängerin with a German job until 30.06.) — B’s LStB cannot be entered in the Strom or cockpit')
  },
  chat: {
    turns: [
      'Hallo! Ich möchte unsere gemeinsame Steuererklärung 2025 machen. Ich bin Elias Sommer, geboren am 12.03.1987, Steuer-ID 31000000000. Ich bin verheiratet mit Nora Sommer, geboren am 30.11.1989, Steuer-ID 31000007919, sie ist Pflegefachfrau. Wir wollen zusammen veranlagt werden.',
      'Wir wohnen im Lindenweg 4, 79539 Lörrach. Unser Finanzamt ist Lörrach, IBAN DE89370400440532013000. Wir sind beide konfessionslos und willigen ein, dass ihr das speichert.',
      'Wir haben drei Kinder, alle unsere leiblichen: Lio, geboren am 03.04.2019, Steuer-ID 31000015838; Ida, geboren am 21.08.2021, Steuer-ID 31000023757; Mats, geboren am 09.02.2023, Steuer-ID 31000031676. Alle wohnen bei uns in Deutschland und sind bei uns gemeldet, das Kindergeld kommt von der Familienkasse Baden-Württemberg West.',
      'Zu den Jobs: Wir waren beide bis zum 30.06.2025 bei deutschen Arbeitgebern angestellt und arbeiten seit dem 01.07.2025 beide als Grenzgänger in der Schweiz. Wir wohnen in Deutschland und fahren jeden Tag zurück, also 0 Nichtrückkehrtage.',
      { upload: [{ name: 'lstb-elias.pdf', text: SOMMER_DOCS.lstbElias, kind: 'lstb' }, { name: 'lstb-nora.pdf', text: SOMMER_DOCS.lstbNora, kind: 'lstb' }, { name: 'lohnausweis-elias.pdf', text: SOMMER_DOCS.chElias }, { name: 'lohnausweis-nora.pdf', text: SOMMER_DOCS.chNora }] },
      'Ich habe gerade unsere beiden Lohnsteuerbescheinigungen und die beiden Schweizer Lohnausweise hochgeladen. Mein Schweizer Arbeitgeber ist die Rheinbrücke AG, Rheinweg 2, 4058 Basel; Noras ist die Klinik Basel AG, Spitalstrasse 9, 4056 Basel. Familienzulagen bekommen wir dort keine, Sonderfälle gibt es keine, Krankentaggeld und Nichtberufsunfall zahlt jeweils der Arbeitgeber ganz. Als Kurs nehmen wir den Jahresdurchschnitt.',
      { upload: [{ name: 'pk-elias.pdf', text: SOMMER_DOCS.pkElias }, { name: 'pk-nora.pdf', text: SOMMER_DOCS.pkNora }, { name: 'praemien-elias.pdf', text: SOMMER_DOCS.premiumElias }, { name: 'praemien-nora.pdf', text: SOMMER_DOCS.premiumNora }, { name: 'krankenkasse.pdf', text: SOMMER_DOCS.health }] },
      'Mein Arbeitsweg: bis 30.06. mit dem Auto 18 km einfach nach 79999 Musterdorf, Werkstrasse 1, ab 01.07. mit dem Auto 32 km nach 4058 Basel, Rheinweg 2. Fünf-Tage-Woche, 30 Urlaubstage, 3 Krankheitstage, kein Homeoffice.',
      'Nora fuhr bis 30.06. mit dem Auto 9 km nach 79999 Musterdorf, Werkstrasse 1, und fährt seit 01.07. mit dem Auto 27 km nach 4056 Basel, Spitalstrasse 9. Auch Fünf-Tage-Woche, 30 Urlaubstage, 3 Krankheitstage, kein Homeoffice.',
      { upload: [{ name: 'kita-lio.pdf', text: SOMMER_DOCS.kitaLio }, { name: 'kita-ida.pdf', text: SOMMER_DOCS.kitaIda }, { name: 'kita-mats.pdf', text: SOMMER_DOCS.kitaMats }, { name: 'zahnarzt.pdf', text: SOMMER_DOCS.dentist }, { name: 'klinik.pdf', text: SOMMER_DOCS.cosmetic }, { name: 'spende.pdf', text: SOMMER_DOCS.donation }] },
      'Jetzt habe ich noch die Kita-Bescheinigungen der drei Kinder, die Zahnarztrechnung, die Rechnung der Klinik und die Spendenquittung hochgeladen.',
    ],
    facts: [
      { when: ['urlaub', 'krank'], say: 'Wir beide: 30 Urlaubstage, 3 Krankheitstage, kein Homeoffice, Fünf-Tage-Woche.' },
      { when: ['kurs', 'wechselkurs'], say: 'Für beide bitte den Jahresdurchschnittskurs 2025.' },
      { when: ['nichtrückkehr', 'wohnsitz'], say: 'Wir wohnen beide in Deutschland und hatten 0 Nichtrückkehrtage.' },
      { when: ['kindergeld', 'familienkasse'], say: 'Kindergeld für alle drei von der Familienkasse Baden-Württemberg West, Schweizer Kinderzulagen bekommen wir keine.' },
      { when: ['betreuung', 'kita', 'kindergarten'], say: 'Lio: Kindergarten Musterdorf 100 €/Monat, Ida: Kita Sonnenschein 300 €/Monat, Mats: Kita Sonnenschein 350 €/Monat, jeweils ganzjährig 2025.' },
      { when: ['schönheits', 'lidstraffung', 'kosmetisch'], say: 'Die Lidstraffung war rein ästhetisch, ohne medizinische Indikation.' },
      { when: ['krankenversicherung der kinder', 'prämie', 'krankenkasse'], say: 'Die Grundversicherungsprämien laut Zusammenstellung: Elias 2.100 CHF, Nora 1.950 CHF, jedes Kind 480 CHF; selbst getragen hat nur Elias 300 CHF.' },
      { when: ['handwerker', 'haushaltsnah', 'riester'], say: 'Handwerker, haushaltsnahe Dienste oder Riester hatten wir nicht.' },
    ],
  },
  expected: {
    ...person({ firstName: 'Elias', lastName: 'Sommer', taxId: '31000000000' }),
    ...master({ birthDate: '12.03.1987', street: 'Lindenweg', houseNumber: '4', postalCode: '79539', city: 'Lörrach', maritalStatus: 'verheiratet', religion: 'VD', taxOffice: 'Lörrach', iban: IBAN }),
    ...partnerB({ firstName: 'Nora', lastName: 'Sommer', taxId: '31000007919', birthDate: '30.11.1989', occupation: 'Pflegefachfrau', religion: 'VD' }),
    ...basis('A', { job: 'Angestellt', ausland: 'Ja, in die Schweiz', 'de-job': 'Nur in der Schweiz', kinder: '2 oder mehr', familienstand: 'Verheiratet', 'partner-job': 'Angestellt', 'partner-ausland': 'Ja, in die Schweiz', 'partner-de-job': 'Nur in der Schweiz', 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': 0, 'gesundheit-gate': 'Ja', 'gesundheit-betrag': 2020, spenden: 'Ja', 'spenden-betrag': 300 }),
    ...lstbOf('A', 36000, 6210, 7308), ...lstbOf('B', 21000, 2150, 4263),
    ...swissOf('A', { lohn: 54000, 'bruttolohn-total': 54000, 'ahv-beitraege': 3456, 'berufliche-vorsorge': 2700, nettolohn: 47844, quellensteuer: 2430 }, { arbeitgeberName: 'Rheinbrücke AG', arbeitgeberStrasse: 'Rheinweg 2', arbeitgeberPlzOrt: '4058 Basel', familienzulagenChf: 0, pkArbeitnehmerChf: 2100, pkArbeitgeberChf: 2100, pkArbeitgeberGesamtChf: 2700, krankentaggeldArbeitgeberProzent: 100, nbuvArbeitgeberProzent: 100 }, { 'chLohnausweisA.items[ch-krankenkasse].amountChf': 2100 }),
    ...swissOf('B', { lohn: 31200, 'bruttolohn-total': 31200, 'ahv-beitraege': 1997, 'berufliche-vorsorge': 1450, nettolohn: 27753, quellensteuer: 1404 }, { arbeitgeberName: 'Klinik Basel AG', arbeitgeberStrasse: 'Spitalstrasse 9', arbeitgeberPlzOrt: '4056 Basel', familienzulagenChf: 0, pkArbeitnehmerChf: 1100, pkArbeitgeberChf: 1100, pkArbeitgeberGesamtChf: 1450, krankentaggeldArbeitgeberProzent: 100, nbuvArbeitgeberProzent: 100 }, { 'chLohnausweisB.items[ch-krankenkasse].amountChf': 1950 }),
    ...Object.fromEntries(['A', 'B'].flatMap((who) => {
      const [km1, km2, place] = who === 'A' ? [18, 32, '4058 Basel, Rheinweg 2'] : [9, 27, '4056 Basel, Spitalstrasse 9']
      return Object.entries({ vacationDays: 30, sickDays: 3, homeOfficeDays: 0, oneWayKm: km1, transport: 'pkw', workplace: '79999 Musterdorf, Werkstrasse 1', periodTo: '30.06.2025', secondOneWayKm: km2, secondTransport: 'pkw', secondWorkplace: place, secondFrom: '01.07.2025' })
        .map(([k, v]) => [`arbeitsweg${who}.inputs.${k}`, v])
    })),
    // Children sorted by first name: Ida, Lio, Mats.
    ...[['Ida', '21.08.2021', '31000023757', 3600, 'Kita Sonnenschein'], ['Lio', '03.04.2019', '31000015838', 1200, 'Kindergarten Musterdorf'], ['Mats', '09.02.2023', '31000031676', 4200, 'Kita Sonnenschein']].reduce((acc, [firstName, geburtsdatum, taxId, care, provider], i) => ({
      ...acc,
      ...childOf(i, { firstName, lastName: 'Sommer', geburtsdatum, taxId, kinship: '1', kinshipB: '1', familyBenefitsOffice: 'Familienkasse Baden-Württemberg West', domesticResidenceAllYear: true, healthBasicEur: 511, childcareEur: care, childcareProvider: provider, childcareFrom: '01.01.2025', childcareTo: '31.12.2025' }),
    }), {}),
  },
  // Scenario 25 Row E: both German wage taxes and both Swiss withholding taxes at 1,065.
  expectedEstimate: { anrechnung: 6210 + 2150 + Math.round(2430 * 1.065) + Math.round(1404 * 1.065), jointAssessment: true },
}

// ---- 26 Familie Brandt ---------------------------------------------------------------------------
const BRANDT_SWISS = { lohn: 96000, 'bruttolohn-total': 96000, 'ahv-beitraege': 6144, 'berufliche-vorsorge': 4800, nettolohn: 96000 - 6144 - 4800, quellensteuer: 4320 }
const brandt = {
  id: 'brandt',
  title: '#26 Familie Brandt — Grenzgänger CH mit Kinderzulage, Ehefrau in Rente',
  // ergänzt: tax IDs and birth dates are not in scenario 26; invented alike for both paths.
  onboarding: { firstName: 'Jonas', lastName: 'Brandt', taxId: '31000039595' },
  async strom(page, { note }) {
    await startStrom(page)
    await answerBasis(page, { job: 'Angestellt', ausland: 'Ja, in die Schweiz', kinder: '2 oder mehr', familienstand: 'Verheiratet', 'partner-job': 'Rente' })
    await waitForStromStep(page, 'schweiz')
    await swissMask(page, {
      nonReturnDays: 0,
      fields: BRANDT_SWISS,
      annualRate: true, rate: '1,065',
      nGre: { arbeitgeberName: 'Beispiel AG', arbeitgeberStrasse: 'Rheinweg 2', arbeitgeberPlzOrt: '4058 Basel', familienzulagenChf: 5160, krankentaggeldChf: 0, pkArbeitnehmerChf: 4800, pkArbeitgeberChf: 4800, krankentaggeldArbeitgeberProzent: 100, nbuvArbeitgeberProzent: 100 },
    })
    await waitForStromStep(page, 'arbeitsweg')
    // Scenario 26 records no way to work; „Weiter“ goes on without one.
    await click(page, 'arbeitstage-weiter')
    await waitForStromStep(page, 'kinder')
    for (const [firstName, birthDate] of [['Paul', '02.05.2016'], ['Greta', '14.09.2019']]) {
      await childMask(page, { firstName, lastName: 'Brandt', birthDate, kinship: '1', kinshipB: '1', domestic: true, allowancePayer: 'a' }, note)
    }
    await click(page, 'kinder-weiter')
    await chooseTopics(page, [])
    await waitForStromStep(page, 'fertig')
    await leaveStrom(page)
    await masterData(page, { birthDate: '05.06.1982', street: 'Lindenweg', houseNumber: '9', postalCode: '79539', city: 'Lörrach', maritalStatus: 'verheiratet', religion: 'VD', taxOffice: 'Lörrach', iban: IBAN }, { firstName: 'Ute', lastName: 'Brandt', taxId: '31000047511', birthDate: '03.03.1958', religion: 'VD' })
    await fromCockpit(page, 'partner-rente')
    await page.locator('text=Gesetzliche Rente').click()
    const amount = page.getByLabel(/Jahresbetrag der Rente/i)
    await amount.fill('18000')
    await amount.blur()
    await page.waitForTimeout(400)
    const start = page.getByLabel(/Jahr des Rentenbeginns/i)
    await start.fill('2020')
    await start.blur()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Weiter', exact: true }).click().catch(() => click(page, 'rente-zurueck'))
    await cockpitSettled(page)
  },
  chat: {
    turns: [
      'Hallo! Ich möchte die gemeinsame Steuererklärung 2025 für meine Frau Ute und mich machen. Ich bin Jonas Brandt, geboren am 05.06.1982, Steuer-ID 31000039595. Wir sind verheiratet und wollen zusammen veranlagt werden. Wir wohnen im Lindenweg 9, 79539 Lörrach, Finanzamt Lörrach, IBAN DE89370400440532013000. Wir sind beide konfessionslos und willigen in die Speicherung ein.',
      'Ich arbeite als Grenzgänger in der Schweiz, wohne in Deutschland und fahre jeden Tag zurück, 0 Nichtrückkehrtage. Mein Lohnausweis 2025: Ziffer 1 Lohn 96.000 CHF, Ziffer 8 Bruttolohn total 96.000 CHF, Ziffer 9 AHV/IV/EO/ALV/NBUV 6.144 CHF, Ziffer 10 berufliche Vorsorge 4.800 CHF, Ziffer 11 Nettolohn 85.056 CHF, Ziffer 12 Quellensteuer 4.320 CHF.',
      'Arbeitgeber ist die Beispiel AG, Rheinweg 2, 4058 Basel. In meinem Lohn sind 5.160 CHF Familienzulagen (Kinderzulagen) enthalten. Pensionskasse obligatorisch: 4.800 CHF Arbeitnehmer und 4.800 CHF Arbeitgeber. Krankentaggeld und Nichtberufsunfall zahlt der Arbeitgeber ganz, Sonderfälle gibt es keine. Als Kurs nehmen wir den Jahresdurchschnitt.',
      'Meine Frau Ute Brandt, geboren am 03.03.1958, Steuer-ID 31000047511, ist Rentnerin: gesetzliche Altersrente 18.000 € im Jahr, Rentenbeginn 2020.',
      'Wir haben zwei Kinder, beide unsere leiblichen: Paul, geboren am 02.05.2016, und Greta, geboren am 14.09.2019. Beide leben bei uns in Deutschland. Die Schweizer Kinderzulagen für beide Kinder kommen über meinen Lohn.',
    ],
    facts: [
      { when: ['arbeitsweg', 'entfernung', 'kilometer', 'pendel'], say: 'Zum Arbeitsweg möchte ich nichts angeben.' },
      { when: ['kindergeld', 'familienkasse', 'differenz'], say: 'Deutsches Kindergeld beziehen wir nicht, nur die Schweizer Kinderzulagen über meinen Lohn.' },
      { when: ['krankenkasse', 'krankenversicherung', 'prämie'], say: 'Weitere Krankenversicherungsbeiträge habe ich nicht anzugeben.' },
      { when: ['handwerker', 'haushaltsnah', 'spenden', 'riester', 'krankheitskosten'], say: 'Handwerker, haushaltsnahe Dienste, Spenden, Riester oder Krankheitskosten hatten wir nicht.' },
    ],
  },
  expected: {
    ...person({ firstName: 'Jonas', lastName: 'Brandt', taxId: '31000039595' }),
    ...master({ birthDate: '05.06.1982', street: 'Lindenweg', houseNumber: '9', postalCode: '79539', city: 'Lörrach', maritalStatus: 'verheiratet', religion: 'VD', taxOffice: 'Lörrach', iban: IBAN }),
    ...partnerB({ firstName: 'Ute', lastName: 'Brandt', taxId: '31000047511', birthDate: '03.03.1958', religion: 'VD' }),
    ...basis('A', { job: 'Angestellt', ausland: 'Ja, in die Schweiz', 'de-job': 'Nur in der Schweiz', kinder: '2 oder mehr', familienstand: 'Verheiratet', 'partner-job': 'Rente', 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': 0 }),
    ...swissOf('A', BRANDT_SWISS, { arbeitgeberName: 'Beispiel AG', arbeitgeberStrasse: 'Rheinweg 2', arbeitgeberPlzOrt: '4058 Basel', familienzulagenChf: 5160, pkArbeitnehmerChf: 4800, pkArbeitgeberChf: 4800, krankentaggeldArbeitgeberProzent: 100, nbuvArbeitgeberProzent: 100 }),
    'renteB.kind': 'GesetzlicheRente', 'renteB.jahresbetrag': 18000, 'renteB.rentenbeginnJahr': 2020,
    // Sorted by first name: Greta, Paul. Both allowances come with Jonas's wage (5.160 CHF at 1,065 = 5.495 €).
    ...childOf(0, { firstName: 'Greta', lastName: 'Brandt', geburtsdatum: '14.09.2019', kinship: '1', kinshipB: '1', domesticResidenceAllYear: true, swissFamilyAllowancePayer: 'A' }),
    ...childOf(1, { firstName: 'Paul', lastName: 'Brandt', geburtsdatum: '02.05.2016', kinship: '1', kinshipB: '1', domesticResidenceAllYear: true, swissFamilyAllowancePayer: 'A' }),
  },
}

export const HOUSEHOLDS = [lena, weber, meyer, richter, allesgeber, sommer, brandt]
