// Dev-only seed for the Steuer-Verlauf (ADR-0098): gives an EXISTING account the household of the mock
// (docs/mocks/steuer-verlauf.html), so the Verlauf tab can be checked against it in the browser.
//
//   DATABASE_URL=postgresql://… pnpm --filter @steuereule/api seed:year-history you@example.com [--luecke]
//
// `--luecke` leaves 2022 out, so on a fresh account it is a gap year of the Festsetzungsfrist that asks
// „Schon abgegeben?“ (ADR-0099 §1). It only skips writing; rows of an earlier run stay as they are.
//
// Run it with the same PRISMA_FIELD_ENCRYPTION_KEY as the API (none in local dev), or the API cannot
// read what it writes. It refuses with NODE_ENV=production. Re-running is safe: every row is an upsert.
// Synthetic figures only, no real person's data (ADR-0003).
//
// The years: 2021 an Eckjahr from two uploaded Bescheide (two single returns, extern erledigt), 2022 two
// single returns with Bescheid, 2023–2025 joint, 2024 with the Bescheid cutting Person A's Homeoffice and
// Arbeitsmittel (Einspruchsfrist running), 2025 submitted without a Bescheid, 2026 open without LStB.
// Person B is kept by the account (shadow `spouse_<userId>_<year>`, ADR-0054), as the app keeps a spouse
// without an own account. The declared and assessed figures are computed with the core's tariff.
//
// ADR-0099 adds what every idea of docs/mocks/steuer-verlauf-ideen.html needs: employer names on the
// LStB (a new employer 2025) and a Swiss Lohnausweis for Person A at the end of 2024 (Grenzgänger, new
// employer); the move 2023; a child born 2025 with Kita and health insurance; the Homeoffice cut in 2023
// and 2024 (Wiederholt gekürzt); a Nachzahlung 2021; Spenden, Handwerker and Kontoführung in 2024 for the
// checklist of 2026; a rented flat bought 01.04.2023 with repairs; capital income; and an Einspruch on the
// 2022 Bescheid of Person A, partly granted. No pension: this household has none (tests cover it). The
// Bescheid PDFs themselves are not seeded (a receipt needs its encrypted file); upload one to see it in
// „Unterlagen“.
import { PrismaClient } from '@prisma/client'
import { fieldEncryptionExtension } from 'prisma-field-encryption'
import { employeeLumpSum, splittingTariff, incomeTax, type AssessmentPositionValues } from '@steuereule/core'
import { publishEmailHashSalt, resolveFieldEncryptionKey } from '../src/prisma/field-encryption-key.js'

if (process.env.NODE_ENV === 'production') {
  console.error('seed-year-history is a dev seed and refuses to run with NODE_ENV=production.')
  process.exit(1)
}
const email: string = process.argv[2] ?? ''
const withGap = process.argv.includes('--luecke')
if (email === '') {
  console.error('Usage: tsx prisma/seed-year-history.ts <email of an existing account> [--luecke]')
  process.exit(1)
}

const basePrisma = new PrismaClient()
// The account is found by its e-mail hash (ADR-0109); the extension reads the salt when it is created.
publishEmailHashSalt()
const { encryptionKey, decryptionKeys } = resolveFieldEncryptionKey()
const prisma = basePrisma.$extends(fieldEncryptionExtension({ encryptionKey, decryptionKeys }))

type Parts = { fahrtweg: number; homeoffice: number; arbeitsmittel: number; sonstige: number }
type Person = { brutto: number; lst: number; sv: number; wk: Parts }

// The mock's figures (JAHRE).
const YEARS: Record<2022 | 2023 | 2024 | 2025, { filingType: 'einzel' | 'zusammen'; A: Person; B: Person }> = {
  2022: {
    filingType: 'einzel',
    A: { brutto: 48_200, lst: 7_457, sv: 9_880, wk: { fahrtweg: 1_540, homeoffice: 600, arbeitsmittel: 240, sonstige: 0 } },
    B: { brutto: 36_400, lst: 4_444, sv: 7_460, wk: { fahrtweg: 980, homeoffice: 0, arbeitsmittel: 120, sonstige: 0 } },
  },
  2023: {
    filingType: 'zusammen',
    A: { brutto: 51_600, lst: 8_014, sv: 10_630, wk: { fahrtweg: 680, homeoffice: 300, arbeitsmittel: 140, sonstige: 0 } },
    B: { brutto: 38_100, lst: 4_586, sv: 7_850, wk: { fahrtweg: 1_020, homeoffice: 420, arbeitsmittel: 90, sonstige: 0 } },
  },
  2024: {
    filingType: 'zusammen',
    A: { brutto: 54_900, lst: 8_489, sv: 11_420, wk: { fahrtweg: 1_320, homeoffice: 1_260, arbeitsmittel: 380, sonstige: 0 } },
    B: { brutto: 39_000, lst: 4_490, sv: 8_110, wk: { fahrtweg: 1_050, homeoffice: 720, arbeitsmittel: 160, sonstige: 0 } },
  },
  2025: {
    filingType: 'zusammen',
    A: { brutto: 58_300, lst: 9_205, sv: 12_300, wk: { fahrtweg: 1_380, homeoffice: 1_260, arbeitsmittel: 520, sonstige: 250 } },
    B: { brutto: 41_200, lst: 4_861, sv: 8_690, wk: { fahrtweg: 1_080, homeoffice: 840, arbeitsmittel: 210, sonstige: 0 } },
  },
}
// 2024: the Finanzamt recognised 180 instead of 210 Homeoffice days and half the phone.
const CUT_2024: Partial<Parts> = { homeoffice: 1_080, arbeitsmittel: 260 }
// 2023: the Homeoffice was cut already, 20 instead of 50 days: the second cut makes the pattern (ADR-0099 §5).
const CUT_2023: Partial<Parts> = { homeoffice: 120 }
const EXPLANATIONS_2023 = 'Die Tätigkeit in der häuslichen Wohnung wurde an 20 statt 50 Tagen berücksichtigt.'
// The employers on the certificates (ADR-0099 §8): Person A changes job in 2025.
const EMPLOYER_A: Record<number, string> = { 2022: 'Muster Maschinenbau GmbH', 2023: 'Muster Maschinenbau GmbH', 2024: 'Muster Maschinenbau GmbH', 2025: 'Nordlicht Software GmbH' }
const EMPLOYER_B = 'Stadtwerke Beispielstadt'
const EXPLANATIONS_2024 = [
  'Die Tätigkeit in der häuslichen Wohnung wurde an 180 statt 210 Tagen berücksichtigt.',
  'Aufwendungen für das Mobiltelefon wurden wegen privater Mitbenutzung zu 50 % anerkannt.',
].join('\n')

const sum = (p: Parts) => p.fahrtweg + p.homeoffice + p.arbeitsmittel + p.sonstige

/** The positions of a return as the core's tariff gives them (vorsorge as the share of SV the cap leaves). */
function returnOf(year: number, persons: readonly { column: 'A' | 'B'; person: Person }[], joint: boolean): AssessmentPositionValues {
  const lumpSum = employeeLumpSum(year) ?? 0
  const out: Record<string, number> = {}
  let income = 0
  let sv = 0
  let credit = 0
  for (const { column, person } of persons) {
    Object.assign(out, {
      [`bruttoarbeitslohn${column}`]: person.brutto,
      [`fahrtweg${column}`]: person.wk.fahrtweg,
      [`homeoffice${column}`]: person.wk.homeoffice,
      [`arbeitsmittel${column}`]: person.wk.arbeitsmittel,
      [`sonstigeWerbungskosten${column}`]: person.wk.sonstige,
      [`werbungskosten${column}`]: sum(person.wk),
    })
    income += person.brutto - Math.max(sum(person.wk), lumpSum)
    sv += person.sv
    credit += person.lst
  }
  const vorsorgeaufwand = Math.round(sv * 0.92)
  const sonderausgaben = joint ? 72 : 36
  const zvE = income - vorsorgeaufwand - sonderausgaben
  const tax = joint ? splittingTariff(zvE, 0, year) : incomeTax(zvE, year)
  return { ...out, vorsorgeaufwand, sonderausgaben, zuVersteuerndesEinkommen: zvE, festgesetzteSteuer: tax, solidaritaetszuschlag: 0, kirchensteuer: 0, anrechnung: credit, erstattung: credit - tax } as AssessmentPositionValues
}

const s = (v: number | undefined) => (v === undefined ? null : String(v))
const assessmentData = (p: AssessmentPositionValues) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, s(v)]))

async function main(): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error(`No account with the email "${email}" — sign up first, then seed.`)
  const userId = user.id
  const spouse = (year: number) => `spouse_${userId}_${year}`

  const taxYear = (year: number, status: string, openItems = 0) =>
    basePrisma.taxYear.upsert({
      where: { userId_taxYear: { userId, taxYear: year } },
      create: { userId, taxYear: year, baseEstimate: 0, openItems, openConflicts: 0, status },
      update: { status, openItems },
    })
  const link = (year: number, filingType: 'einzel' | 'zusammen') =>
    basePrisma.taxYearLink.upsert({
      where: { personAUserId_taxYear: { personAUserId: userId, taxYear: year } },
      create: { personAUserId: userId, personBUserId: spouse(year), taxYear: year, filingType },
      update: { personBUserId: spouse(year), filingType, invitationCode: null, invitationCodeValidUntil: null },
    })
  const lstb = (owner: string, year: number, p: Person) => {
    const data = { bruttoarbeitslohn: String(p.brutto), lohnsteuer: String(p.lst), sozialversicherung: String(p.sv), arbeitgeber: owner === userId ? (EMPLOYER_A[year] ?? null) : EMPLOYER_B }
    return prisma.lstb.upsert({
      where: { userId_taxYear: { userId: owner, taxYear: year } },
      create: { userId: owner, taxYear: year, ...data },
      update: data,
    })
  }
  const answers = async (owner: string, year: number, values: Record<string, string>) => {
    for (const [questionId, value] of Object.entries(values)) {
      await prisma.interviewAnswer.upsert({
        where: { userId_taxYear_questionId: { userId: owner, taxYear: year, questionId } },
        create: { userId: owner, taxYear: year, questionId, value },
        update: { value },
      })
    }
  }
  const version = (owner: string, year: number, filingType: string, submittedOn: string, positions: AssessmentPositionValues, estimate: { from: number; to: number } | null) =>
    prisma.filingVersion.upsert({
      where: { userId_taxYear_number: { userId: owner, taxYear: year, number: 1 } },
      create: { userId: owner, taxYear: year, number: 1, filingType, submittedOn, positions: JSON.stringify({ positions, estimateAtSubmission: estimate }) },
      update: { filingType, submittedOn, positions: JSON.stringify({ positions, estimateAtSubmission: estimate }) },
    })
  const assessment = (owner: string, year: number, date: string, p: AssessmentPositionValues, explanations: string | null = null) =>
    prisma.assessment.upsert({
      where: { userId_taxYear: { userId: owner, taxYear: year } },
      create: { userId: owner, taxYear: year, status: 'eingegangen', assessmentDate: date, erlaeuterungen: explanations, ...assessmentData(p) },
      update: { assessmentDate: date, erlaeuterungen: explanations, ...assessmentData(p) },
    })
  // 20 km by car on the given days: 0,30 € a km, so the Entfernungspauschale is 6 € a day.
  const commute = (owner: string, year: number, days: { travel: number | null; homeOffice: number }, workEquipmentEur: number, otherWorkExpensesEur: number, accountFeesEur: number | null = null) => {
    const data = {
      homeOfficeDays: days.homeOffice,
      oneWayKm: days.travel === null ? null : 20,
      transport: days.travel === null ? null : 'pkw',
      travelDays: days.travel,
      shortestRouteConfirmed: days.travel === null ? null : true,
      workEquipmentEur: String(workEquipmentEur),
      otherWorkExpensesEur: String(otherWorkExpensesEur),
      accountFeesEur: accountFeesEur === null ? null : String(accountFeesEur),
    }
    return prisma.commute.upsert({
      where: { userId_taxYear: { userId: owner, taxYear: year } },
      create: { userId: owner, taxYear: year, workdays: '1,2,3,4,5', ...data },
      update: data,
    })
  }
  const employed = (familienstand: string) => ({ job: 'Angestellt', familienstand, ausland: 'Nein', kinder: 'Nein' })

  // 2021 — the Eckjahr: two uploaded Bescheide, no declaration in the app, no LStB. Person B paid back
  // 1.580 €, so the household's year is a Nachzahlung (ADR-0099 §3).
  await taxYear(2021, 'extern-erledigt')
  await link(2021, 'einzel')
  await assessment(userId, 2021, '2022-06-14', { werbungskostenA: 1_850, festgesetzteSteuer: 6_410, erstattung: 280 })
  await assessment(spouse(2021), 2021, '2022-06-14', { werbungskostenA: 1_000, festgesetzteSteuer: 4_020, erstattung: -1_580 })

  // 2022 — two single returns, each assessed as declared; Person A lodged an Einspruch on 03.07.2023
  // over the Fahrtkosten, granted in part (+140 €, ADR-0099 §8).
  if (!withGap) {
    await taxYear(2022, 'bescheid')
    await link(2022, 'einzel')
    for (const [owner, person] of [[userId, YEARS[2022].A], [spouse(2022), YEARS[2022].B]] as const) {
      const filed = returnOf(2022, [{ column: 'A', person }], false)
      await lstb(owner, 2022, person)
      await version(owner, 2022, 'einzel', '2023-04-02', filed, null)
      await assessment(owner, 2022, '2023-06-07', filed)
    }
    await answers(userId, 2022, employed('Ledig'))
    await prisma.assessment.update({
      where: { userId_taxYear: { userId, taxYear: 2022 } },
      data: { status: 'einspruch-eingelegt', appealReason: 'betrag-falsch', appealDate: '2023-07-03', appealOutcome: 'teilweise', appealOutcomeAmount: '140' },
    })
  }

  // 2023 and 2024 — joint, assessed; 2024 with the cut.
  for (const year of [2023, 2024] as const) {
    const { A, B } = YEARS[year]
    const filed = returnOf(year, [{ column: 'A', person: A }, { column: 'B', person: B }], true)
    const cut = year === 2024 ? CUT_2024 : CUT_2023
    const assessed = returnOf(year, [{ column: 'A', person: { ...A, wk: { ...A.wk, ...cut } } }, { column: 'B', person: B }], true)
    // The Bescheid takes the declared provision as it was; only the cut moves zvE, tax and refund.
    await taxYear(year, 'bescheid')
    await link(year, 'zusammen')
    await lstb(userId, year, A)
    await lstb(spouse(year), year, B)
    await answers(userId, year, employed('Verheiratet'))
    // The last estimate before the Bescheid, as the mock shows it.
    await version(userId, year, 'zusammen', year === 2023 ? '2024-03-18' : '2026-09-21', filed, year === 2023 ? { from: 150, to: 420 } : { from: 700, to: 1_050 })
    await assessment(userId, year, year === 2023 ? '2024-05-22' : '2026-11-02', assessed, year === 2024 ? EXPLANATIONS_2024 : EXPLANATIONS_2023)
  }
  // 2023 — the move to the new flat (ADR-0099 §4). 2024 — what comes back in 2026: Spenden, Handwerker
  // and the Kontoführung (§2). Both years are assessed, so the answers do not move any estimate.
  await answers(userId, 2023, { umzug: 'Ja' })
  await answers(userId, 2024, { spenden: 'Ja', 'spenden-betrag': '3135', 'haushalt-gate': 'Ja', 'haushalt-handwerker-betrag': '640' })
  await commute(userId, 2024, { travel: YEARS[2024].A.wk.fahrtweg / 6, homeOffice: YEARS[2024].A.wk.homeoffice / 6 }, YEARS[2024].A.wk.arbeitsmittel, 0, 32)

  // End of 2024 Person A worked two months in Switzerland (Grenzgänger, a new employer, ADR-0099 §4, §7).
  await prisma.chSalaryCertificate.upsert({
    where: { userId_taxYear: { userId, taxYear: 2024 } },
    create: { userId, taxYear: 2024, grossWageTotal: '8000', quellensteuer: '400', arbeitgeberName: 'Grenz AG', exchangeRateMonth: '2024', exchangeRateValue: 1.045, exchangeRateMode: 'jahresdurchschnitt' },
    update: { grossWageTotal: '8000', quellensteuer: '400', arbeitgeberName: 'Grenz AG', exchangeRateMonth: '2024', exchangeRateValue: 1.045, exchangeRateMode: 'jahresdurchschnitt' },
  })

  // 2025 — joint, submitted, waiting for the Bescheid; it declares the 2024 cut positions again.
  {
    const { A, B } = YEARS[2025]
    const filed = returnOf(2025, [{ column: 'A', person: A }, { column: 'B', person: B }], true)
    await taxYear(2025, 'eingereicht')
    await link(2025, 'zusammen')
    await lstb(userId, 2025, A)
    await lstb(spouse(2025), 2025, B)
    await answers(userId, 2025, employed('Verheiratet'))
    await commute(userId, 2025, { travel: A.wk.fahrtweg / 6, homeOffice: A.wk.homeoffice / 6 }, A.wk.arbeitsmittel, A.wk.sonstige)
    await commute(spouse(2025), 2025, { travel: B.wk.fahrtweg / 6, homeOffice: B.wk.homeoffice / 6 }, B.wk.arbeitsmittel, 0)
    // What the core estimates for these facts (the Cockpit's range at submission).
    await version(userId, 2025, 'zusammen', '2026-10-12', filed, { from: 1_066, to: 1_196 })
  }

  // 2026 — open: answers and the Homeoffice days so far, no LStB yet.
  await taxYear(2026, 'entwurf', 2)
  await link(2026, 'zusammen')
  await answers(userId, 2026, employed('Verheiratet'))
  await commute(userId, 2026, { travel: null, homeOffice: 120 }, 0, 0, 32)

  // The child born 14.03.2025, with Kita and health insurance in 2025 and nothing entered for 2026 yet (§2, §4).
  const child = (year: number, extra: Record<string, string | null>) =>
    prisma.child.upsert({
      where: { id: `seed-kind-${userId}-${year}` },
      create: { id: `seed-kind-${userId}-${year}`, userId, taxYear: year, firstName: 'Mia', lastName: 'Muster', geburtsdatum: '2025-03-14', ...extra },
      update: extra,
    })
  await child(2025, { childcareEur: '591', healthBasicEur: '964' })
  await child(2026, {})

  // The rented flat bought 01.04.2023 (building 210.000 €, Baujahr 1995): one key over the years, repairs
  // in the three years after the purchase for the 15 % limit (ADR-0099 §7, §8).
  const RENT: Record<number, { rent: string; repairs: string | null }> = {
    2023: { rent: '7200', repairs: JSON.stringify([{ betrag: 8_000, datum: '2023-06-10' }]) },
    2024: { rent: '9600', repairs: JSON.stringify([{ betrag: 4_300, datum: null }]) },
    2025: { rent: '9600', repairs: null },
    2026: { rent: '9600', repairs: null },
  }
  for (const [year, { rent, repairs }] of Object.entries(RENT)) {
    const id = `seed-vermietung-${userId}-${year}`
    const data = {
      propertyKey: `seed-whg-${userId}`,
      mieteinnahmen: rent,
      anschaffungskosten: '210000',
      baujahr: '1995',
      werbungskosten: '2400',
      umlagen: '1800',
      schuldzinsen: '4100',
      strasse: 'Lindenweg',
      hausnummer: '4',
      anschaffungsdatum: '2023-04-01',
      erhaltungsaufwand: repairs,
    }
    await prisma.rentalProperty.upsert({ where: { id }, create: { id, userId, taxYear: Number(year), ...data }, update: data })
  }

  // Capital income above the Sparer-Pauschbetrag (ADR-0099 §7).
  for (const [year, income] of [[2024, '2682'], [2025, '2449']] as const) {
    const data = { kapitalertraege: income, sparerPauschbetrag: '2000' }
    await prisma.capital.upsert({ where: { userId_taxYear: { userId, taxYear: year } }, create: { userId, taxYear: year, ...data }, update: data })
  }

  console.log(`Seeded the Steuer-Verlauf household 2021–2026${withGap ? ' (2022 as a gap year)' : ''} for ${email} (user ${userId}).`)
}

main()
  .then(() => basePrisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error)
    await basePrisma.$disconnect()
    process.exit(1)
  })
