// Fixed rules where a statement could be read two ways (ADR-0093). A real-data run showed the result
// depending on how the model understood an ambiguous sentence; each such spot is decided here, by the
// app: a draft is refused until the user confirmed what decides it, a value the model must not derive
// is filled in, and what has to be asked next is told to the model with the tool's answer.
import { fieldSpec } from './field-catalog'
import type { Screen } from './marking'

/** One field of a draft as it would be stored (already checked and tidied by the catalogue). */
export type DraftValues = Readonly<Record<string, string>>

export interface DraftRuleInput {
  readonly screen: Screen
  /** The main field and the companion fields of the draft. */
  readonly values: DraftValues
  /** `two-paths`: the draft is one of the two alternatives the user chooses between. */
  readonly tool: 'stage' | 'two-paths'
  /** The other drafts of the same answer. */
  readonly others: readonly { readonly screen: Screen; readonly values: DraftValues }[]
}

export type DraftRuleCheck = { readonly ok: true } | { readonly ok: false; readonly code: string; readonly reason: string }

const positive = (value: string | undefined): boolean => value !== undefined && /^\d+$/.test(value) && Number(value) > 0

const ALLOWANCE_NEEDS_CONFIRMATION =
  'Familien- oder Kinderzulagen ziehe ich nur vom Schweizer Bruttolohn ab, wenn sie im Bruttolohn Ziffer 8 des Lohnausweises enthalten sind. Frag den Nutzer: „Ist die Zulage im Bruttolohn Ziffer 8 enthalten?“ Bei Ja legst du den Entwurf noch einmal an, mit dem Begleitfeld familienzulagenImBruttolohn = „true“. Bei Nein gehört die Zulage zum Kind (kind.swissFamilyAllowanceEur, Euro im Jahr) und familienzulagenChf bleibt leer.'

const ALLOWANCE_TWICE =
  'Dieselbe Zulage darf nicht zweimal erfasst werden. Ist sie im Bruttolohn Ziffer 8 enthalten, reicht chLohnausweis.familienzulagenChf (die App verteilt sie auf die Kinder). Sonst gehört sie nur zum Kind (kind.swissFamilyAllowanceEur). Lege nur einen der beiden Entwürfe an.'

const SICK_PAY_NEEDS_TWO_PATHS =
  'Ausgezahltes Krankentaggeld wird nur abgezogen, wenn es im Bruttolohn Ziffer 8 enthalten ist; der Lohnausweis sagt das nicht eindeutig. Frag den Nutzer, ob das ausgezahlte Taggeld in Ziffer 8 enthalten ist, und schlage es mit `propose_two_paths` vor: ein Weg steuerfreiesKrankentaggeldChf = 0 (nicht abziehen), der andere der ausgezahlte Betrag (abziehen, Nachweis: Taggeld-Abrechnung des Versicherers). Nenne beide Eurowirkungen.'

/** Whether a draft may be made, by the fixed rules; the reason goes back to the model and, through it, to the user. */
export function checkDraftRules(input: DraftRuleInput): DraftRuleCheck {
  const { screen, values } = input
  if (screen === 'chLohnausweis') {
    if (positive(values.familienzulagenChf) && values.familienzulagenImBruttolohn !== 'true') {
      return { ok: false, code: 'CONFIRMATION_REQUIRED', reason: ALLOWANCE_NEEDS_CONFIRMATION }
    }
    if (positive(values.familienzulagenChf) && input.others.some((other) => other.screen === 'kind' && positive(other.values.swissFamilyAllowanceEur))) {
      return { ok: false, code: 'DOUBLE_ENTRY', reason: ALLOWANCE_TWICE }
    }
    if (input.tool === 'stage' && positive(values.steuerfreiesKrankentaggeldChf)) {
      return { ok: false, code: 'TWO_PATHS_REQUIRED', reason: SICK_PAY_NEEDS_TWO_PATHS }
    }
  }
  if (screen === 'kind' && positive(values.swissFamilyAllowanceEur) && input.others.some((other) => other.screen === 'chLohnausweis' && positive(other.values.familienzulagenChf))) {
    return { ok: false, code: 'DOUBLE_ENTRY', reason: ALLOWANCE_TWICE }
  }
  return { ok: true }
}

/**
 * Values the app adds to a draft itself, so the model neither has to remember nor derive them:
 * an amount of prepayments is only counted behind its „Ja“ gate.
 */
export function impliedCompanions(screen: Screen, values: DraftValues): DraftValues {
  if (screen === 'interview' && values['vorauszahlungen-betrag'] !== undefined && values['vorauszahlungen-gate'] === undefined) {
    return { 'vorauszahlungen-gate': 'Ja' }
  }
  return {}
}

/**
 * What the model has to ask after this draft, in German: the answer of the tool carries it, so the
 * question does not depend on the model remembering a rule.
 */
export function draftFollowUps(screen: Screen, values: DraftValues): string[] {
  const asks: string[] = []
  const has = (field: string): boolean => values[field] !== undefined
  if (screen === 'lstb') {
    if ((positive(values.kvArbeitnehmer) || positive(values.pvArbeitnehmer)) && !has('zuschuesseKvPv')) {
      asks.push('Zeile 25 oder 26 ist gefüllt: Frag nach Zeile 24 der Lohnsteuerbescheinigung (steuerfreie Arbeitgeberzuschüsse zur Kranken- und Pflegeversicherung, auch 0) und lege lstb.zuschuesseKvPv an. Bis dahin gilt die Sozialversicherung als unvollständig.')
    }
    if (has('sozialversicherung') && !has('kvArbeitnehmer')) {
      asks.push('Wenn der Nutzer die Zeilen 22 bis 27 einzeln nennt, lege sie einzeln an (rvArbeitnehmer, rvArbeitgeber, kvArbeitnehmer, pvArbeitnehmer, avArbeitnehmer); addiere nie selbst.')
    }
  }
  if (screen === 'commute') {
    if (positive(values.oneWayKm) && values.shortestRouteConfirmed !== 'true') {
      asks.push('Sag dem Nutzer, dass die kürzeste Straßenverbindung zählt (§ 9 Abs. 1 Nr. 4 Satz 4 EStG), nicht die gefahrene Strecke, und frag, ob die genannten Kilometer die kürzeste Strecke sind. Erst nach seinem Ja legst du commute.shortestRouteConfirmed = „true“ an.')
    }
    if (positive(values.secondOneWayKm) && values.secondShortestRouteConfirmed !== 'true') {
      asks.push('Frag auch für den zweiten Arbeitsweg, ob die Kilometer die kürzeste Straßenverbindung sind (commute.secondShortestRouteConfirmed).')
    }
    if (positive(values.oneWayKm) && !has('travelDays')) {
      asks.push('Frag, an wie vielen Tagen der Nutzer die Arbeitsstätte tatsächlich aufgesucht hat (commute.travelDays), oder nach Urlaubs-, Krankheits- und Homeoffice-Tagen.')
    }
  }
  if (screen === 'chLohnausweis') {
    if (positive(values.krankenkasseChf) && !has('krankenkasseZusatzChf')) {
      asks.push('Frag, ob im Krankenkassen-Betrag Zusatzversicherungen (VVG) stecken. krankenkasseChf ist nur die Grundversicherung nach KVG; den Zusatz legst du als chLohnausweis.krankenkasseZusatzChf an (0, wenn es keinen gibt).')
    }
  }
  return asks
}

/** The means of transport as the commute mask stores it; null means not entered. */
export interface StoredTransport {
  readonly transport: string | null
  readonly secondTransport: string | null
}

const WAYS_TO_WORK = [
  { km: 'oneWayKm', days: 'travelDays', transport: 'transport', which: 'den Arbeitsweg' },
  { km: 'secondOneWayKm', days: 'secondTravelDays', transport: 'secondTransport', which: 'den zweiten Arbeitsweg' },
] as const

/** The allowed values as the catalogue states them, „pkw“, „oepnv“ oder „andere“. */
function allowedValuesOf(field: string): string {
  const spec = fieldSpec('commute', field)
  const values = spec?.value.kind === 'enum' ? spec.value.values.map((value) => `„${value}“`) : []
  return values.length > 1 ? `${values.slice(0, -1).join(', ')} oder ${values[values.length - 1]}` : values.join('')
}

/**
 * A way to work only counts with its means of transport: without it no Entfernungspauschale is
 * computed, so a drafted distance or travel days would silently do nothing (real-data run). The
 * model is told so; the app never guesses the transport. `values` are this turn's commute values,
 * `stored` the mask's (undefined when unknown: then nothing is claimed to be missing).
 */
export function transportFollowUps(values: DraftValues, stored: StoredTransport | undefined): string[] {
  if (stored === undefined) return []
  const asks: string[] = []
  for (const way of WAYS_TO_WORK) {
    if (!positive(values[way.km]) && !positive(values[way.days])) continue
    if (values[way.transport] !== undefined || (stored[way.transport] ?? '') !== '') continue
    asks.push(
      `Die Entfernungspauschale für ${way.which} zählt erst mit dem Verkehrsmittel: commute.${way.transport} ist weder gespeichert noch in dieser Antwort angelegt. Hat der Nutzer es genannt, lege commute.${way.transport} an (${allowedValuesOf(way.transport)}); sonst frag ihn, womit er zur Arbeit gefahren ist. Rate es nicht.`,
    )
  }
  return asks
}

/** Checklist codes of the fixed rules; the plan asks them only while the stored values leave them open. */
export const ENTRY_RULE_CODES = ['regelLstb', 'regelLstbPersonB', 'regelArbeitsweg', 'regelArbeitswegPersonB', 'regelKrankenkasse', 'regelKrankenkassePersonB', 'regelKapital', 'regelVorauszahlungen'] as const
export type EntryRuleCode = (typeof ENTRY_RULE_CODES)[number]
