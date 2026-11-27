// The stored facts `printoutValues` reads, as the printout service collects them (ADR-0050).
import type { CapitalDepotClassification, CapitalFieldId, CrossBorderStatus, HealthInsurance } from '@steuereule/core'

export interface PersonBFacts {
  /** B's own Lebenslagen (ADR-0088 personal entries, ADR-0090). */
  lifeSituations?: LifeSituationFacts | null
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
  /** A foreign insurer: KV and PV go into Kz 89 (ADR-0090). */
  healthInsuranceAbroad?: boolean | null
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
  /** Daily benefit of the accident insurance (UVG/SUVA) contained in Ziffer 8 (Zeile 10 „SUVA – Geld“, also Zeile 76). */
  steuerfreiesUnfalltaggeldChf: string | null
  /** Where the daily benefit came from; under Lohnfortzahlung / kein nothing is deducted. Absent = not asked. */
  taggeldQuelle?: string | null
  krankentaggeldArbeitgeberProzent: string | null
  krankentaggeldArbeitgeberChf: string | null
  nbuvArbeitgeberProzent: string | null
  nbuvArbeitgeberChf: string | null
  specialCases: boolean | null
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
  /** When this way did not last the whole year (DD.MM.YYYY) (ADR-0079). */
  from?: string | null
  to?: string | null
  /** A second way after a change of job, with its share of the commute days. */
  second?: SecondWayFacts | null
  /** Further Werbungskosten of the same person (ADR-0076), whole euros and what they were. */
  workExpenses?: WorkExpenseFacts | null
}

export interface SecondWayFacts {
  commuteDays: number
  oneWayKm: number
  withCar: boolean
  workplace: string | null
  from: string | null
  to: string | null
}

/**
 * Which ways a form gets: both (1. and 2. Angabe), or for someone who changed from a German to a Swiss
 * employer the first way in the Anlage N and the second in the Anlage N-Gre (ADR-0079).
 */
export type WaysInForm = 'all' | 'first' | 'second'

export interface WorkExpenseFacts {
  professionalBodiesEur: number | null
  professionalBodiesNote: string | null
  workEquipmentEur: number | null
  workEquipmentNote: string | null
  accountFeesEur: number | null
  otherWorkExpensesEur: number | null
  otherWorkExpensesNote: string | null
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
  /** The basis page said there are children (Anlage Kind is then needed even before one is recorded). */
  childrenAnswered?: boolean
  /** Life situations answered in the Strom / catalogue (ADR-0090); absent = none. */
  lifeSituations?: LifeSituationFacts | null
  singleParent?: SingleParentFacts | null
  commute?: CommuteFacts | null
  /** Self-paid health and care insurance of Person A (Anlage Vorsorgeaufwand Z. 16–33). */
  healthInsurance?: readonly HealthInsurance[] | null
}

/** What the Lebenslagen and Segment 2 answered, in whole euros (ADR-0090). */
export interface LifeSituationFacts {
  /** Fortbildungskosten — Anlage N Z. 60 / N-Gre Z. 55, Kz 330. */
  trainingEur: number | null
  /** Beruflich veranlasster Umzug — a further Werbungskosten line (Kz 380). */
  relocationEur: number | null
  /** Einkommensersatzleistungen under the progression clause — Hauptvordruck Z. 35, Kz 120 (A) / 121 (B). */
  wageReplacementEur: number | null
  /** An Abfindung: Anlage N Z. 17/18 depend on how the employer taxed it — not printed yet. */
  severance: boolean
  /** Doppelte Haushaltsführung: its own Anlage N-Doppelte Haushaltsführung — not printed yet. */
  secondHousehold: boolean
}

export interface HouseholdAndHealthFacts {
  /** Medical costs of the year (Anlage Außergewöhnliche Belastungen Z. 24, Kz 302). */
  healthCostsEur: number | null
  /** What insurers or Beihilfe reimbursed (Z. 25, Kz 303), ADR-0090; absent = nothing. */
  healthReimbursedEur?: number | null
  /** Anlage Haushaltsnahe Aufwendungen Z. 4 (Kz 202), Z. 5 (Kz 212), Z. 6/9 (Kz 214, labour only). */
  minijobEur: number | null
  servicesEur: number | null
  craftsmenLabourEur: number | null
  /** The invoices' totals behind the labour share (Z. 6, „Rechnungsbeträge“). */
  craftsmenInvoicesEur?: number | null
}
