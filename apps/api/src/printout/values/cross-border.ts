// Anlage N-Gre: the Swiss wage of a Grenzgänger from the Lohnausweis, one form per commuting spouse.
import { annexNGreAmounts, type NGreRow } from '@steuereule/core'
import type { ChSalaryCertificateFacts, CommuteFacts, PrintoutFacts } from './facts.js'
import { addLifeSituationWorkExpenses } from './life-situations.js'
import { germanWages, integer, jointPersonB, optionalNumber, type Fields, type Section } from './section.js'
import { addOtherWorkExpense, commuteValues, waysInNGre } from './work-expenses.js'

/**
 * Who pays a premium must be stated once the employee pays some of it (otherwise Z. 18/19 and 95–98
 * cannot be filled); an employer paying everything also has to give its CHF amount.
 */
function premiumClarified(employeeChf: number | null, percent: string | null, employerChf: string | null): boolean {
  const share = integer(percent)
  if (share === null) return employeeChf === 0
  return share < 100 || integer(employerChf) !== null
}

function nbuvEmployeeChf(ch: ChSalaryCertificateFacts): number | null {
  const ahv = integer(ch.ahvContributionsChf)
  const gross = integer(ch.grossWageChf)
  const allowances = integer(ch.familienzulagenChf)
  if (ahv === null || gross === null || allowances === null || ch.rate === null) return null
  return annexNGreAmounts({
    grossWageChf: gross,
    familienzulagenChf: allowances,
    ahvContributionsChf: ahv,
    withholdingTaxChf: 0,
    krankentaggeldChf: 0,
    pkArbeitnehmerChf: 0,
    pkArbeitgeberChf: 0,
    steuerfreiesKrankentaggeldChf: optionalNumber(ch.steuerfreiesKrankentaggeldChf),
    steuerfreiesUnfalltaggeldChf: optionalNumber(ch.steuerfreiesUnfalltaggeldChf),
    nbuvArbeitgeberProzent: optionalNumber(ch.nbuvArbeitgeberProzent),
    rate: ch.rate,
  }).split.nbuv.employeeChf
}

/** Whether the employer is stated on the form's address lines: the paper needs it, the amounts do not. */
const employerAddressGiven = (ch: ChSalaryCertificateFacts): boolean => Boolean(ch.arbeitgeberName && ch.arbeitgeberStrasse && ch.arbeitgeberPlzOrt)

/**
 * What keeps the form's amounts from being computed. The employer address is deliberately not part of
 * it: a missing address still blocks the paper printout (see `nGreValues`), but it must not blank the
 * amounts the form view and `vordruck_zeilen` show (real-data run).
 */
function nGreAmountsGap(ch: ChSalaryCertificateFacts): string | null {
  if (ch.status === 'kein-grenzgaenger') return 'anlageNGreKeinGrenzgaenger'
  if (ch.specialCases) return 'anlageNGreSonderfall'
  const amounts = [ch.grossWageChf, ch.ahvContributionsChf, ch.withholdingTaxChf, ch.familienzulagenChf, ch.krankentaggeldChf, ch.pkArbeitnehmerChf, ch.pkArbeitgeberChf]
  const complete =
    ch.status !== null &&
    ch.specialCases === false &&
    ch.rate !== null &&
    amounts.every((value) => integer(value) !== null) &&
    premiumClarified(integer(ch.krankentaggeldChf), ch.krankentaggeldArbeitgeberProzent, ch.krankentaggeldArbeitgeberChf) &&
    premiumClarified(nbuvEmployeeChf(ch), ch.nbuvArbeitgeberProzent, ch.nbuvArbeitgeberChf)
  return complete ? null : 'grenzgaenger'
}

interface NGreResult {
  /** Empty only while the amounts cannot be computed; with just the address missing they are all there. */
  readonly values: Fields
  readonly gap: string | null
  /** The daily accident benefit of Zeile 10 in EUR: also declared for the progression clause (Hauptvordruck Zeile 36). */
  readonly accidentBenefitEur?: number
}

/** One Anlage N-Gre for Person A or B, or null when that person has no Swiss wage. */
export function nGreValues(
  ch: ChSalaryCertificateFacts | null | undefined,
  commute: CommuteFacts | null | undefined,
  hasGermanWage: boolean,
  role: 'A' | 'B',
  header: { name: string | null; firstName: string | null; beruf: string | null; steuernummer: string | null },
): NGreResult | null {
  if (!ch || ch.grossWageChf === null) return null
  const amountsGap = nGreAmountsGap(ch)
  // A missing employer address still keeps the paper printout back, but the amounts are shown.
  const gap = amountsGap ?? (employerAddressGiven(ch) ? null : 'grenzgaenger')
  const gapFor = (code: string) => (role === 'B' && code === 'grenzgaenger' ? 'grenzgaengerPersonB' : code)
  if (amountsGap) return { values: {}, gap: gapFor(amountsGap) }
  const values: Fields = {}
  const set = (id: string, value: string | null) => {
    if (value) values[id] = value
  }
  values[role === 'A' ? 'anlNGre.personA' : 'anlNGre.personB'] = true
  set('anlNGre.name', header.name)
  set('anlNGre.vorname', header.firstName)
  set('anlNGre.steuernummer', header.steuernummer)
  values['anlNGre.kz117'] = '3'
  set('anlNGre.beruf', header.beruf)
  const { chf, eur, split, nbuvWorkExpenses } = annexNGreAmounts({
    grossWageChf: Number(ch.grossWageChf),
    familienzulagenChf: Number(ch.familienzulagenChf),
    ahvContributionsChf: Number(ch.ahvContributionsChf),
    withholdingTaxChf: Number(ch.withholdingTaxChf),
    krankentaggeldChf: Number(ch.krankentaggeldChf),
    pkArbeitnehmerChf: Number(ch.pkArbeitnehmerChf),
    pkArbeitgeberChf: Number(ch.pkArbeitgeberChf),
    pkArbeitnehmerGesamtChf: optionalNumber(ch.pkArbeitnehmerGesamtChf),
    pkArbeitgeberGesamtChf: optionalNumber(ch.pkArbeitgeberGesamtChf),
    steuerfreiesKrankentaggeldChf: optionalNumber(ch.steuerfreiesKrankentaggeldChf),
    steuerfreiesUnfalltaggeldChf: optionalNumber(ch.steuerfreiesUnfalltaggeldChf),
    rate: ch.rate!,
    krankentaggeldArbeitgeberProzent: optionalNumber(ch.krankentaggeldArbeitgeberProzent),
    krankentaggeldArbeitgeberChf: optionalNumber(ch.krankentaggeldArbeitgeberChf),
    nbuvArbeitgeberProzent: optionalNumber(ch.nbuvArbeitgeberProzent),
    nbuvArbeitgeberChf: optionalNumber(ch.nbuvArbeitgeberChf),
  })
  for (const row of Object.keys(chf) as NGreRow[]) {
    // Z. 9, 10 and 18–20 only apply when there is such an amount; an empty line stays empty.
    if ((row === 'z9' || row === 'z10' || row === 'z18' || row === 'z19' || row === 'z20') && chf[row] === 0) continue
    values[`anlNGre.${row}Chf`] = String(chf[row])
    values[`anlNGre.${row}Eur`] = String(eur[row])
  }
  for (const [rows, teil] of [
    [['z95', 'z96'], split.dailySicknessAllowance],
    [['z97', 'z98'], split.nbuv],
  ] as const) {
    if (teil.employerChf + teil.employeeChf === 0) continue
    values[`anlNGre.${rows[0]}Arbeitgeber`] = String(teil.employerPercent)
    values[`anlNGre.${rows[0]}Arbeitnehmer`] = String(teil.employeePercent)
    values[`anlNGre.${rows[1]}Arbeitgeber`] = String(teil.employerChf)
    values[`anlNGre.${rows[1]}Arbeitnehmer`] = String(teil.employeeChf)
  }
  Object.assign(values, commuteValues(commute, 'anlNGre', waysInNGre(commute, hasGermanWage)))
  addOtherWorkExpense(values, 'anlNGre', '50 % der Beiträge zur Nichtberufsunfallversicherung', nbuvWorkExpenses.eur)
  set('anlNGre.arbeitgeberName', ch.arbeitgeberName)
  set('anlNGre.arbeitgeberStrasse', ch.arbeitgeberStrasse)
  set('anlNGre.arbeitgeberPlzOrt', ch.arbeitgeberPlzOrt)
  return { values, gap: gap && gapFor(gap), accidentBenefitEur: eur.z10 }
}

const hasAmounts = (n: NGreResult): boolean => Object.keys(n.values).length > 0

/** The N-Gre section, plus each person's daily accident benefit for the Hauptvordruck (Zeile 36). */
export interface CrossBorderSection extends Section {
  readonly accidentBenefitEur: { readonly A: number | undefined; readonly B: number | undefined }
}

/**
 * One Anlage N-Gre per Grenzgänger: Person A's alone goes onto the main set, otherwise each is an instance.
 * Without a German employer the work expenses of the life situations go into the person's N-Gre.
 */
export function crossBorderSection(facts: PrintoutFacts): CrossBorderSection {
  const { profile } = facts
  const personB = jointPersonB(facts)
  const wages = germanWages(facts)
  const nGreA = nGreValues(facts.chSalaryCertificate, facts.commute, wages.a !== null, 'A', {
    name: profile.lastName,
    firstName: profile.firstName,
    beruf: facts.masterData?.beruf ?? null,
    steuernummer: profile.steuernummer,
  })
  const nGreB = nGreValues(personB?.chSalaryCertificate, personB?.commute, wages.b !== null, 'B', {
    name: personB?.lastName ?? null,
    firstName: personB?.firstName ?? null,
    beruf: personB?.beruf ?? null,
    steuernummer: profile.steuernummer,
  })
  if (nGreA && hasAmounts(nGreA) && wages.a === null) addLifeSituationWorkExpenses(nGreA.values, 'anlNGre', facts.lifeSituations)
  if (nGreB && hasAmounts(nGreB) && wages.b === null) addLifeSituationWorkExpenses(nGreB.values, 'anlNGre', personB?.lifeSituations)
  const missing = [nGreA, nGreB].flatMap((n) => (n?.gap ? [n.gap] : []))
  const accidentBenefitEur = { A: nGreA?.accidentBenefitEur, B: nGreB?.accidentBenefitEur }
  const complete = [nGreA, nGreB].filter((n): n is NGreResult => n !== null && hasAmounts(n)).map((n) => n.values)
  if (complete.length === 1 && nGreA !== null && hasAmounts(nGreA)) return { values: complete[0]!, missing, accidentBenefitEur }
  if (complete.length > 0) return { instances: { 'anlage-n-gre': complete }, missing, accidentBenefitEur }
  return { missing, accidentBenefitEur }
}
