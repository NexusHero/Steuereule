// Fixed rules where a statement could be read two ways (ADR-0093). A real-data run showed the result
// depending on how the model understood an ambiguous sentence; each such spot is decided here, by the
// app: a draft is refused until the user confirmed what decides it, a value the model must not derive
// is filled in, and what has to be asked next is told to the model with the tool's answer.
import { formatChf } from '../common/format'
import type { ChDailyBenefitRemark } from '../domains/ch-salary-certificate-parser'
import {
  DAILY_BENEFIT_SOURCES,
  DAILY_BENEFIT_SOURCE_LABELS,
  ahvContributionFit,
  ahvContributionFitHint,
  dailyBenefitAmountField,
  isDailyBenefitSource,
  type DailyBenefitSource,
} from '../domains/daily-benefit'
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
  /** What the draft rests on in words: the user's message of this turn and the reason the model gave. */
  readonly said?: string | undefined
}

export type DraftRuleCheck = { readonly ok: true } | { readonly ok: false; readonly code: string; readonly reason: string }

const positive = (value: string | undefined): boolean => value !== undefined && /^\d+$/.test(value) && Number(value) > 0

const ALLOWANCE_NEEDS_CONFIRMATION =
  'Familien- oder Kinderzulagen ziehe ich nur vom Schweizer Bruttolohn ab, wenn sie im Bruttolohn Ziffer 8 des Lohnausweises enthalten sind. Frag den Nutzer: „Ist die Zulage im Bruttolohn Ziffer 8 enthalten?“ Bei Ja legst du den Entwurf noch einmal an, mit dem Begleitfeld familienzulagenImBruttolohn = „true“. Bei Nein gehört die Zulage zum Kind (kind.swissFamilyAllowanceEur, Euro im Jahr) und familienzulagenChf bleibt leer.'

const ALLOWANCE_TWICE =
  'Dieselbe Zulage darf nicht zweimal erfasst werden. Ist sie im Bruttolohn Ziffer 8 enthalten, reicht chLohnausweis.familienzulagenChf (die App verteilt sie auf die Kinder). Sonst gehört sie nur zum Kind (kind.swissFamilyAllowanceEur). Lege nur einen der beiden Entwürfe an.'

const SICK_PAY_NEEDS_TWO_PATHS =
  'Ausgezahltes Krankentaggeld wird nur abgezogen, wenn es im Bruttolohn Ziffer 8 enthalten ist; der Lohnausweis sagt das nicht eindeutig. Frag den Nutzer, ob das ausgezahlte Taggeld in Ziffer 8 enthalten ist, und schlage es mit `propose_two_paths` vor: ein Weg steuerfreiesKrankentaggeldChf = 0 (nicht abziehen), der andere der ausgezahlte Betrag (abziehen, Nachweis: Taggeld-Abrechnung des Versicherers). Nenne beide Eurowirkungen.'

const ACCIDENT_PAY_NEEDS_TWO_PATHS =
  'Ausgezahltes Unfalltaggeld (UVG/SUVA) wird nur abgezogen, wenn es im Bruttolohn Ziffer 8 enthalten ist; der Lohnausweis sagt das nicht eindeutig. Frag den Nutzer, ob das ausgezahlte Unfalltaggeld in Ziffer 8 enthalten ist, und schlage es mit `propose_two_paths` vor: ein Weg steuerfreiesUnfalltaggeldChf = 0 (nicht abziehen), der andere der ausgezahlte Betrag (abziehen, Nachweis: ergänzende Bescheinigung des Arbeitgebers oder Taggeld-Abrechnung der Unfallversicherung). Sag dazu, dass es steuerfrei ist, aber den Steuersatz erhöht (Progressionsvorbehalt, § 32b EStG). Nenne beide Eurowirkungen.'

const CAPITAL_NEEDS_AMOUNT =
  'Ein Depot, ein Konto mit Zinsen oder ein Freistellungsauftrag heißt: Es gibt Kapitalerträge, auch wenn der Freistellungsauftrag sie abdeckt. „Nein“ gilt nur, wenn der Nutzer ausdrücklich sagt, dass es keine Kapitalerträge gab. Lege stattdessen interview.einkuenfte = „Kapitalerträge“ an (mit Mieteinnahmen „Beides“) und frag nach der Steuerbescheinigung der Bank: Höhe der Kapitalerträge im Jahr (kapital.kapitalertraege), genutzter Sparer-Pauschbetrag (kapital.sparerPauschbetrag), einbehaltene Kapitalertragsteuer und Solidaritätszuschlag (auch 0).'

const CAPITAL_WORDS = /freistellungsauftr|depot|sparer-?pauschbetrag|kapitalertr|zinsen|dividende|tagesgeld|festgeld|wertpapier|\baktien\b|\betfs?\b/i
const NEGATION = /\bkein(?:e|en|em|er|erlei)?\b|\bnicht\b|\bnichts\b|\bnein\b|\bohne\b|\bweder\b/i

/**
 * Whether the words name capital income as something the user has: a part of a sentence that names a
 * deposit account, interest or an exemption order and does not deny it. „Kapitalerträge hatten wir
 * nicht“ and „kein Depot“ name none.
 */
export function namesCapitalIncome(said: string): boolean {
  // A dot between digits is a thousands separator (1.600 €), not the end of a sentence.
  return said.split(/(?<!\d)\.|\.(?!\d)|[;\n!?]/).some((part) => CAPITAL_WORDS.test(part) && !NEGATION.test(part))
}

/** The six answers as the user reads them: „…“, „…“ oder „…“. */
const SOURCE_ANSWERS = (() => {
  const labels = DAILY_BENEFIT_SOURCES.map((source) => `„${DAILY_BENEFIT_SOURCE_LABELS[source]}“`)
  return `${labels.slice(0, -1).join(', ')} oder ${labels[labels.length - 1]}`
})()

/** The stored values with their meaning, for the model. */
const SOURCE_VALUES = DAILY_BENEFIT_SOURCES.map((source) => `„${source}“ = ${DAILY_BENEFIT_SOURCE_LABELS[source]}`).join('; ')

/** The fixed question, the same in the mask, the owl and the MCP assistant (ADR-0072, Punkt 5). */
export const DAILY_BENEFIT_QUESTION = 'Woher kam das Taggeld im Bruttolohn (Ziffer 8) des Lohnausweises?'

/** What each answer does, in the words of the question. */
const SOURCE_EFFECT =
  'Nur das Taggeld einer Versicherung ist steuerfrei und wird abgezogen: bei „beides“ nur der Teil der Versicherung, die Aufstockung des Arbeitgebers bleibt Lohn; Unfalltaggeld (UVG/SUVA) erhöht außerdem den Steuersatz (Progressionsvorbehalt). Die Lohnfortzahlung des Arbeitgebers ohne Versicherung ist Lohn: Es wird nichts abgezogen. Ein Hinweis auf die Versicherung ist eine Bemerkung wie „KK-Taggeld Verrechnung“.'

/** Asked once per Swiss wage statement: the certificate does not say where a daily benefit in the gross wage came from. */
export const SICK_PAY_QUESTION = `Frag, falls noch nicht beantwortet, woher das Taggeld im Bruttolohn Ziffer 8 des Lohnausweises kam, mit genau diesen Antworten: ${SOURCE_ANSWERS}. Lege die Antwort als chLohnausweis.taggeldQuelle an (${SOURCE_VALUES}). Erst danach der Betrag laut Taggeld-Abrechnung: Krankentaggeldversicherung und Mutterschaft / IV in chLohnausweis.steuerfreiesKrankentaggeldChf, bei „beides“ nur den Teil der Versicherung in chLohnausweis.steuerfreiesKrankentaggeldChf (die Aufstockung des Arbeitgebers bleibt Lohn), Unfallversicherung in chLohnausweis.steuerfreiesUnfalltaggeldChf (steuerfrei, erhöht aber den Steuersatz); jeden Betrag über den Zwei-Wege-Vorschlag (\`propose_two_paths\`). Bei Lohnfortzahlung und ohne Taggeld wird nichts abgezogen (die App setzt steuerfreiesKrankentaggeldChf = 0). Eine Bemerkung wie „KK-Taggeld Verrechnung“ spricht für die Versicherung; ob die AHV/IV/EO- und ALV-Beiträge in Ziffer 9 zum Bruttolohn mit oder ohne das Taggeld passen, ist nur ein Hinweis (Ziffer 9 kann die NBU-Prämie enthalten), nie die Entscheidung.`

/** The same question as the app asks it itself, under a wage statement it has just read. */
export const SICK_PAY_QUESTION_FOR_USER = `Eine Frage zu diesem Lohnausweis: ${DAILY_BENEFIT_QUESTION} Zur Wahl: ${SOURCE_ANSWERS}. ${SOURCE_EFFECT} Nenn mir die Herkunft und den Betrag laut Taggeld-Abrechnung, oder sag, dass es keines gab.`

/** The question of the checklist (printout plan, MCP `pruefen`): the answer first, then the amount it needs. */
export const DAILY_BENEFIT_GAP_QUESTION = `${DAILY_BENEFIT_QUESTION} Zur Wahl: ${SOURCE_ANSWERS}; gespeichert als chLohnausweis.taggeldQuelle (${SOURCE_VALUES}). Danach der Betrag laut Taggeld-Abrechnung: Krankentaggeldversicherung und Mutterschaft / IV in chLohnausweis.steuerfreiesKrankentaggeldChf, bei „beides“ nur den Teil der Versicherung (die Aufstockung des Arbeitgebers bleibt Lohn), Unfallversicherung in chLohnausweis.steuerfreiesUnfalltaggeldChf (steuerfrei, erhöht aber den Steuersatz). Bei Lohnfortzahlung und ohne Taggeld wird nichts abgezogen. Anhaltspunkt, keine Entscheidung: Das Taggeld einer Versicherung ist kein AHV-pflichtiger Lohn; passen die AHV/IV/EO- und ALV-Beiträge in Ziffer 9 zum Bruttolohn ohne das Taggeld, spricht das für die Versicherung (Ziffer 9 kann auch die NBU-Prämie enthalten).`

/** Ziffer 8 and 9 of the statement just read, for the AHV hint under the question. */
export interface DailyBenefitHintContext {
  readonly taxYear: number
  readonly grossWageChf: number | null
  readonly ahvContributionsChf: number | null
  readonly familyAllowancesChf?: number | undefined
}

/** The AHV plausibility hint for a candidate amount, or null when a figure is missing. */
export function dailyBenefitHint(candidateChf: number | null, context: DailyBenefitHintContext | undefined): string | null {
  if (candidateChf === null || candidateChf <= 0 || !context || context.grossWageChf === null || context.ahvContributionsChf === null) return null
  const fit = ahvContributionFit({ taxYear: context.taxYear, grossWageChf: context.grossWageChf, ahvContributionsChf: context.ahvContributionsChf, candidateChf, familyAllowancesChf: context.familyAllowancesChf })
  return fit === null ? null : ahvContributionFitHint(fit)
}

/**
 * The question under a wage statement just read, with what its remarks say about a paid-out daily
 * benefit: the amount is named as the proposal, for a sickness benefit and for an accident benefit
 * (UVG/SUVA), which is tax-free as well but raises the tax rate. With Ziffer 8 and 9 known, the AHV
 * hint follows, never as the decision.
 */
export function sickPayQuestionForUser(remark: ChDailyBenefitRemark | null | undefined, context?: DailyBenefitHintContext): string {
  if (!remark) return SICK_PAY_QUESTION_FOR_USER
  const amount = remark.amountChf === null ? null : formatChf(remark.amountChf)
  const hint = dailyBenefitHint(remark.amountChf, context)
  const withHint = (text: string): string => (hint === null ? text : `${text} ${hint}`)
  if (remark.kind === 'accident') {
    return withHint(
      amount
        ? `Eine Frage zu diesem Lohnausweis: In den Bemerkungen steht ausgezahltes Unfalltaggeld (UVG/SUVA) über ${amount}. Ist es im Bruttolohn (Ziffer 8) enthalten? Nur dann wird es abgezogen. Unfalltaggeld wird anders behandelt als Krankentaggeld: Es ist steuerfrei, erhöht aber den Steuersatz (Progressionsvorbehalt). Unter dieser Nachricht stehen beide Wege zur Wahl: nicht abziehen, oder ${amount} abziehen (Nachweis: ergänzende Bescheinigung des Arbeitgebers oder Taggeld-Abrechnung der Unfallversicherung).`
        : 'Eine Frage zu diesem Lohnausweis: In den Bemerkungen steht ausgezahltes Unfalltaggeld (UVG/SUVA), aber kein Betrag. Ist es im Bruttolohn (Ziffer 8) enthalten, und welchen Betrag nennt die Taggeld-Abrechnung? Unfalltaggeld wird anders behandelt als Krankentaggeld: Es ist steuerfrei und wird vom Bruttolohn abgezogen, erhöht aber den Steuersatz (Progressionsvorbehalt).',
    )
  }
  return withHint(
    amount
      ? `Eine Frage zu diesem Lohnausweis: In den Bemerkungen steht ausgezahltes Krankentaggeld über ${amount}. ${DAILY_BENEFIT_QUESTION} Nur das Taggeld der Krankentaggeldversicherung wird abgezogen; die Lohnfortzahlung des Arbeitgebers ohne Versicherung ist Lohn. Zahlt die Versicherung einen Teil und der Arbeitgeber stockt auf, wird nur der Teil der Versicherung abgezogen. Unter dieser Nachricht stehen beide Wege zur Wahl: nicht abziehen (Lohnfortzahlung, oder das Taggeld ist nicht in Ziffer 8), oder ${amount} abziehen (Krankentaggeldversicherung; Nachweis: Taggeld-Abrechnung des Versicherers).`
      : `Eine Frage zu diesem Lohnausweis: In den Bemerkungen steht ausgezahltes Krankentaggeld, aber kein Betrag. ${DAILY_BENEFIT_QUESTION} Zur Wahl: ${SOURCE_ANSWERS}. Nur das Taggeld einer Versicherung wird abgezogen (bei „beides“ nur ihr Teil); nenn mir dafür den Betrag laut Taggeld-Abrechnung.`,
  )
}

/** The answer to the source question in this draft or in another draft of the same answer. */
function draftedSource(input: DraftRuleInput): DailyBenefitSource | null {
  const own = input.values.taggeldQuelle
  if (isDailyBenefitSource(own)) return own
  const other = input.others.find((draft) => draft.screen === 'chLohnausweis' && isDailyBenefitSource(draft.values.taggeldQuelle))
  return other ? (other.values.taggeldQuelle as DailyBenefitSource) : null
}

/** An amount that does not fit the answer: continued pay is wage, an accident benefit has its own field. */
function sourceMismatch(source: DailyBenefitSource, values: DraftValues): string | null {
  const field = dailyBenefitAmountField(source)
  const sickness = positive(values.steuerfreiesKrankentaggeldChf)
  const accident = positive(values.steuerfreiesUnfalltaggeldChf)
  if (field === null && (sickness || accident)) {
    return `Die Antwort „${DAILY_BENEFIT_SOURCE_LABELS[source]}“ heißt: Das Geld in Ziffer 8 ist Lohn (oder es gab kein Taggeld), es wird nichts abgezogen. Lege steuerfreiesKrankentaggeldChf = 0 an und keinen Betrag zum Abziehen. Hat der Nutzer etwas anderes gemeint, frag ihn noch einmal nach der Herkunft.`
  }
  if (field === 'steuerfreiesUnfalltaggeldChf' && sickness) {
    return 'Unfalltaggeld der Unfallversicherung (UVG/SUVA) gehört in chLohnausweis.steuerfreiesUnfalltaggeldChf, nicht in steuerfreiesKrankentaggeldChf: Es erhöht den Steuersatz (Progressionsvorbehalt).'
  }
  if (field === 'steuerfreiesKrankentaggeldChf' && accident) {
    return `Zur Antwort „${DAILY_BENEFIT_SOURCE_LABELS[source]}“ gehört der Betrag in chLohnausweis.steuerfreiesKrankentaggeldChf; steuerfreiesUnfalltaggeldChf ist nur für Unfalltaggeld (UVG/SUVA).`
  }
  return null
}

/** What to ask once the source is drafted and its amount is not. */
function amountFollowUp(source: DailyBenefitSource): string | null {
  const field = dailyBenefitAmountField(source)
  if (field === null) return null
  if (source === 'unfallversicherung') {
    return 'Frag nach dem Betrag des Unfalltaggelds (UVG/SUVA) laut Taggeld-Abrechnung, der im Bruttolohn Ziffer 8 enthalten ist, und schlage ihn mit `propose_two_paths` für chLohnausweis.steuerfreiesUnfalltaggeldChf vor (ein Weg 0, ein Weg der Betrag). Es ist steuerfrei, erhöht aber den Steuersatz (Progressionsvorbehalt, § 32b EStG).'
  }
  if (source === 'beides') {
    return 'Frag nach dem Betrag, den die Versicherung laut Taggeld-Abrechnung gezahlt hat: nur den Teil der Versicherung (z. B. 80 %), nicht die Aufstockung des Arbeitgebers, denn die Aufstockung bleibt Lohn. Schlage ihn mit `propose_two_paths` für chLohnausweis.steuerfreiesKrankentaggeldChf vor (ein Weg 0, ein Weg der Teil der Versicherung).'
  }
  return 'Frag nach dem Betrag laut Taggeld-Abrechnung, der im Bruttolohn Ziffer 8 enthalten ist, und schlage ihn mit `propose_two_paths` für chLohnausweis.steuerfreiesKrankentaggeldChf vor (ein Weg 0, ein Weg der Betrag; Nachweis: Taggeld-Abrechnung des Versicherers).'
}

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
    const source = draftedSource(input)
    const mismatch = source === null ? null : sourceMismatch(source, values)
    if (mismatch !== null) return { ok: false, code: 'SOURCE_MISMATCH', reason: mismatch }
    if (input.tool === 'stage' && positive(values.steuerfreiesKrankentaggeldChf)) {
      return { ok: false, code: 'TWO_PATHS_REQUIRED', reason: SICK_PAY_NEEDS_TWO_PATHS }
    }
    if (input.tool === 'stage' && positive(values.steuerfreiesUnfalltaggeldChf)) {
      return { ok: false, code: 'TWO_PATHS_REQUIRED', reason: ACCIDENT_PAY_NEEDS_TWO_PATHS }
    }
  }
  // „Weitere Einkünfte → Nein“ was concluded from „Depot mit Freistellungsaufträgen“ (real-data run): the
  // capital income was never recorded. An answer without capital income needs the user to say so.
  if (screen === 'interview' && (values.einkuenfte === 'Nein' || values.einkuenfte === 'Vermietung') && input.said !== undefined && namesCapitalIncome(input.said)) {
    return { ok: false, code: 'CONFIRMATION_REQUIRED', reason: CAPITAL_NEEDS_AMOUNT }
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
  // Continued pay of the employer is wage, and without a benefit there is nothing: the sickness field holds 0.
  if (screen === 'chLohnausweis' && isDailyBenefitSource(values.taggeldQuelle) && dailyBenefitAmountField(values.taggeldQuelle) === null && values.steuerfreiesKrankentaggeldChf === undefined) {
    return { steuerfreiesKrankentaggeldChf: '0' }
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
    // The source, or an amount in either daily-benefit field, answers the one question.
    if (positive(values['bruttolohn-total']) && !has('taggeldQuelle') && !has('steuerfreiesKrankentaggeldChf') && !has('steuerfreiesUnfalltaggeldChf')) {
      asks.push(SICK_PAY_QUESTION)
    }
    const source = values.taggeldQuelle
    if (isDailyBenefitSource(source)) {
      const field = dailyBenefitAmountField(source)
      const ask = amountFollowUp(source)
      if (field !== null && !has(field) && ask !== null) asks.push(ask)
    }
  }
  if (screen === 'interview') {
    if (positive(values['haushalt-handwerker-betrag'])) {
      asks.push('Handwerkerleistung (§ 35a Abs. 3 und 5 EStG): Frag, falls noch nicht gesagt, (1) ob die Rechnung per Überweisung bezahlt wurde (bar zählt nicht), (2) ob die Arbeit im eigenen Haushalt war (selbst bewohnte Wohnung oder Haus, kein Neubau) und (3) ob es dafür eine öffentliche Förderung gab (KfW, BAFA, Zuschuss oder zinsverbilligtes Darlehen; dann entfällt die Ermäßigung). Passt eines nicht, zieh den Entwurf mit `withdraw_draft` zurück.')
    }
    if (positive(values['spenden-betrag'])) {
      asks.push('Spende (§ 10b EStG): Es zählt das Jahr, in dem sie gezahlt wurde (§ 11 Abs. 2 EStG), nicht das Datum der Zuwendungsbestätigung. Frag, falls noch nicht gesagt, wann die Spende gezahlt wurde; liegt die Zahlung in einem anderen Jahr, gehört sie nicht in dieses Steuerjahr.')
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
export const ENTRY_RULE_CODES = [
  'regelLstb',
  'regelLstbPersonB',
  'regelArbeitsweg',
  'regelArbeitswegPersonB',
  'regelKrankenkasse',
  'regelKrankenkassePersonB',
  'regelKrankentaggeld',
  'regelKrankentaggeldPersonB',
  'regelKapital',
  'regelVorauszahlungen',
  'regelKindergeld',
] as const
export type EntryRuleCode = (typeof ENTRY_RULE_CODES)[number]
