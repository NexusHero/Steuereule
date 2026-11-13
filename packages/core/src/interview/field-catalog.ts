// The field catalogue (ADR-0066): one description per field of the return — which screen it
// belongs to, what a value has to look like, whether it hangs on a row (a child, a rental
// property), and whether the owl may propose it. Everything that needs to know a field reads this
// list: the value check on the owl's write path, the check when a draft is made, and the field
// list in the model's prompt. A field without a line here cannot be proposed.
import { CAPITAL_FIELDS } from '../domains/capital'
import { CHILD_RELATIONSHIPS, OTHER_CHILD_RELATIONSHIPS, OTHER_PARENT_STATUSES } from '../domains/children'
import { SALARY_CERTIFICATE_AMOUNT_FIELDS } from '../domains/cross-border'
import { WAGE_TAX_CERTIFICATE_FIELDS } from '../domains/lstb'
import { PENSION_TYPES } from '../domains/pension'
import { ASSESSMENT_FIELDS } from '../engine/assessment'
import { AMOUNT_LATER, QUESTIONS, isValidAnswer, type EntryStepId } from './interview'
import { SCREENS, type Screen } from './marking'

/** What a value has to look like. Stored values are strings; `kind` says which strings. */
export type FieldValueKind =
  /** Whole currency units, zero or more: `"1200"`. */
  | { readonly kind: 'amount'; readonly max: number }
  | { readonly kind: 'integer'; readonly min: number; readonly max: number }
  | { readonly kind: 'decimal'; readonly min: number; readonly max: number }
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
  /** False for everything that identifies a person: the owl never proposes it. */
  readonly aiWritable: boolean
  /** What belongs in the field, for the model, where the name alone is ambiguous (German, goes into the prompt). */
  readonly hint?: string
}

const MAX_AMOUNT = 999_999_999

/** Screens the owl never writes at all (identity, address, bank details, coupling). */
export const AI_FORBIDDEN_SCREENS: ReadonlySet<Screen> = new Set<Screen>(['profil', 'stammdaten', 'kopplung'])

/** Field names that identify a person or a third party, on whatever screen they appear. */
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
])

const amount: FieldValueKind = { kind: 'amount', max: MAX_AMOUNT }
const text = (maxLength: number): FieldValueKind => ({ kind: 'text', maxLength })
const integer = (min: number, max: number): FieldValueKind => ({ kind: 'integer', min, max })
const oneOf = (values: readonly string[]): FieldValueKind => ({ kind: 'enum', values })
const bool: FieldValueKind = { kind: 'boolean' }
const date: FieldValueKind = { kind: 'date' }
const percent: FieldValueKind = { kind: 'decimal', min: 0, max: 100 }

type Declared = Readonly<Record<string, FieldValueKind>>

const fromList = (fields: readonly string[], value: FieldValueKind): Declared => Object.fromEntries(fields.map((field) => [field, value]))

/** Every screen with its fields. The order within a screen is the order the prompt lists them in. */
const DECLARED: Readonly<Record<Screen, { readonly perInstance: boolean; readonly fields: Declared }>> = {
  profil: {
    perInstance: false,
    fields: { firstName: text(100), lastName: text(100), steuerId: text(20), steuernummer: text(20) },
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
      religion: text(10),
      familienstand: text(30),
      familienstandSeit: date,
      iban: text(40),
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
    fields: fromList(WAGE_TAX_CERTIFICATE_FIELDS, amount),
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
    },
  },
  chLohnausweis: {
    perInstance: false,
    fields: {
      ...fromList(SALARY_CERTIFICATE_AMOUNT_FIELDS, amount),
      bemerkungen: text(500),
      saeule3aChf: amount,
      krankenkasseChf: amount,
      arbeitgeberName: text(100),
      arbeitgeberStrasse: text(100),
      arbeitgeberPlzOrt: text(100),
      familienzulagenChf: amount,
      krankentaggeldChf: amount,
      pkArbeitnehmerChf: amount,
      pkArbeitgeberChf: amount,
      pkArbeitgeberGesamtChf: amount,
      steuerfreiesKrankentaggeldChf: amount,
      krankentaggeldArbeitgeberProzent: percent,
      krankentaggeldArbeitgeberChf: amount,
      nbuvArbeitgeberProzent: percent,
      nbuvArbeitgeberChf: amount,
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
    fields: fromList(CAPITAL_FIELDS, amount),
  },
  vermietung: {
    perInstance: true,
    fields: { mieteinnahmen: amount, anschaffungskosten: amount, baujahr: integer(1800, 2100), werbungskosten: amount },
  },
  kind: {
    perInstance: true,
    fields: {
      firstName: text(100),
      lastName: text(100),
      geburtsdatum: date,
      taxId: text(20),
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
  kind: {
    childcareEur: 'Kinderbetreuungskosten, die die Eltern gezahlt haben (Kita, Tagesmutter, Hort), Euro im Jahr, ohne Verpflegung; Anlage Kind Kz 51',
    childcareProvider: 'Art der Betreuung und Anbieter, kurz (höchstens 45 Zeichen, sonst passt es nicht in Zeile 67), z. B. „Kita, Gemeinde Musterdorf“',
    childcareFrom: 'Beginn der Betreuung im Jahr, TT.MM.JJJJ',
    childcareTo: 'Ende der Betreuung im Jahr, TT.MM.JJJJ',
  },
  commute: {
    professionalBodiesEur: 'Werbungskosten: Beiträge zu Berufsverbänden, z. B. Gewerkschaft (Anlage N Kz 310), Euro im Jahr',
    workEquipmentEur: 'Werbungskosten: Arbeitsmittel und typische Berufskleidung (Kz 320), Euro im Jahr; was es war, in workEquipmentNote',
    accountFeesEur: 'Werbungskosten: Kontoführungsgebühren (Kz 380); ohne Nachweis akzeptiert das Finanzamt 16 € im Jahr',
    otherWorkExpensesEur: 'Werbungskosten: Sonstiges wie Bewerbungen (Kz 380), Euro im Jahr; was es war, in otherWorkExpensesNote',
    periodFrom: 'Arbeitsweg gilt erst ab diesem Tag, TT.MM.JJJJ; leer = ab Jahresbeginn',
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
    steuerfreiesKrankentaggeldChf: 'ausgezahltes steuerfreies Krankentaggeld, im Bruttolohn Ziffer 8 enthalten, N-Gre Zeile 9',
    nbuvArbeitgeberChf: 'Arbeitgeberanteil der NBUV-Prämie in CHF, nur nötig, wenn der Arbeitgeber 100 % zahlt',
    krankentaggeldArbeitgeberChf: 'Arbeitgeberanteil der Krankentaggeld-Prämie in CHF, nur nötig, wenn der Arbeitgeber 100 % zahlt',
  },
}

export const FIELD_CATALOG: readonly FieldSpec[] = SCREENS.flatMap((screen) =>
  Object.entries(DECLARED[screen].fields).map(([field, value]) => {
    const hint = HINTS[screen]?.[field]
    return {
      screen,
      field,
      value,
      perInstance: DECLARED[screen].perInstance,
      aiWritable: !AI_FORBIDDEN_SCREENS.has(screen) && !AI_FORBIDDEN_FIELDS.has(field),
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

/** `"5.000 €"`, `"5 000"`, `"5'000 CHF"`, `"5000,00"` → `"5000"`; anything with real decimals is refused. */
function tidyAmount(raw: string): string | null {
  const bare = raw.replace(/\s*(€|eur|euro|chf|fr\.?)\s*$/i, '').trim()
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
      const tidy = tidyAmount(raw)
      if (tidy === null) return invalid(`„${raw}“ ist kein Betrag in ganzen Einheiten (Beispiel: 1200).`)
      return Number(tidy) <= kind.max ? valid(tidy) : invalid(`Der Betrag darf höchstens ${kind.max} sein.`)
    }
    case 'integer': {
      if (!/^-?\d+$/.test(raw)) return invalid(`„${raw}“ ist keine ganze Zahl.`)
      const n = Number(raw)
      return n >= kind.min && n <= kind.max ? valid(String(n)) : invalid(`Erlaubt ist eine ganze Zahl von ${kind.min} bis ${kind.max}.`)
    }
    case 'decimal': {
      const dotted = raw.replace(',', '.')
      if (!/^\d+(\.\d{1,2})?$/.test(dotted)) return invalid(`„${raw}“ ist keine Zahl mit höchstens zwei Nachkommastellen.`)
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
      return `${spec.field} (Betrag, ganze Zahl)`
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
