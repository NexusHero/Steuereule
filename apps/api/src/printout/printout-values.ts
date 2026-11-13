import {
  depreciationRatePercent,
  annexNGreAmounts,
  calculateDifferentialChildBenefit,
  formatGermanDate,
  type CrossBorderStatus,
  type NGreRow,
  mandatoryCapitalFields,
  type CapitalDepotClassification,
  type CapitalFieldId,
  type HealthInsurance,
} from '@steuereule/core'
import type { FieldValues } from './form-renderer.js'

export interface PersonBFacts {
  firstName: string | null
  lastName: string | null
  steuerId: string | null
  geburtsdatum: string | null
  religion?: string | null
  beruf?: string | null
  bruttoarbeitslohn?: string | null
  pension?: { rentenart: string | null; jahresbetrag: string | null } | null
  chSalaryCertificate?: ChSalaryCertificateFacts | null
  commute?: CommuteFacts | null
  healthInsurance?: readonly HealthInsurance[] | null
}

export interface LinkFacts {
  filingType: 'einzel' | 'zusammen'
  personB?: PersonBFacts | null
}

export interface ChildFacts {
  sequenceNumber?: string
  firstName: string | null
  lastName: string | null
  geburtsdatum: string | null
  taxId: string | null
  childBenefitClaimEur?: string | null
  swissFamilyAllowanceEur?: string | null
  kinship?: string | null
  kinshipB?: string | null
  familyBenefitsOffice?: string | null
  domesticResidenceAllYear?: boolean | null
  otherParent?: string | null
  otherParentName?: string | null
  otherParentBirthDate?: string | null
  otherParentAddress?: string | null
  otherParentKind?: string | null
  otherParentDiedOn?: string | null
  registeredWithMeAllYear?: boolean | null
  childBenefitToMeAllYear?: boolean | null
  healthBasicEur?: string | null
  /** Anlage Kind Zeile 67 (Kz 51): childcare, provider and period (ADR-0076). */
  childcareEur?: string | null
  childcareProvider?: string | null
  childcareFrom?: string | null
  childcareTo?: string | null
  careEur?: string | null
}

/** Anlage Kind Zeilen 47/48 — answered once per year in the interview. */
export interface SingleParentFacts {
  otherPerson: string | null
  householdCommunity: string | null
}

function needsOtherParent(k: ChildFacts, joint: boolean): boolean {
  return !joint || !k.kinshipB
}

function otherParentGap(k: ChildFacts): string | null {
  const known = Boolean(k.otherParentName && k.otherParentBirthDate && k.otherParentKind)
  switch (k.otherParent) {
    case 'Unbekannt':
      return null
    case 'Ausland':
      return 'anlageKindAndererElternteilAusland'
    case 'Inland':
      return known && k.otherParentAddress ? null : 'kinder'
    case 'Verstorben':
      return known && k.otherParentDiedOn ? null : 'kinder'
    default:
      return 'kinder'
  }
}

function childGap(k: ChildFacts, taxYear: number, joint: boolean): string | null {
  if (!k.taxId || !k.kinship || !k.familyBenefitsOffice || k.domesticResidenceAllYear == null) return 'kinder'
  if (!k.domesticResidenceAllYear) return 'anlageKindAusland'
  if (k.geburtsdatum && Number(k.geburtsdatum.slice(0, 4)) <= taxYear - 18) return 'anlageKindVolljaehrig'
  return needsOtherParent(k, joint) ? otherParentGap(k) : null
}

export interface RentalFacts {
  sequenceNumber?: string
  strasse: string | null
  plz: string | null
  city: string | null
  livingArea: string | null
  mieteinnahmen: string | null
  anschaffungskosten: string | null
  baujahr: string | null
  werbungskosten: string | null
  depreciationAsLastYear: boolean | null
  umlagen?: string | null
  schuldzinsen?: string | null
  einheiten?: string | null
  /** Person A's share in percent (Anlage V Z. 86); null in a joint return = half and half. */
  anteilA?: string | null
}

const integer = (value: string | null): number | null => (value !== null && /^\d+$/.test(value) ? Number(value) : null)

function rentalGap(obj: RentalFacts): string | null {
  const unclear = [obj.mieteinnahmen, obj.werbungskosten, obj.anschaffungskosten, obj.baujahr].includes('unklar')
  if (unclear || integer(obj.mieteinnahmen) === null || integer(obj.werbungskosten) === null) return 'vermietung'
  if (!obj.strasse || !obj.plz || !obj.city) return 'vermietung'
  if (rentalDepreciation(obj) === null) return null
  if (obj.depreciationAsLastYear === null) return 'vermietung'
  return obj.depreciationAsLastYear ? null : 'anlageVAfaNeu'
}

function rentalDepreciation(obj: RentalFacts): { rate: number; amount: number } | null {
  const costs = integer(obj.anschaffungskosten)
  const baujahr = integer(obj.baujahr)
  if (costs === null || baujahr === null) return null
  const rate = depreciationRatePercent(baujahr)
  return rate === null ? null : { rate, amount: Math.round((costs * rate) / 100) }
}

export type CapitalFacts = { depot: CapitalDepotClassification['kind']; inhaber?: 'A' | 'B' | 'gemeinsam' | null } & Partial<Record<CapitalFieldId, string | null>>

/** The Lohnausweis Ziffern and the N-Gre facts as stored, plus status and Kurs. */
export interface ChSalaryCertificateFacts {
  status: CrossBorderStatus | null
  rate: number | null
  grossWageChf: string | null
  ahvContributionsChf: string | null
  withholdingTaxChf: string | null
  arbeitgeberName: string | null
  arbeitgeberStrasse: string | null
  arbeitgeberPlzOrt: string | null
  familienzulagenChf: string | null
  krankentaggeldChf: string | null
  pkArbeitnehmerChf: string | null
  pkArbeitgeberChf: string | null
  /** Lohnausweis Ziffer 10: all employee pension contributions. */
  pkArbeitnehmerGesamtChf: string | null
  /** All employer pension contributions; above pkArbeitgeberChf = Zeile 20. */
  pkArbeitgeberGesamtChf: string | null
  /** Tax-free Krankentaggeld contained in Ziffer 8 (Zeilen 9/76). */
  steuerfreiesKrankentaggeldChf: string | null
  krankentaggeldArbeitgeberProzent: string | null
  krankentaggeldArbeitgeberChf: string | null
  nbuvArbeitgeberProzent: string | null
  nbuvArbeitgeberChf: string | null
  specialCases: boolean | null
}

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
    nbuvArbeitgeberProzent: optionalNumber(ch.nbuvArbeitgeberProzent),
    rate: ch.rate,
  }).split.nbuv.employeeChf
}

function nGreGap(ch: ChSalaryCertificateFacts): string | null {
  if (ch.status === 'kein-grenzgaenger') return 'anlageNGreKeinGrenzgaenger'
  if (ch.specialCases) return 'anlageNGreSonderfall'
  const amounts = [ch.grossWageChf, ch.ahvContributionsChf, ch.withholdingTaxChf, ch.familienzulagenChf, ch.krankentaggeldChf, ch.pkArbeitnehmerChf, ch.pkArbeitgeberChf]
  const complete =
    ch.status !== null &&
    ch.specialCases === false &&
    ch.rate !== null &&
    amounts.every((value) => integer(value) !== null) &&
    premiumClarified(integer(ch.krankentaggeldChf), ch.krankentaggeldArbeitgeberProzent, ch.krankentaggeldArbeitgeberChf) &&
    premiumClarified(nbuvEmployeeChf(ch), ch.nbuvArbeitgeberProzent, ch.nbuvArbeitgeberChf) &&
    Boolean(ch.arbeitgeberName && ch.arbeitgeberStrasse && ch.arbeitgeberPlzOrt)
  return complete ? null : 'grenzgaenger'
}

/**
 * One Anlage KAP. `haelfte` -1 = the whole amount, 0 = the first half (rounded up), 1 = the second half.
 */
function kapValues(
  capital: CapitalFacts,
  role: 'A' | 'B',
  half: -1 | 0 | 1 | number,
  header: { name: string | null; firstName: string | null },
  steuernummer: string | null,
): Record<string, string | true> {
  const share = (value: string | null | undefined): number => {
    const number = Number(value ?? 0)
    if (half === -1) return number
    return half === 0 ? Math.ceil(number / 2) : Math.floor(number / 2)
  }
  const values: Record<string, string | true> = {}
  values[role === 'A' ? 'anlKap.personA' : 'anlKap.personB'] = true
  if (header.name) values['anlKap.name'] = header.name
  if (header.firstName) values['anlKap.vorname'] = header.firstName
  if (steuernummer) values['anlKap.steuernummer'] = steuernummer
  values['anlKap.guenstigerpruefung'] = '1'
  if (capital.depot === 'deutscher-broker') {
    values['anlKap.kz210'] = String(share(capital.kapitalertraege))
    values['anlKap.kz217'] = String(share(capital.sparerPauschbetrag))
    values['anlKap.kz280'] = `${share(capital.kapitalertragsteuer)},00`
    values['anlKap.kz281'] = `${share(capital.solidaritaetszuschlag)},00`
    values['anlKap.kz282'] = `${share(capital.kirchensteuer)},00`
  } else {
    values['anlKap.kz234'] = String(share(capital.kapitalertraege))
    values['anlKap.kz217'] = '0'
    values['anlKap.kz218'] = String(share(capital.sparerPauschbetrag))
  }
  return values
}

interface NGreResult {
  readonly values: Record<string, string | true>
  readonly gap: string | null
}

/** One Anlage N-Gre for Person A or B, or null when that person has no Swiss wage. */
function nGreValues(
  ch: ChSalaryCertificateFacts | null | undefined,
  commute: CommuteFacts | null | undefined,
  role: 'A' | 'B',
  header: { name: string | null; firstName: string | null; beruf: string | null; steuernummer: string | null },
): NGreResult | null {
  if (!ch || ch.grossWageChf === null) return null
  const gap = nGreGap(ch)
  if (gap) return { values: {}, gap: role === 'B' && gap === 'grenzgaenger' ? 'grenzgaengerPersonB' : gap }
  const values: Record<string, string | true> = {}
  const set = (id: string, value: string | null) => {
    if (value) values[id] = value
  }
  values[role === 'A' ? 'anlNGre.personA' : 'anlNGre.personB'] = true
  set('anlNGre.name', header.name)
  set('anlNGre.vorname', header.firstName)
  set('anlNGre.steuernummer', header.steuernummer)
  values['anlNGre.kz117'] = '3'
  set('anlNGre.beruf', header.beruf)
  const { chf, eur, split } = annexNGreAmounts({
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
    rate: ch.rate!,
    krankentaggeldArbeitgeberProzent: optionalNumber(ch.krankentaggeldArbeitgeberProzent),
    krankentaggeldArbeitgeberChf: optionalNumber(ch.krankentaggeldArbeitgeberChf),
    nbuvArbeitgeberProzent: optionalNumber(ch.nbuvArbeitgeberProzent),
    nbuvArbeitgeberChf: optionalNumber(ch.nbuvArbeitgeberChf),
  })
  for (const row of Object.keys(chf) as NGreRow[]) {
    // Z. 9 and 18–20 only apply when there is such an amount; an empty line stays empty.
    if ((row === 'z9' || row === 'z18' || row === 'z19' || row === 'z20') && chf[row] === 0) continue
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
  Object.assign(values, commuteValues(commute, 'anlNGre'))
  set('anlNGre.arbeitgeberName', ch.arbeitgeberName)
  set('anlNGre.arbeitgeberStrasse', ch.arbeitgeberStrasse)
  set('anlNGre.arbeitgeberPlzOrt', ch.arbeitgeberPlzOrt)
  return { values, gap: null }
}

export interface SpecialExpensesFacts {
  donations?: string | null
}

/** Anlage AV: the contributions come from the provider; the form needs the kind of eligibility. */
export interface RiesterFacts {
  kind: string | null
  incomeLastYear: string | null
}

/** Anlage N Zeilen 27–31: the facts only — the Finanzamt computes the Entfernungspauschale itself. */
export interface CommuteFacts {
  workdaysPerWeek: number
  daysOff: number
  commuteDays: number
  oneWayKm: number | null
  withCar: boolean
  workplace: string | null
  /** Further Werbungskosten of the same person (ADR-0076), whole euros and what they were. */
  workExpenses?: WorkExpenseFacts | null
}

export interface WorkExpenseFacts {
  professionalBodiesEur: number | null
  professionalBodiesNote: string | null
  workEquipmentEur: number | null
  workEquipmentNote: string | null
  accountFeesEur: number | null
  otherWorkExpensesEur: number | null
  otherWorkExpensesNote: string | null
}

/** Where Anlage N and Anlage N-Gre ask for the further Werbungskosten: the same Kennzahlen in other lines. */
const WORK_EXPENSE_LINES = {
  anlN: { bodies: 'z53Text', tools: 'z54', sonstiges: ['z62', 'z63'] },
  anlNGre: { bodies: 'z48Text', tools: 'z49', sonstiges: ['z57', 'z58'] },
} as const

/** Kz 310 (professional bodies), 320 (work tools) and 380 (account fees and other) with their lines. */
function workExpenseValues(x: WorkExpenseFacts | null | undefined, prefix: 'anlN' | 'anlNGre'): Record<string, string> {
  if (!x) return {}
  const lines = WORK_EXPENSE_LINES[prefix]
  const values: Record<string, string> = {}
  if (x.professionalBodiesEur) {
    values[`${prefix}.${lines.bodies}`] = x.professionalBodiesNote ?? 'Beiträge zu Berufsverbänden'
    values[`${prefix}.kz310`] = String(x.professionalBodiesEur)
  }
  if (x.workEquipmentEur) {
    values[`${prefix}.${lines.tools}Text`] = x.workEquipmentNote ?? 'Arbeitsmittel'
    values[`${prefix}.${lines.tools}Eur`] = String(x.workEquipmentEur)
    values[`${prefix}.kz320`] = String(x.workEquipmentEur)
  }
  const sonstiges = [
    ...(x.accountFeesEur ? [['Kontoführungsgebühren', x.accountFeesEur] as const] : []),
    ...(x.otherWorkExpensesEur ? [[x.otherWorkExpensesNote ?? 'Sonstige Werbungskosten', x.otherWorkExpensesEur] as const] : []),
  ]
  sonstiges.forEach(([text, eur], i) => {
    values[`${prefix}.${lines.sonstiges[i]}Text`] = text
    values[`${prefix}.${lines.sonstiges[i]}Eur`] = String(eur)
  })
  if (sonstiges.length > 0) values[`${prefix}.kz380`] = String(sonstiges.reduce((sum, [, eur]) => sum + eur, 0))
  return values
}

/** Anlage N Z. 27–31 and Anlage N-Gre Z. 32–36 ask the same facts under their own field prefix. */
function commuteValues(a: CommuteFacts | null | undefined, prefix: 'anlN' | 'anlNGre' = 'anlN'): Record<string, string> {
  if (!a) return {}
  if (a.oneWayKm === null) return workExpenseValues(a.workExpenses, prefix)
  const values: Record<string, string> = {
    ...workExpenseValues(a.workExpenses, prefix),
    [`${prefix}.wegArt`]: '1',
    [`${prefix}.wegTageJeWoche`]: String(a.workdaysPerWeek),
    [`${prefix}.wegFreieTage`]: String(a.daysOff),
    [`${prefix}.kz110Tage`]: String(a.commuteDays),
    [`${prefix}.kz111`]: String(a.oneWayKm),
  }
  if (a.workplace) values[`${prefix}.wegOrt`] = a.workplace
  if (a.withCar) values[`${prefix}.kz112`] = String(a.oneWayKm)
  return values
}

const optionalNumber = (value: string | null): number | undefined => {
  const number = integer(value)
  return number === null ? undefined : number
}

export interface PrintoutFacts {
  taxYear: number
  profile: { firstName: string | null; lastName: string | null; steuerId: string | null; steuernummer: string | null }
  masterData: {
    geburtsdatum: string | null
    strasse: string | null
    hausnummer: string | null
    hausnummerZusatz: string | null
    plz: string | null
    wohnort: string | null
    beruf: string | null
    religion: string | null
    familienstand: string | null
    familienstandSeit: string | null
    iban: string | null
    kontoinhaber: string | null
    finanzamt: string | null
    telefon: string | null
  } | null
  bruttoarbeitslohn: string | null
  pension?: { rentenart: string | null; jahresbetrag: string | null } | null
  link?: LinkFacts | null
  capital?: CapitalFacts | null
  chSalaryCertificate?: ChSalaryCertificateFacts | null
  rental?: readonly RentalFacts[] | null
  kinder?: readonly ChildFacts[] | null
  specialExpenses?: SpecialExpensesFacts | null
  riester?: RiesterFacts | null
  /** Medical costs (§ 33) and household services / craftsmen (§ 35a), whole euros as asked (ADR-0077). */
  householdAndHealth?: HouseholdAndHealthFacts | null
  singleParent?: SingleParentFacts | null
  commute?: CommuteFacts | null
  /** Self-paid health and care insurance of Person A (Anlage Vorsorgeaufwand Z. 16–33). */
  healthInsurance?: readonly HealthInsurance[] | null
}

/**
 * Anlage Vorsorgeaufwand for self-paid insurance (Person A Kennzahlen 3xx): voluntary statutory Z. 16–18
 * and 22, private Z. 23, 24 and 27, foreign Z. 28–30 and 33. Contributions withheld from a German salary
 * are e-data (Z. 11–13) and Swiss ones via the employer are in the Anlage N-Gre — neither is repeated here.
 */
function provisionExpensesValues(insurances: readonly HealthInsurance[] | null | undefined, role: 'A' | 'B' = 'A'): Record<string, string> {
  const sums = new Map<string, number>()
  const add = (kz: string, amount: number) => sums.set(kz, (sums.get(kz) ?? 0) + amount)
  for (const kv of insurances ?? []) {
    if (kv.kind === 'gesetzlich') {
      add('326', kv.basicHealthAmount)
      if (kv.withSickPay) add('328', kv.basicHealthAmount)
      add('329', kv.careInsuranceAmount)
      add('338', kv.optionalExtrasAmount)
    } else if (kv.kind === 'privat') {
      add('350', kv.basicHealthAmount)
      add('351', kv.careInsuranceAmount)
      add('354', kv.optionalExtrasAmount)
    } else {
      add('333', kv.basicHealthAmount)
      if (!kv.withSickPay) add('334', kv.basicHealthAmount)
      add('335', kv.careInsuranceAmount)
      add('339', kv.optionalExtrasAmount)
    }
  }
  const values: Record<string, string> = {}
  // Person B's column carries the same Kennzahlen with a leading 4 instead of 3.
  for (const [kz, rawAmount] of sums) if (rawAmount > 0) values[`anlVor.kz${role === 'A' ? kz : `4${kz.slice(1)}`}`] = String(rawAmount)
  return values
}

const PENSION_CODE: Record<string, string> = {
  GesetzlicheRente: 'anlR.kz101',
  WitwenWaisenrente: 'anlR.kz101',
  PrivateRentenversicherung: 'anlR.kz131',
}

const PENSION_OTHER_FORM: Record<string, string> = {
  Betriebsrente: 'anlageRAvBav',
  AuslaendischeRente: 'anlageRAus',
}

export interface PrintoutValues {
  values: FieldValues
  instances?: Record<string, FieldValues[]>
  missing: string[]
}

const REQUIRED_MASTER_DATA = ['geburtsdatum', 'strasse', 'hausnummer', 'plz', 'wohnort', 'religion', 'familienstand', 'iban', 'finanzamt'] as const

const SINCE_FIELD: Record<string, string> = {
  verheiratet: 'est1a.verheiratetSeit',
  verwitwet: 'est1a.verwitwetSeit',
  geschieden: 'est1a.geschiedenSeit',
  'dauernd-getrennt': 'est1a.getrenntSeit',
}

export interface HouseholdAndHealthFacts {
  /** Out-of-pocket medical costs after reimbursements (Anlage Außergewöhnliche Belastungen Z. 23–25). */
  healthCostsEur: number | null
  /** Anlage Haushaltsnahe Aufwendungen Z. 4 (Kz 202), Z. 5 (Kz 212), Z. 6/9 (Kz 214, labour only). */
  minijobEur: number | null
  servicesEur: number | null
  craftsmenLabourEur: number | null
}

export function printoutValues(facts: PrintoutFacts): PrintoutValues {
  const { profile, masterData: sd } = facts
  const missing: string[] = []
  if (!profile.lastName) missing.push('name')
  if (!profile.firstName) missing.push('vorname')
  if (!profile.steuerId) missing.push('steuerId')
  for (const field of REQUIRED_MASTER_DATA) if (!sd?.[field]) missing.push(field)

  const values: Record<string, string | true> = {}
  const instances: Record<string, FieldValues[]> = {}
  const set = (id: string, value: string | null | undefined) => {
    if (value) values[id] = value
  }

  if (sd?.familienstand === 'verheiratet') {
    if (!facts.link) {
      missing.push('ehegatte')
    } else if (facts.link.filingType === 'zusammen') {
      values['est1a.zusammenveranlagung'] = true
      const b = facts.link.personB
      if (!b || !b.lastName || !b.firstName || !b.steuerId || !b.geburtsdatum) {
        missing.push('personB')
      } else {
        set('est1a.idnrB', b.steuerId)
        set('est1a.geburtsdatumB', formatGermanDate(b.geburtsdatum))
        set('est1a.nameB', b.lastName)
        set('est1a.vornameB', b.firstName)
        set('est1a.religionB', b.religion)
        set('est1a.berufB', b.beruf)
      }
    } else if (facts.link.filingType === 'einzel') {
      values['est1a.einzelveranlagung'] = true
    }
  }

  values['est1a.einkommensteuererklaerung'] = true
  set('est1a.steuernummer', profile.steuernummer)
  set('est1a.idnr', profile.steuerId)
  set('est1a.name', profile.lastName)
  set('est1a.vorname', profile.firstName)
  set(
    'est1a.kopfSeite2',
    [profile.steuernummer, profile.lastName, profile.firstName].filter(Boolean).join(', ') || null,
  )

  if (sd) {
    set('est1a.finanzamt', sd.finanzamt)
    set('est1a.telefon', sd.telefon)
    set('est1a.geburtsdatum', sd.geburtsdatum ? formatGermanDate(sd.geburtsdatum) : null)
    set('est1a.religion', sd.religion)
    set('est1a.beruf', sd.beruf)
    set('est1a.strasse', sd.strasse)
    set('est1a.hausnummer', sd.hausnummer)
    set('est1a.hausnummerZusatz', sd.hausnummerZusatz)
    set('est1a.plz', sd.plz)
    set('est1a.wohnort', sd.wohnort)
    const sinceField = sd.familienstand ? SINCE_FIELD[sd.familienstand] : undefined
    if (sinceField) set(sinceField, sd.familienstandSeit ? formatGermanDate(sd.familienstandSeit) : null)
    if (sd.iban?.startsWith('DE')) set('est1a.ibanInland', sd.iban.slice(2))
    else set('est1a.ibanAusland', sd.iban)
    if (sd.kontoinhaber) set('est1a.kontoinhaberName', sd.kontoinhaber)
    else if (sd.iban) values['est1a.kontoinhaberSelbst'] = true
  }

  const gross = facts.bruttoarbeitslohn
  const grossB = facts.link?.filingType === 'zusammen' ? facts.link.personB?.bruttoarbeitslohn ?? null : null
  const hasGrossA = gross !== null && /^\d+$/.test(gross)
  const hasGrossB = grossB !== null && /^\d+$/.test(grossB)

  if (hasGrossA && !hasGrossB) {
    values['anlN.kz110'] = gross!
    values['anlN.personA'] = true
    Object.assign(values, commuteValues(facts.commute))
    set('anlN.name', profile.lastName)
    set('anlN.vorname', profile.firstName)
    set('anlN.steuernummer', profile.steuernummer)
  } else if (hasGrossB) {
    const nInstances: FieldValues[] = []
    if (hasGrossA) {
      const nA: Record<string, string | true> = { 'anlN.kz110': gross!, 'anlN.personA': true, ...commuteValues(facts.commute) }
      if (profile.lastName) nA['anlN.name'] = profile.lastName
      if (profile.firstName) nA['anlN.vorname'] = profile.firstName
      if (profile.steuernummer) nA['anlN.steuernummer'] = profile.steuernummer
      nInstances.push(nA)
    }
    const b = facts.link?.personB
    const nB: Record<string, string | true> = { 'anlN.kz110': grossB!, 'anlN.personB': true }
    // B's commute belongs to their Anlage N unless they are a Grenzgänger (then it is in their N-Gre).
    if (!b?.chSalaryCertificate) Object.assign(nB, commuteValues(b?.commute))
    if (b?.lastName) nB['anlN.name'] = b.lastName
    if (b?.firstName) nB['anlN.vorname'] = b.firstName
    if (profile.steuernummer) nB['anlN.steuernummer'] = profile.steuernummer
    nInstances.push(nB)
    instances['anlage-n'] = nInstances
  }

  const pension = facts.pension
  const pensionB = facts.link?.filingType === 'zusammen' ? facts.link.personB?.pension ?? null : null
  if (pension?.rentenart) {
    const otherForm = PENSION_OTHER_FORM[pension.rentenart]
    if (otherForm) missing.push(otherForm)
  }
  if (pensionB?.rentenart) {
    const otherFormB = PENSION_OTHER_FORM[pensionB.rentenart]
    if (otherFormB && !missing.includes(otherFormB)) missing.push(otherFormB)
  }

  const codeA = pension?.rentenart ? PENSION_CODE[pension.rentenart] : undefined
  const hasPensionA = Boolean(codeA && pension?.jahresbetrag !== null && pension?.jahresbetrag !== undefined && /^\d+$/.test(pension.jahresbetrag))
  const codeB = pensionB?.rentenart ? PENSION_CODE[pensionB.rentenart] : undefined
  const hasPensionB = Boolean(codeB && pensionB?.jahresbetrag !== null && pensionB?.jahresbetrag !== undefined && /^\d+$/.test(pensionB.jahresbetrag))

  if (hasPensionA && !hasPensionB) {
    values[codeA!] = pension!.jahresbetrag!
    values['anlR.personA'] = true
    values['anlR.lfdNr'] = '1'
    set('anlR.name', profile.lastName)
    set('anlR.vorname', profile.firstName)
    set('anlR.steuernummer', profile.steuernummer)
  } else if (hasPensionB) {
    const rInstances: FieldValues[] = []
    if (hasPensionA) {
      const rA: Record<string, string | true> = {
        [codeA!]: pension!.jahresbetrag!,
        'anlR.personA': true,
        'anlR.lfdNr': '1',
      }
      if (profile.lastName) rA['anlR.name'] = profile.lastName
      if (profile.firstName) rA['anlR.vorname'] = profile.firstName
      if (profile.steuernummer) rA['anlR.steuernummer'] = profile.steuernummer
      rInstances.push(rA)
    }
    const b = facts.link?.personB
    const rB: Record<string, string | true> = {
      [codeB!]: pensionB!.jahresbetrag!,
      'anlR.personB': true,
      'anlR.lfdNr': '1',
    }
    if (b?.lastName) rB['anlR.name'] = b.lastName
    if (b?.firstName) rB['anlR.vorname'] = b.firstName
    if (profile.steuernummer) rB['anlR.steuernummer'] = profile.steuernummer
    rInstances.push(rB)
    instances['anlage-r'] = rInstances
  }

  const capital = facts.capital
  if (capital && capital.kapitalertraege != null) {
    const required = mandatoryCapitalFields(capital.depot)
    const complete = required.every((field) => integer(capital[field] ?? null) !== null)
    if (capital.depot === 'krypto') missing.push('anlageKapKrypto')
    else if (capital.depot === 'unbekannt' || !complete) missing.push('kapital')
    else {
      // ADR-0054: in a joint return a joint account is split half and half across an Anlage KAP for
      // each spouse; an account of Person B goes onto B's Anlage KAP. A gets the odd euro.
      const joint = facts.link?.filingType === 'zusammen'
      const b = joint ? facts.link?.personB ?? null : null
      const inhaber = joint ? (capital.inhaber ?? 'A') : 'A'
      const headerA = { name: profile.lastName, firstName: profile.firstName }
      const headerB = { name: b?.lastName ?? null, firstName: b?.firstName ?? null }
      const parts: [('A' | 'B'), number][] =
        inhaber === 'gemeinsam' ? [['A', 0], ['B', 1]] : inhaber === 'B' ? [['B', -1]] : [['A', -1]]
      const kapInstances = parts.map(([role, half]) =>
        kapValues(capital, role, half, role === 'A' ? headerA : headerB, profile.steuernummer),
      )
      if (kapInstances.length === 1 && parts[0]![0] === 'A') Object.assign(values, kapInstances[0])
      else instances['anlage-kap'] = kapInstances
    }
  }

  // Anlage N-Gre: one per Grenzgänger. A couple where both commute to Switzerland gets two instances.
  const personB = facts.link?.filingType === 'zusammen' ? facts.link.personB : null
  const nGreA = nGreValues(facts.chSalaryCertificate, facts.commute, 'A', {
    name: profile.lastName,
    firstName: profile.firstName,
    beruf: sd?.beruf ?? null,
    steuernummer: profile.steuernummer,
  })
  const nGreB = nGreValues(personB?.chSalaryCertificate, personB?.commute, 'B', {
    name: personB?.lastName ?? null,
    firstName: personB?.firstName ?? null,
    beruf: personB?.beruf ?? null,
    steuernummer: profile.steuernummer,
  })
  for (const n of [nGreA, nGreB]) if (n?.gap) missing.push(n.gap)
  const nGreInstances = [nGreA, nGreB].filter((n): n is NGreResult => n !== null && n.gap === null).map((n) => n.values)
  if (nGreInstances.length === 1 && nGreA?.gap === null) Object.assign(values, nGreInstances[0])
  else if (nGreInstances.length > 0) instances['anlage-n-gre'] = nGreInstances

  if (facts.rental && facts.rental.length > 0) {
    instances['anlage-v'] = facts.rental.map((obj, i) => {
      const vValues: Record<string, string | true> = {}
      if (profile.lastName) vValues['anlV.name'] = profile.lastName
      if (profile.firstName) vValues['anlV.vorname'] = profile.firstName
      if (profile.steuernummer) vValues['anlV.steuernummer'] = profile.steuernummer
      vValues['anlV.lfdNr'] = obj.sequenceNumber ?? String(i + 1)
      if (obj.strasse) vValues['anlV.strasse'] = obj.strasse
      if (obj.plz) vValues['anlV.plz'] = obj.plz
      if (obj.city) vValues['anlV.ort'] = obj.city
      if (obj.livingArea) {
        vValues['anlV.wohnflaeche'] = obj.livingArea
        vValues['anlV.z13Wohnflaeche'] = obj.livingArea
      }
      // Several flats of one building go into Z. 13 together, named as such.
      const units = integer(obj.einheiten ?? null)
      if (units !== null && units > 1) vValues['anlV.z13Bezeichnung'] = `${units} Wohneinheiten`
      const rent = integer(obj.mieteinnahmen)
      const ongoing = integer(obj.werbungskosten)
      if (rent === null || ongoing === null) return vValues
      vValues['anlV.z13Miete'] = String(rent)
      vValues['anlV.kz01'] = String(rent)
      const umlagen = integer(obj.umlagen ?? null) ?? 0
      if (umlagen > 0) vValues['anlV.kz04'] = String(umlagen)
      vValues['anlV.z32Einnahmen'] = String(rent + umlagen)
      const schuldzinsen = integer(obj.schuldzinsen ?? null) ?? 0
      if (schuldzinsen > 0) {
        vValues['anlV.z46Text'] = 'Darlehen für das Objekt'
        vValues['anlV.z46Betrag'] = String(schuldzinsen)
        vValues['anlV.kz33'] = String(schuldzinsen)
      }
      const depreciation = rentalDepreciation(obj)
      if (depreciation && obj.depreciationAsLastYear) {
        vValues['anlV.z33Linear'] = '1'
        vValues['anlV.z33Satz'] = String(depreciation.rate).replace('.', ',')
        vValues['anlV.z33WieVorjahr'] = '1'
        vValues['anlV.z33Afa'] = String(depreciation.amount)
        vValues['anlV.kz30'] = String(depreciation.amount)
      }
      if (ongoing > 0) {
        vValues['anlV.z80Text'] = 'Laufende Werbungskosten'
        vValues['anlV.z80Betrag'] = String(ongoing)
        vValues['anlV.kz49'] = String(ongoing)
      }
      const sum = ongoing + schuldzinsen + (depreciation && obj.depreciationAsLastYear ? depreciation.amount : 0)
      const surplus = rent + umlagen - sum
      vValues['anlV.werbungskostenSumme'] = String(sum)
      vValues['anlV.ueberschuss'] = String(surplus)
      // Z. 86: in a joint return the result is attributed to both spouses (ADR-0054), half and half by default.
      if (facts.link?.filingType === 'zusammen') {
        const anteilA = Math.min(100, integer(obj.anteilA ?? null) ?? 50)
        const teilA = Math.round((surplus * anteilA) / 100)
        vValues['anlV.kz20'] = String(teilA)
        vValues['anlV.kz21'] = String(surplus - teilA)
      } else vValues['anlV.kz20'] = String(surplus)
      return vValues
    })
    for (const obj of facts.rental) {
      const gap = rentalGap(obj)
      if (gap && !missing.includes(gap)) missing.push(gap)
    }
  }

  if (facts.kinder && facts.kinder.length > 0) {
    const isJoint = facts.link?.filingType === 'zusammen'
    const single =
      !isJoint &&
      sd?.familienstand !== 'verheiratet' &&
      facts.singleParent?.otherPerson === 'Nein' &&
      facts.singleParent.householdCommunity === 'Nein'
    instances['anlage-kind'] = facts.kinder.map((k, i) => {
      const kValues: Record<string, string | true> = {}
      if (profile.lastName) kValues['anlKind.name'] = profile.lastName
      if (profile.firstName) kValues['anlKind.vornameEltern'] = profile.firstName
      if (profile.steuernummer) kValues['anlKind.steuernummer'] = profile.steuernummer
      kValues['anlKind.lfdNr'] = k.sequenceNumber ?? String(i + 1)
      if (k.taxId) kValues['anlKind.idnr'] = k.taxId
      if (k.firstName) kValues['anlKind.vorname'] = k.firstName
      if (k.lastName && k.lastName !== profile.lastName) kValues['anlKind.nachname'] = k.lastName
      if (k.geburtsdatum) kValues['anlKind.geburtsdatum'] = formatGermanDate(k.geburtsdatum)
      if (k.swissFamilyAllowanceEur && Number(k.swissFamilyAllowanceEur) > 0) {
        const swissEur = Number(k.swissFamilyAllowanceEur)
        const diff = calculateDifferentialChildBenefit(k.geburtsdatum ?? `${facts.taxYear}-01-01`, facts.taxYear, swissEur)
        const claimEur = k.childBenefitClaimEur ? Number(k.childBenefitClaimEur) : 0
        kValues['anlKind.kindergeld'] = String(Math.max(claimEur, diff.totalClaim))
      } else if (k.childBenefitClaimEur) {
        kValues['anlKind.kindergeld'] = k.childBenefitClaimEur
      }
      if (k.familyBenefitsOffice) kValues['anlKind.familienkasse'] = k.familyBenefitsOffice
      // Z. 27/28: KV/PV of the child the parents pay as policyholders — an empty or zero line stays empty.
      if (k.healthBasicEur && Number(k.healthBasicEur) > 0) kValues['anlKind.kz66'] = k.healthBasicEur
      // Zeile 67: what the parents paid; the tax office applies the 80 % and the cap itself.
      if (k.childcareEur && Number(k.childcareEur) > 0) {
        kValues['anlKind.kz51'] = k.childcareEur
        if (k.childcareProvider) kValues['anlKind.z67Text'] = k.childcareProvider
        if (k.childcareFrom) kValues['anlKind.z67Von'] = k.childcareFrom
        if (k.childcareTo) kValues['anlKind.z67Bis'] = k.childcareTo
      }
      if (k.careEur && Number(k.careEur) > 0) kValues['anlKind.kz67'] = k.careEur
      const start = k.geburtsdatum?.startsWith(`${facts.taxYear}-`) ? k.geburtsdatum : `${facts.taxYear}-01-01`
      const end = `${facts.taxYear}-12-31`
      if (k.domesticResidenceAllYear) {
        kValues['anlKind.inlandVon'] = formatGermanDate(start)
        kValues['anlKind.inlandBis'] = formatGermanDate(end)
      }
      if (k.kinship) kValues['anlKind.kz02'] = k.kinship
      if (isJoint && k.kinshipB) kValues['anlKind.kz03'] = k.kinshipB
      if (single && k.registeredWithMeAllYear && k.childBenefitToMeAllYear) {
        kValues['anlKind.kz42Von'] = formatGermanDate(start)
        kValues['anlKind.kz42Bis'] = formatGermanDate(end)
        kValues['anlKind.kz44Von'] = formatGermanDate(start)
        kValues['anlKind.kz44Bis'] = formatGermanDate(end)
        kValues['anlKind.kz46'] = '2'
        kValues['anlKind.kz49'] = '2'
      }
      if (needsOtherParent(k, isJoint)) {
        if (k.otherParent === 'Unbekannt') kValues['anlKind.kz05'] = '1'
        if (k.otherParent === 'Inland' || k.otherParent === 'Verstorben') {
          if (k.otherParentName) kValues['anlKind.aeName'] = k.otherParentName
          if (k.otherParentBirthDate) kValues['anlKind.aeGeburtsdatum'] = formatGermanDate(k.otherParentBirthDate)
          if (k.otherParentAddress) kValues['anlKind.aeAdresse'] = k.otherParentAddress
          if (k.otherParentKind) kValues['anlKind.aeArt'] = k.otherParentKind
          const tod = k.otherParent === 'Verstorben' ? k.otherParentDiedOn : null
          if (tod) kValues['anlKind.kz06'] = formatGermanDate(tod)
          const to = tod && tod < end ? tod : end
          if (to >= start) {
            kValues['anlKind.aeVon'] = formatGermanDate(start)
            kValues['anlKind.aeBis'] = formatGermanDate(to)
          }
        }
      }
      return kValues
    })
    for (const kind of facts.kinder) {
      const missingField = childGap(kind, facts.taxYear, isJoint)
      if (missingField && !missing.includes(missingField)) missing.push(missingField)
    }
  }

  if (facts.specialExpenses?.donations && /^\d+$/.test(facts.specialExpenses.donations)) {
    set('anlSo.name', profile.lastName)
    set('anlSo.vorname', profile.firstName)
    set('anlSo.steuernummer', profile.steuernummer)
    values['anlSo.spenden'] = facts.specialExpenses.donations
  }

  const provision = {
    ...provisionExpensesValues(facts.healthInsurance),
    ...provisionExpensesValues(personB?.healthInsurance, 'B'),
  }
  if (Object.keys(provision).length > 0) {
    set('anlVor.name', profile.lastName)
    set('anlVor.vorname', profile.firstName)
    set('anlVor.steuernummer', profile.steuernummer)
    Object.assign(values, provision)
  }

  const hh = facts.householdAndHealth
  if (hh?.healthCostsEur) {
    set('anlAgB.name', profile.lastName)
    set('anlAgB.vorname', profile.firstName)
    set('anlAgB.steuernummer', profile.steuernummer)
    // The interview asks for the costs after reimbursements: the tax office gets that sum and 0.
    values['anlAgB.z23Text'] = 'Krankheitskosten (selbst getragen)'
    values['anlAgB.kz302'] = String(hh.healthCostsEur)
    values['anlAgB.kz303'] = '0'
  }
  if (hh && (hh.minijobEur || hh.servicesEur || hh.craftsmenLabourEur)) {
    set('anlHha.name', profile.lastName)
    set('anlHha.vorname', profile.firstName)
    set('anlHha.steuernummer', profile.steuernummer)
    if (hh.minijobEur) {
      values['anlHha.z4Text'] = 'Haushaltshilfe (Minijob)'
      values['anlHha.kz202'] = String(hh.minijobEur)
    }
    if (hh.servicesEur) {
      values['anlHha.z5Text'] = 'Haushaltsnahe Dienstleistungen'
      values['anlHha.kz212'] = String(hh.servicesEur)
    }
    if (hh.craftsmenLabourEur) {
      // Only the labour share is known; the invoice total stays for the user to add.
      values['anlHha.z6Text'] = 'Handwerkerleistungen'
      values['anlHha.z6Lohn'] = String(hh.craftsmenLabourEur)
      values['anlHha.kz214'] = String(hh.craftsmenLabourEur)
    }
  }

  if (facts.riester) {
    const { kind: fieldKind, incomeLastYear } = facts.riester
    const direct = fieldKind === 'Unmittelbar' && incomeLastYear !== null && /^\d+$/.test(incomeLastYear)
    if (direct || fieldKind === 'Mittelbar') {
      set('anlAv.name', profile.lastName)
      set('anlAv.vorname', profile.firstName)
      set('anlAv.steuernummer', profile.steuernummer)
      if (direct) {
        values['anlAv.unmittelbar'] = '1'
        values['anlAv.kz100'] = incomeLastYear
      } else {
        values['anlAv.mittelbar'] = '2'
      }
    } else {
      missing.push('riester')
    }
  }

  const result: PrintoutValues = { values, missing }
  if (Object.keys(instances).length > 0) result.instances = instances
  return result
}
