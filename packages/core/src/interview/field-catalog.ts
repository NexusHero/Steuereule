// The field catalogue (ADR-0066): one description per field of the return — which screen it
// belongs to, what a value has to look like, whether it hangs on a row (a child, a rental
// property), and whether the owl may propose it. Everything that needs to know a field reads this
// list: the value check on the owl's write path, the check when a draft is made, and the field
// list in the model's prompt. A field without a line here cannot be proposed.
import { CAPITAL_FIELDS } from '../domains/capital'
import { MARITAL_STATUSES, RELIGION_KEYS, isValidIban, normalizeIban } from '../common/master-data'
import { CHILD_RELATIONSHIPS, OTHER_CHILD_RELATIONSHIPS, OTHER_PARENT_STATUSES } from '../domains/children'
import { SALARY_CERTIFICATE_AMOUNT_FIELDS, SALARY_CERTIFICATE_SIGNED_FIELD } from '../domains/cross-border'
import { LSTB_OPTIONAL_LINES, LSTB_SOCIAL_LINES, LSTB_SOLI_LINE, WAGE_TAX_CERTIFICATE_FIELDS } from '../domains/lstb'
import { PENSION_TYPES } from '../domains/pension'
import { ASSESSMENT_FIELDS } from '../engine/assessment'
import { AMOUNT_LATER, QUESTIONS, isValidAnswer, type EntryStepId } from './interview'
import { SCREENS, type Screen } from './marking'

/** What a value has to look like. Stored values are strings; `kind` says which strings. */
export type FieldValueKind =
  /** Whole currency units, zero or more: `"1200"`. `signed`: the form line can be negative (`"-75"`). */
  | { readonly kind: 'amount'; readonly max: number; readonly signed?: boolean }
  | { readonly kind: 'integer'; readonly min: number; readonly max: number }
  /** `places`: decimal places allowed, two when not given. */
  | { readonly kind: 'decimal'; readonly min: number; readonly max: number; readonly places?: number }
  /** Digits only, between `min` and `max` of them; spaces, dots and slashes in the input are left out (Steuer-ID, Steuernummer). */
  | { readonly kind: 'digits'; readonly min: number; readonly max: number; readonly shape: string }
  /** An IBAN: two letters, two check digits, up to 30 letters or digits; spaces are left out. */
  | { readonly kind: 'iban' }
  /** Text that has to match a pattern; `shape` says in German what it looks like. */
  | { readonly kind: 'pattern'; readonly pattern: RegExp; readonly shape: string }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  /** `"true"` or `"false"`. */
  | { readonly kind: 'boolean' }
  /** ISO date `YYYY-MM-DD`. */
  | { readonly kind: 'date' }
  /** ISO weekdays as digits 1–7, comma separated: `"1,2,3,4,5"`. */
  | { readonly kind: 'weekdays' }
  | { readonly kind: 'text'; readonly maxLength: number }
  /** An interview answer: the question's own form decides, `QUESTIONS` is the source. */
  | { readonly kind: 'interview' }

export interface FieldSpec {
  readonly screen: Screen
  readonly field: string
  readonly value: FieldValueKind
  /** The screen has several rows a year (children, rental properties); a write names one. */
  readonly perInstance: boolean
  /** Whether the owl may propose it without the user's consent to personal data (ADR-0091). */
  readonly aiWritable: boolean
  /**
   * Identifies a person (a name, an id, an address, the bank, the religion, the household link):
   * the owl may propose it only once the user consented to personal data going to the model
   * (ADR-0091); without that consent it stays closed as before (ADR-0066).
   */
  readonly personal: boolean
  /** What belongs in the field, for the model, where the name alone is ambiguous (German, goes into the prompt). */
  readonly hint?: string
}

const MAX_AMOUNT = 999_999_999

/**
 * Version of the consent text the user agreed to when personal data goes to the model (ADR-0091).
 * A new text gets a new version; a consent to an older version no longer counts.
 */
export const OWL_PERSONAL_DATA_CONSENT_VERSION = '2026-11-14'

/** Screens the owl writes only with the consent to personal data (identity, address, bank details, coupling; ADR-0091). */
export const AI_FORBIDDEN_SCREENS: ReadonlySet<Screen> = new Set<Screen>(['profil', 'stammdaten', 'kopplung'])

/** Field names that identify a person or a third party, on whatever screen they appear: open only with consent (ADR-0091). */
export const AI_FORBIDDEN_FIELDS: ReadonlySet<string> = new Set([
  'workplace',
  'secondWorkplace',
  'steuerId',
  'taxId',
  'idnr',
  'steuernummer',
  'iban',
  'kontoinhaber',
  'firstName',
  'lastName',
  'vorname',
  'nachname',
  'geburtsdatum',
  'birthDate',
  'strasse',
  'hausnummer',
  'hausnummerZusatz',
  'plz',
  'wohnort',
  'telefon',
  'phone',
  'email',
  'invitationCode',
  'arbeitgeberName',
  'arbeitgeberStrasse',
  'arbeitgeberPlzOrt',
  'otherParentName',
  'otherParentBirthDate',
  'otherParentAddress',
  'otherParentKind',
  'otherParentDiedOn',
  'familyBenefitsOffice',
  'city',
])

/**
 * Fields the owl never writes, consent or not: the invitation code is a key to someone's return,
 * not a figure of it.
 */
export const AI_NEVER_FIELDS: ReadonlySet<string> = new Set(['invitationCode'])

/** Whether the owl may propose this field, given whether the user consented to personal data (ADR-0091). */
export function isAiWritableField(screen: string, field: string, personalDataConsent: boolean): boolean {
  const spec = fieldSpec(screen, field.trim())
  if (spec === undefined) return false
  return spec.aiWritable || (personalDataConsent && spec.personal && !AI_NEVER_FIELDS.has(spec.field))
}

const amount: FieldValueKind = { kind: 'amount', max: MAX_AMOUNT }
const signedAmount: FieldValueKind = { kind: 'amount', max: MAX_AMOUNT, signed: true }
const text = (maxLength: number): FieldValueKind => ({ kind: 'text', maxLength })
const integer = (min: number, max: number): FieldValueKind => ({ kind: 'integer', min, max })
const oneOf = (values: readonly string[]): FieldValueKind => ({ kind: 'enum', values })
const bool: FieldValueKind = { kind: 'boolean' }
const date: FieldValueKind = { kind: 'date' }
const percent: FieldValueKind = { kind: 'decimal', min: 0, max: 100 }
const taxId: FieldValueKind = { kind: 'digits', min: 11, max: 11, shape: 'Steuer-ID aus 11 Ziffern' }
const taxNumber: FieldValueKind = { kind: 'digits', min: 1, max: 13, shape: 'Steuernummer aus bis zu 13 Ziffern' }

type Declared = Readonly<Record<string, FieldValueKind>>

const fromList = (fields: readonly string[], value: FieldValueKind): Declared => Object.fromEntries(fields.map((field) => [field, value]))

/** Every screen with its fields. The order within a screen is the order the prompt lists them in. */
const DECLARED: Readonly<Record<Screen, { readonly perInstance: boolean; readonly fields: Declared }>> = {
  profil: {
    perInstance: false,
    fields: { firstName: text(100), lastName: text(100), steuerId: taxId, steuernummer: taxNumber },
  },
  stammdaten: {
    perInstance: false,
    fields: {
      geburtsdatum: date,
      strasse: text(100),
      hausnummer: text(10),
      hausnummerZusatz: text(10),
      plz: text(10),
      wohnort: text(100),
      beruf: text(100),
      religion: oneOf(RELIGION_KEYS),
      familienstand: oneOf(MARITAL_STATUSES),
      familienstandSeit: date,
      iban: { kind: 'iban' },
      kontoinhaber: text(100),
      finanzamt: text(100),
      telefon: text(40),
    },
  },
  kopplung: {
    perInstance: false,
    fields: { filingType: oneOf(['einzel', 'zusammen']), invitationCode: text(64) },
  },
  interview: {
    perInstance: false,
    fields: fromList(Object.keys(QUESTIONS), { kind: 'interview' }),
  },
  lstb: {
    perInstance: false,
    fields: {
      ...fromList(WAGE_TAX_CERTIFICATE_FIELDS, amount),
      /** Zeilen 6 und 7 (ADR-0063) and Zeile 24 (ADR-0090): optional lines next to the three required ones. */
      ...fromList(LSTB_OPTIONAL_LINES, amount),
      /** Zeilen 22–27 line by line and Zeile 24c; the app adds them, the owl never does (ADR-0093). */
      ...fromList(LSTB_SOCIAL_LINES, amount),
      /** Zeile 5: withheld Solidaritätszuschlag, euros with cents. */
      [LSTB_SOLI_LINE]: { kind: 'decimal', min: 0, max: MAX_AMOUNT },
    },
  },
  commute: {
    perInstance: false,
    fields: {
      workdays: { kind: 'weekdays' },
      vacationDays: integer(0, 366),
      sickDays: integer(0, 366),
      homeOfficeDays: integer(0, 366),
      oneWayKm: integer(0, 999),
      transport: oneOf(['pkw', 'oepnv', 'andere']),
      publicHolidays: integer(0, 30),
      publicHolidayRegion: text(8),
      professionalBodiesEur: amount,
      professionalBodiesNote: text(100),
      workEquipmentEur: amount,
      workEquipmentNote: text(100),
      accountFeesEur: amount,
      otherWorkExpensesEur: amount,
      otherWorkExpensesNote: text(100),
      periodFrom: text(10),
      periodTo: text(10),
      secondOneWayKm: integer(0, 999),
      secondTransport: oneOf(['pkw', 'oepnv', 'andere']),
      secondFrom: text(10),
      secondTo: text(10),
      /** The first place of work (Anlage N/N-Gre „Arbeitsort“) — an address, so personal (ADR-0091). */
      workplace: text(120),
      secondWorkplace: text(120),
      /** Days the first place of work was actually visited, per way; they replace the derived days (ADR-0093). */
      travelDays: integer(0, 366),
      secondTravelDays: integer(0, 366),
      /** The user confirmed that the distance is the shortest road connection (§ 9 Abs. 1 Nr. 4 Satz 4 EStG). */
      shortestRouteConfirmed: bool,
      secondShortestRouteConfirmed: bool,
    },
  },
  chLohnausweis: {
    perInstance: false,
    fields: {
      ...fromList(SALARY_CERTIFICATE_AMOUNT_FIELDS, amount),
      /** Ziffer 7 can be a correction and therefore negative (ADR-0093). */
      [SALARY_CERTIFICATE_SIGNED_FIELD]: signedAmount,
      bemerkungen: text(500),
      saeule3aChf: amount,
      krankenkasseChf: amount,
      /** Supplementary insurance (VVG): other provision, never basic health insurance (ADR-0093). */
      krankenkasseZusatzChf: amount,
      /** Anlage Vorsorgeaufwand Zeile 49: entitled to tax-free subsidies or employer contributions to health insurance. */
      kvZuschussAnspruch: bool,
      arbeitgeberName: text(100),
      arbeitgeberStrasse: text(100),
      arbeitgeberPlzOrt: text(100),
      familienzulagenChf: amount,
      /** Whether the family allowance is part of the gross wage of Ziffer 8; only then it is deducted (ADR-0093). */
      familienzulagenImBruttolohn: bool,
      krankentaggeldChf: amount,
      pkArbeitnehmerChf: amount,
      pkArbeitgeberChf: amount,
      pkArbeitgeberGesamtChf: amount,
      steuerfreiesKrankentaggeldChf: amount,
      krankentaggeldArbeitgeberProzent: percent,
      krankentaggeldArbeitgeberChf: amount,
      nbuvArbeitgeberProzent: percent,
      nbuvArbeitgeberChf: amount,
      /** Wechselkurs CHF→EUR (C4): the rate and what it is for — a year for the annual average, a month for the BMF monthly rate. */
      wechselkurs: { kind: 'decimal', min: 0.5, max: 2, places: 4 },
      wechselkursMonat: { kind: 'pattern', pattern: /^\d{4}(-(0[1-9]|1[0-2]))?$/, shape: 'JJJJ für den Jahresdurchschnitt oder JJJJ-MM für den Monatskurs' },
      /** „Keine Sonderfälle“ of the Anlage N-Gre: without the answer no N-Gre is printed (ADR-0091, Nachtrag). */
      nGreSonderfaelle: bool,
    },
  },
  rente: {
    perInstance: false,
    fields: {
      rentenart: oneOf(PENSION_TYPES),
      jahresbetrag: amount,
      rentenbeginnJahr: integer(1950, 2100),
      alterBeiRentenbeginn: integer(0, 120),
    },
  },
  kapital: {
    perInstance: false,
    fields: { ...fromList(CAPITAL_FIELDS, amount), inhaber: oneOf(['A', 'B', 'gemeinsam']) },
  },
  vermietung: {
    perInstance: true,
    fields: {
      mieteinnahmen: amount,
      anschaffungskosten: amount,
      baujahr: integer(1800, 2100),
      werbungskosten: amount,
      strasse: text(100),
      hausnummer: text(10),
      plz: text(10),
      city: text(100),
      livingArea: integer(1, 100_000),
      einheiten: integer(1, 999),
      depreciationAsLastYear: bool,
      umlagen: amount,
      schuldzinsen: amount,
      anteilA: percent,
    },
  },
  kind: {
    perInstance: true,
    fields: {
      firstName: text(100),
      lastName: text(100),
      geburtsdatum: date,
      taxId,
      childBenefitClaimEur: amount,
      kinship: oneOf(CHILD_RELATIONSHIPS),
      kinshipB: oneOf(CHILD_RELATIONSHIPS),
      familyBenefitsOffice: text(100),
      domesticResidenceAllYear: bool,
      otherParent: oneOf(OTHER_PARENT_STATUSES),
      otherParentName: text(100),
      otherParentBirthDate: date,
      otherParentAddress: text(200),
      otherParentKind: oneOf(OTHER_CHILD_RELATIONSHIPS),
      otherParentDiedOn: date,
      registeredWithMeAllYear: bool,
      childBenefitToMeAllYear: bool,
      healthBasicEur: { kind: 'amount', max: 9_999_999 },
      careEur: { kind: 'amount', max: 9_999_999 },
      swissFamilyAllowanceEur: { kind: 'amount', max: 9_999_999 },
      childcareEur: { kind: 'amount', max: 9_999_999 },
      childcareProvider: text(45),
      childcareFrom: text(10),
      childcareTo: text(10),
      swissFamilyAllowancePayer: oneOf(['A', 'B'] as const),
      healthInsuranceAbroad: bool,
    },
  },
  assessment: {
    perInstance: false,
    fields: {
      ...Object.fromEntries(ASSESSMENT_FIELDS.map((f) => [f.id, f.signed ? integer(-MAX_AMOUNT, MAX_AMOUNT) : amount])),
      assessmentDate: date,
    },
  },
}

/**
 * Fields whose name does not say what belongs in them. The Swiss pension fields are the reason this
 * exists: a model that read "pkArbeitnehmerChf" wrote the whole contribution although the user said
 * which part was obligatorisch (ADR-0072). Totals and the obligatorisch part go in separate fields,
 * so a sentence like "7.186 CHF, davon obligatorisch 2.892 CHF" needs no arithmetic.
 */
const HINTS: Readonly<Partial<Record<Screen, Readonly<Record<string, string>>>>> = {
  interview: {
    einkuenfte: 'Pflichtfrage: Kapitalerträge über dem Sparer-Pauschbetrag bzw. Freistellungsauftrag oder ohne deutschen Steuerabzug (z. B. ausländische Bank) = „Kapitalerträge“; Mieteinnahmen = „Vermietung“; nichts davon = „Nein“',
    'vorauszahlungen-gate': '„Ja“, wenn das Finanzamt für das Jahr Einkommensteuer-Vorauszahlungen festgesetzt hat',
    'vorauszahlungen-betrag': 'Summe aller für das Jahr gezahlten Vorauszahlungen in ganzen Euro: Einkommensteuer plus Solidaritätszuschlag plus Kirchensteuer zusammen, es gibt kein eigenes Soli-Feld (z. B. „26.004 Euro Einkommensteuer und 747 Euro Soli“ → 26751); die App setzt vorauszahlungen-gate dazu selbst auf „Ja“',
  },
  kind: {
    healthInsuranceAbroad: '„true“, wenn das Kind bei einer ausländischen Kasse versichert ist (z. B. Schweizer Grundversicherung); dann Anlage Kind Kz 89 statt Kz 66/67',
    swissFamilyAllowanceEur: 'Schweizer Kinder-/Familienzulage für dieses Kind in Euro im Jahr, wenn sie NICHT im Bruttolohn Ziffer 8 des Lohnausweises steckt; steckt sie drin, stattdessen chLohnausweis.familienzulagenChf (die App verteilt sie auf die Kinder)',
    childcareEur: 'Kinderbetreuungskosten, die die Eltern gezahlt haben (Kita, Tagesmutter, Hort), Euro im Jahr, ohne Verpflegung; Anlage Kind Kz 51',
    childcareProvider: 'Art der Betreuung und Anbieter, kurz (höchstens 45 Zeichen, sonst passt es nicht in Zeile 67), z. B. „Kita, Gemeinde Musterdorf“',
    childcareFrom: 'Beginn der Betreuung im Jahr, TT.MM.JJJJ',
    childcareTo: 'Ende der Betreuung im Jahr, TT.MM.JJJJ',
  },
  lstb: {
    sozialversicherung: 'Summe der Arbeitnehmeranteile; NICHT selbst addieren: nennt der Nutzer die Zeilen einzeln, lege rvArbeitnehmer, kvArbeitnehmer, pvArbeitnehmer und avArbeitnehmer an, die App bildet die Summe',
    rvArbeitnehmer: 'Zeile 23 a/b: Arbeitnehmeranteil zur Rentenversicherung',
    rvArbeitgeber: 'Zeile 22 a/b: Arbeitgeberanteil zur Rentenversicherung',
    kvArbeitnehmer: 'Zeile 25: Arbeitnehmerbeitrag zur gesetzlichen Krankenversicherung; ist sie gefüllt, MUSS Zeile 24 (zuschuesseKvPv, auch 0) beantwortet sein – frag danach',
    pvArbeitnehmer: 'Zeile 26: Arbeitnehmerbeitrag zur sozialen Pflegeversicherung; ist sie gefüllt, MUSS Zeile 24 (zuschuesseKvPv, auch 0) beantwortet sein',
    avArbeitnehmer: 'Zeile 27: Arbeitnehmerbeitrag zur Arbeitslosenversicherung',
    zuschuesseKvPv: 'Zeile 24 a–c zusammen: steuerfreie Arbeitgeberzuschüsse zur Kranken- und Pflegeversicherung; 0, wenn die Zeile leer ist',
    zuschussPv: 'Zeile 24c allein: der Pflegeversicherungs-Teil des steuerfreien Arbeitgeberzuschusses',
    solidaritaetszuschlag: 'Zeile 5: einbehaltener Solidaritätszuschlag, Euro mit Cent',
  },
  commute: {
    oneWayKm: 'einfache Entfernung in vollen km; es zählt die kürzeste Straßenverbindung (§ 9 Abs. 1 Nr. 4 Satz 4 EStG), nicht die gefahrene Strecke – sag das und frag, ob es die kürzeste ist (shortestRouteConfirmed)',
    travelDays: 'Tage, an denen die erste Tätigkeitsstätte auf diesem Weg tatsächlich aufgesucht wurde („an 205 Tagen“); ersetzt die Rechnung Arbeitstage − Urlaub − Krankheit − Homeoffice',
    secondTravelDays: 'tatsächliche Fahrtage auf dem zweiten Arbeitsweg',
    shortestRouteConfirmed: '„true“, wenn der Nutzer bestätigt hat, dass oneWayKm die kürzeste Straßenverbindung ist; nie ohne seine Antwort setzen',
    secondShortestRouteConfirmed: 'dieselbe Bestätigung für secondOneWayKm',
    professionalBodiesEur: 'Werbungskosten: Beiträge zu Berufsverbänden, z. B. Gewerkschaft (Anlage N Kz 310), Euro im Jahr',
    workEquipmentEur: 'Werbungskosten: Arbeitsmittel und typische Berufskleidung (Kz 320), Euro im Jahr; was es war, in workEquipmentNote',
    accountFeesEur: 'Werbungskosten: Kontoführungsgebühren (Kz 380); ohne Nachweis akzeptiert das Finanzamt 16 € im Jahr',
    otherWorkExpensesEur: 'Werbungskosten: Sonstiges wie Bewerbungen (Kz 380), Euro im Jahr; was es war, in otherWorkExpensesNote',
    periodFrom: 'Arbeitsweg gilt erst ab diesem Tag, TT.MM.JJJJ; leer = ab Jahresbeginn. Bei einem Arbeitgeberwechsel je Arbeitgeber fragen, ob ein Weg angesetzt wird; für einen Zeitraum ohne Weg gibt es keine Pauschale',
    periodTo: 'Arbeitsweg gilt nur bis zu diesem Tag (z. B. Arbeitgeberwechsel), TT.MM.JJJJ; leer = bis Jahresende',
    secondOneWayKm: 'zweiter Arbeitsweg nach einem Arbeitgeberwechsel im Jahr: einfache Entfernung in km',
    secondTransport: 'Verkehrsmittel des zweiten Arbeitswegs',
    secondFrom: 'zweiter Arbeitsweg ab, TT.MM.JJJJ (meist der Tag nach periodTo)',
    secondTo: 'zweiter Arbeitsweg bis, TT.MM.JJJJ; leer = bis Jahresende',
  },
  chLohnausweis: {
    'berufliche-vorsorge': 'Lohnausweis Ziffer 10: alle Arbeitnehmerbeiträge an die Pensionskasse, obligatorisch und überobligatorisch zusammen',
    pkArbeitnehmerChf: 'nur der obligatorische BVG-Teil (Säule 2a) der Arbeitnehmerbeiträge, N-Gre Zeile 84',
    pkArbeitgeberChf: 'nur der obligatorische BVG-Teil (Säule 2a) der Arbeitgeberbeiträge, N-Gre Zeile 87',
    pkArbeitgeberGesamtChf: 'alle Arbeitgeberbeiträge an die Pensionskasse, obligatorisch und überobligatorisch zusammen; den überobligatorischen Teil (Zeile 20) rechnet die App',
    krankentaggeldChf: 'Prämie des Arbeitnehmers zur Krankentaggeldversicherung, N-Gre Zeile 80, nicht das ausgezahlte Taggeld',
    steuerfreiesKrankentaggeldChf: 'ausgezahltes steuerfreies Krankentaggeld, NUR wenn es im Bruttolohn Ziffer 8 enthalten ist (N-Gre Zeile 9); der Lohnausweis sagt das nicht eindeutig: immer nachfragen und nur über `propose_two_paths` vorschlagen (ein Weg 0 = nicht abziehen, ein Weg der Betrag)',
    'andere-leistungen': 'Lohnausweis Ziffer 7; kann negativ sein (z. B. -75)',
    krankenkasseChf: 'nur die Grundversicherung nach KVG (Basisabsicherung), ohne Zusatzversicherungen; zeigt der Beleg die Aufteilung nicht, frag nach',
    krankenkasseZusatzChf: 'Zusatzversicherungen nach VVG (Spital-, Zahn-, Komplementärversicherung), sonstige Vorsorge und keine Basisabsicherung; 0, wenn es keine gibt',
    kvZuschussAnspruch: '„true“, wenn Anspruch auf steuerfreie Zuschüsse oder Arbeitgeberbeiträge zur Krankenversicherung besteht (Anlage Vorsorgeaufwand Zeile 49); bei Grenzgängern meist „false“',
    familienzulagenChf: 'Familien-/Kinderzulagen, NUR wenn sie im Bruttolohn Ziffer 8 des Lohnausweises enthalten sind (N-Gre Zeile 8); braucht das Begleitfeld familienzulagenImBruttolohn = „true“. Sonst gehört die Zulage zum Kind (kind.swissFamilyAllowanceEur), nie beides für dasselbe Geld',
    familienzulagenImBruttolohn: '„true“, wenn der Nutzer bestätigt hat, dass die Zulage im Bruttolohn Ziffer 8 enthalten ist; „false“, wenn nicht',
    nbuvArbeitgeberChf: 'Arbeitgeberanteil der NBUV-Prämie in CHF, nur nötig, wenn der Arbeitgeber 100 % zahlt',
    krankentaggeldArbeitgeberChf: 'Arbeitgeberanteil der Krankentaggeld-Prämie in CHF, nur nötig, wenn der Arbeitgeber 100 % zahlt',
    wechselkurs: 'Euro je 1 CHF, z. B. 1,065 = Jahresdurchschnitt 2025 (Anlage N-Gre); ohne wechselkursMonat gilt der Jahresdurchschnitt des Steuerjahrs',
    wechselkursMonat: 'JJJJ = Jahresdurchschnittskurs, JJJJ-MM = amtlicher BMF-Monatskurs dieses Monats; als Begleitfeld zu wechselkurs',
    nGreSonderfaelle: '„false“ = keine Sonderfälle der Anlage N-Gre (der Normalfall: täglich zurück, Arbeit in der Grenzzone), „true“ = es liegt ein Sonderfall vor (z. B. Wochenaufenthalt); ohne die Angabe druckt die App keine N-Gre',
  },
  kapital: {
    inhaber: 'wessen Depot: „A“ (Nutzer), „B“ (Person B) oder „gemeinsam“ (Gemeinschaftsdepot)',
    kapitalertraege:
      'Kapitalerträge vor Abzug des Sparer-Pauschbetrags (Steuerbescheinigung „Höhe der Kapitalerträge“); die App zieht den Pauschbetrag selbst ab. Nennt der Nutzer nur den Betrag über dem Freistellungsauftrag, ist hier dieser Betrag plus der genutzte Pauschbetrag einzutragen (z. B. „682 Euro über den Freistellungsaufträgen, 2.000 Euro verbraucht“ → 2682)',
    sparerPauschbetrag:
      'bereits genutzter Sparer-Pauschbetrag laut Steuerbescheinigung (über Freistellungsaufträge verbraucht), 0 nur wenn keiner genutzt wurde; „verbraucht“ heißt genutzt, bei Zusammenveranlagung meist 2000',
  },
  vermietung: {
    city: 'Ort des Mietobjekts',
    livingArea: 'Wohnfläche in m², ganze Zahl (Anlage V Zeile 10)',
    einheiten: 'Zahl der vermieteten Wohnungen im Gebäude (Anlage V Zeile 13)',
    depreciationAsLastYear: '„true“, wenn die AfA wie im Vorjahr weiterläuft (Anlage V Zeile 33)',
    umlagen: 'vereinnahmte Umlagen/Nebenkosten im Jahr, Euro (Anlage V Zeile 20)',
    schuldzinsen: 'Schuldzinsen für das Objekt im Jahr, Euro (Anlage V Zeile 46)',
    anteilA: 'Anteil des Nutzers am Objekt in Prozent, der Rest gehört Person B (Anlage V Zeile 86)',
  },
}

export const FIELD_CATALOG: readonly FieldSpec[] = SCREENS.flatMap((screen) =>
  Object.entries(DECLARED[screen].fields).map(([field, value]) => {
    const hint = HINTS[screen]?.[field]
    const personal = AI_FORBIDDEN_SCREENS.has(screen) || AI_FORBIDDEN_FIELDS.has(field) || AI_NEVER_FIELDS.has(field)
    return {
      screen,
      field,
      value,
      perInstance: DECLARED[screen].perInstance,
      aiWritable: !personal,
      personal,
      ...(hint !== undefined ? { hint } : {}),
    }
  }),
)

const BY_KEY: ReadonlyMap<string, FieldSpec> = new Map(FIELD_CATALOG.map((spec) => [`${spec.screen}.${spec.field}`, spec]))

export function fieldSpec(screen: string, field: string): FieldSpec | undefined {
  return BY_KEY.get(`${screen}.${field}`)
}

/** The fields of a screen, in catalogue order. */
export function fieldsOfScreen(screen: Screen): readonly FieldSpec[] {
  return FIELD_CATALOG.filter((spec) => spec.screen === screen)
}

export type FieldValueCheck =
  /** `value` is what should be stored: the input, tidied where that is unambiguous. */
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: string }

const invalid = (reason: string): FieldValueCheck => ({ ok: false, reason })
const valid = (value: string): FieldValueCheck => ({ ok: true, value })

const AMOUNT_UNITS = ['€', 'euro', 'eur', 'chf', 'fr.', 'fr'] as const

function withoutTrailingUnit(raw: string): string {
  const trimmed = raw.trimEnd()
  const unit = AMOUNT_UNITS.find((candidate) => trimmed.slice(-candidate.length).toLowerCase() === candidate)
  return unit === undefined ? raw : trimmed.slice(0, -unit.length)
}

/** `"5.000 €"`, `"5 000"`, `"5'000 CHF"`, `"5000,00"` → `"5000"`; anything with real decimals is refused. */
function tidyAmount(raw: string, signed = false): string | null {
  const unsigned = withoutTrailingUnit(raw).trim()
  // A typed minus, the typographic one, or the Swiss „–“ in front of the figure.
  const negative = signed && /^[-−–]\s*\d/.test(unsigned)
  const bare = negative ? unsigned.replace(/^[-−–]\s*/, '') : unsigned
  const tidy = tidyUnsignedAmount(bare)
  return tidy === null || !negative || tidy === '0' ? tidy : `-${tidy}`
}

function tidyUnsignedAmount(bare: string): string | null {
  const withoutZeroCents = bare.replace(/[.,]0{1,2}$/, '')
  const withoutGrouping = /^\d{1,3}([.\s'’]\d{3})+$/.test(withoutZeroCents) ? withoutZeroCents.replace(/[.\s'’]/g, '') : withoutZeroCents
  return /^\d+$/.test(withoutGrouping) ? String(Number(withoutGrouping)) : null
}

const fold = (input: string): string =>
  input
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '')

/** The canonical spelling of an enum value, if the input means exactly one of them. */
function canonical(values: readonly string[], raw: string): string | null {
  if (values.includes(raw)) return raw
  const matches = values.filter((value) => fold(value) === fold(raw))
  return matches.length === 1 ? matches[0]! : null
}

const TRUE_WORDS = new Set(['true', 'ja', 'yes', 'wahr'])
const FALSE_WORDS = new Set(['false', 'nein', 'no', 'falsch'])

function isRealDate(iso: string): boolean {
  const parsed = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso
}

function checkKind(kind: FieldValueKind, field: string, raw: string): FieldValueCheck {
  switch (kind.kind) {
    case 'amount': {
      const tidy = tidyAmount(raw, kind.signed === true)
      if (tidy === null) return invalid(`„${raw}“ ist kein Betrag in ganzen Einheiten (Beispiel: 1200).`)
      return Math.abs(Number(tidy)) <= kind.max ? valid(tidy) : invalid(`Der Betrag darf höchstens ${kind.max} sein.`)
    }
    case 'integer': {
      if (!/^-?\d+$/.test(raw)) return invalid(`„${raw}“ ist keine ganze Zahl.`)
      const n = Number(raw)
      return n >= kind.min && n <= kind.max ? valid(String(n)) : invalid(`Erlaubt ist eine ganze Zahl von ${kind.min} bis ${kind.max}.`)
    }
    case 'decimal': {
      const dotted = raw.replace(',', '.')
      const places = kind.places ?? 2
      if (!new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(dotted)) return invalid(`„${raw}“ ist keine Zahl mit höchstens ${places} Nachkommastellen.`)
      const n = Number(dotted)
      return n >= kind.min && n <= kind.max ? valid(dotted) : invalid(`Erlaubt ist eine Zahl von ${kind.min} bis ${kind.max}.`)
    }
    case 'enum': {
      const value = canonical(kind.values, raw)
      return value !== null ? valid(value) : invalid(`Erlaubt ist genau einer dieser Werte: ${kind.values.join(', ')}.`)
    }
    case 'boolean': {
      const word = raw.toLowerCase()
      if (TRUE_WORDS.has(word)) return valid('true')
      if (FALSE_WORDS.has(word)) return valid('false')
      return invalid('Erlaubt ist „true“ oder „false“.')
    }
    case 'date': {
      const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw)
      const iso = german ? `${german[3]}-${german[2]!.padStart(2, '0')}-${german[1]!.padStart(2, '0')}` : raw
      return /^\d{4}-\d{2}-\d{2}$/.test(iso) && isRealDate(iso) ? valid(iso) : invalid('Erlaubt ist ein Datum der Form JJJJ-MM-TT.')
    }
    case 'weekdays': {
      const days = [...new Set(raw.split(',').map((part) => part.trim()).filter((part) => part !== ''))]
      return days.length > 0 && days.every((day) => /^[1-7]$/.test(day))
        ? valid(days.join(','))
        : invalid('Erlaubt sind Wochentage als Ziffern 1–7 mit Komma, Mo–Fr = „1,2,3,4,5“.')
    }
    case 'pattern':
      return kind.pattern.test(raw) ? valid(raw) : invalid(`Erlaubt ist: ${kind.shape}.`)
    case 'digits': {
      const bare = raw.replace(/[\s./-]/g, '')
      return /^\d+$/.test(bare) && bare.length >= kind.min && bare.length <= kind.max ? valid(bare) : invalid(`Erlaubt ist: ${kind.shape}.`)
    }
    case 'iban': {
      // The same check the Stammdaten mask runs, check digits included.
      return isValidIban(raw) ? valid(normalizeIban(raw)) : invalid('Das ist keine gültige IBAN (Beispiel: DE89370400440532013000).')
    }
    case 'text':
      return raw.length <= kind.maxLength ? valid(raw) : invalid(`Höchstens ${kind.maxLength} Zeichen.`)
    case 'interview': {
      const step = field as EntryStepId
      const form = QUESTIONS[step].form
      const tidy = raw === AMOUNT_LATER ? raw : form.kind === 'enum' ? (canonical(form.values, raw) ?? raw) : (tidyAmount(raw) ?? raw)
      if (isValidAnswer(step, tidy)) return valid(tidy)
      return invalid(
        form.kind === 'enum'
          ? `Erlaubt ist genau einer dieser Werte: ${form.values.join(', ')}.`
          : `Erlaubt ist eine ganze Zahl von ${form.min} bis ${form.max}.`,
      )
    }
  }
}

/**
 * Checks a value someone wants to write into a field and returns what should be stored. Input
 * that means one thing only is tidied (`"5.000 €"` → `"5000"`, `"angestellt"` → `"Angestellt"`,
 * `"Ja"` → `"true"` for a yes/no field); everything else is refused with the reason, in German,
 * because the reason goes back to the model and, through it, to the user.
 */
export function validateFieldValue(screen: string, field: string, raw: string): FieldValueCheck {
  const spec = fieldSpec(screen, field)
  if (spec === undefined) return invalid(`Das Feld „${screen}.${field}“ gibt es nicht.`)
  const trimmed = raw.trim()
  if (trimmed.length === 0) return invalid('Der Wert ist leer.')
  return checkKind(spec.value, field, trimmed)
}

/** One line for the model: the field name, what a value looks like and, where the name is ambiguous, what belongs in it. */
export function describeFieldForPrompt(spec: FieldSpec): string {
  const shape = describeShape(spec)
  return spec.hint === undefined ? shape : `${shape.slice(0, -1)}; ${spec.hint})`
}

function describeShape(spec: FieldSpec): string {
  const { value } = spec
  switch (value.kind) {
    case 'amount':
      return value.signed ? `${spec.field} (Betrag, ganze Zahl, auch negativ)` : `${spec.field} (Betrag, ganze Zahl)`
    case 'integer':
      return `${spec.field} (ganze Zahl ${value.min}–${value.max})`
    case 'decimal':
      return `${spec.field} (Zahl ${value.min}–${value.max})`
    case 'enum':
      return `${spec.field} (${value.values.map((v) => `„${v}“`).join(' | ')})`
    case 'boolean':
      return `${spec.field} („true“ | „false“)`
    case 'date':
      return `${spec.field} (Datum JJJJ-MM-TT)`
    case 'weekdays':
      return `${spec.field} (Wochentage 1–7 mit Komma, Mo–Fr = „1,2,3,4,5“)`
    case 'pattern':
    case 'digits':
      return `${spec.field} (${value.shape})`
    case 'iban':
      return `${spec.field} (IBAN ohne Leerzeichen)`
    case 'text':
      return `${spec.field} (Text, höchstens ${value.maxLength} Zeichen)`
    case 'interview': {
      const form = QUESTIONS[spec.field as EntryStepId].form
      return form.kind === 'enum'
        ? `${spec.field} (${form.values.map((v) => `„${v}“`).join(' | ')})`
        : `${spec.field} (ganze Zahl ${form.min}–${form.max})`
    }
  }
}
