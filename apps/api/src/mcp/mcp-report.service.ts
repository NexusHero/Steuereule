import { Inject, Injectable, Logger } from '@nestjs/common'
import { buildRecordHandles, ENTRY_RULE_CODES, fieldsOfScreen, filingTypeComparison, progressionClauseFrom, provenanceKey, QUESTIONS, SCREENS, type AdvisorEstimateReading, type Answers, type EntryStepId, type Screen } from '@steuereule/core'
import { estimateReadingFrom } from '../advisor/advisor-case-digest.js'
import { describePrintoutGap } from '../advisor/advisor-printout-gaps.js'
import { buildPrintoutPlan } from '../advisor/advisor-printout-plan.js'
import { effectLeftOutOfEstimate } from '../advisor/advisor-shared.js'
import { HOUSEHOLD_AND_HEALTH_BOOSTERS } from '../config/features.js'
import { AssessmentService } from '../assessment/assessment.service.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import { admittedEntryIds, InterviewService } from '../interview/interview.service.js'
import { PrintoutService } from '../printout/printout.service.js'
import { TRANSACTION_RUNNER, type TransactionRunner } from '../common/transaction-runner.js'
import { TaxEstimateService } from '../tax-estimate/tax-estimate.service.js'
import { churchTaxLiableFrom } from './read-view.js'

/** Thrown on purpose at the end of a simulation: the transaction must never commit. */
class SimulationRollback extends Error {}

export interface AssistantReport {
  readonly taxYear: number
  readonly estimate: AdvisorEstimateReading | { readonly kind: 'unavailable' }
  /** `checked: false` when the pre-check could not run: then nothing is known to be ready. */
  readonly printout: { readonly checked: boolean; readonly ready: boolean; readonly gaps: readonly string[] }
  readonly unconfirmed: readonly { readonly annex: string; readonly count: number }[]
  readonly interview: { readonly openQuestions: number }
  readonly nextSteps: readonly string[]
}

export interface AssistantQuestion {
  readonly id: string
  readonly kind: 'question' | 'gate'
  readonly answers?: readonly string[]
}

/** One value written on trial; `dataUserId` is Person B's for a value of hers. */
export interface SimulationEntry {
  readonly screen: Screen
  readonly field: string
  readonly value: string
  readonly instance?: string | undefined
  readonly dataUserId?: string | undefined
}

export type SimulationResult =
  | { readonly ok: true; readonly beforeRefundEur: number; readonly afterRefundEur: number; readonly deltaEur: number; readonly hinweis?: string }
  | { readonly ok: false; readonly reason: string }

/**
 * The couple's church tax needs both spouses' confession (ADR-0063): with one still unknown it stays out of
 * the estimate, so an entry for one spouse alone moves nothing. Said, so a 0 is not read as "no effect".
 */
const CHURCH_TAX_STAYS_OPEN =
  'Die Kirchensteuer bleibt auch nach diesem Szenario offen, weil die Konfession oder Kirchensteuerpflicht einer der beiden Personen fehlt; sie fließt erst in die Schätzung, wenn beide vorliegen. Ein Unterschied von 0 € heißt deshalb nicht, dass die Angabe nichts bewirkt.'

const NOT_COMPUTABLE = 'Die Wirkung lässt sich gerade nicht berechnen.'

/**
 * The masks a year-to-year comparison looks at: those whose values belong to one year and one record. Master
 * data holds across years, a notice and a booking are of their year, children and rental objects are records
 * with ids of their own year (counted apart).
 */
const YEARLY_SCREENS: readonly Screen[] = SCREENS.filter((screen) => !['profil', 'stammdaten', 'assessment', 'buchung'].includes(screen))
const YEARLY_KEYS: readonly { readonly screen: Screen; readonly field: string; readonly key: string }[] = YEARLY_SCREENS.flatMap((screen) =>
  fieldsOfScreen(screen)
    .filter((spec) => !spec.perInstance)
    .map((spec) => ({ screen, field: spec.field, key: provenanceKey(screen, spec.field) })),
)
const isFilled = (value: string | null | undefined): boolean => value !== null && value !== undefined && value.trim() !== ''

/** The figures of the breakdown compared year to year, when both years have them. */
const COMPARED_FIGURES = ['summeDerEinkuenfteEur', 'vorsorgeAbzugEur', 'sonderausgabenEur', 'zuVersteuerndesEinkommenEur', 'einkommensteuerEur', 'angerechnetEur', 'ergebnisEur'] as const

const midpoint = (range: { readonly fromEur: number; readonly toEur: number }): number => Math.round((range.fromEur + range.toEur) / 2)

/**
 * What the user's assistant needs to tell its user how the return stands (ADR-0052 amendment 2):
 * the app's own estimate, what still blocks the printout, what the user has yet to confirm, the
 * questions only the user can answer, and what an entry would do to the refund. Figures and
 * labels only, never a name or an id of a person.
 */
@Injectable()
export class McpReportService {
  private readonly logger = new Logger('McpReport')

  constructor(
    @Inject(TaxEstimateService) private readonly estimate: TaxEstimateService,
    @Inject(PrintoutService) private readonly printout: PrintoutService,
    @Inject(ConfirmationService) private readonly confirmation: ConfirmationService,
    @Inject(InterviewService) private readonly interview: InterviewService,
    @Inject(AssessmentService) private readonly assessment: AssessmentService,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
  ) {}

  async report(userId: string, taxYear: number): Promise<AssistantReport> {
    const [estimate, gaps, overview, interview] = await Promise.all([
      this.estimate.getState(userId, taxYear).then(estimateReadingFrom, () => ({ kind: 'unavailable' as const })),
      this.printout.check(userId, taxYear).then((check) => check.missing, () => null),
      this.confirmation.overview(userId, taxYear),
      this.interview.getState(userId, taxYear),
    ])
    const unconfirmed = overview.annexes.filter((annex) => annex.unconfirmed > 0).map((annex) => ({ annex: annex.annex, count: annex.unconfirmed }))
    const nextSteps: string[] = []
    nextSteps.push(...(await this.churchTaxNotes(userId, taxYear)))
    if (gaps === null) nextSteps.push('Die Ausdruck-Vorprüfung ließ sich für dieses Jahr nicht ausführen: Sage dem Nutzer nicht, dass die Erklärung druckfertig ist.')
    if (interview.openItems > 0) nextSteps.push(`Das Interview hat noch ${interview.openItems} offene Frage(n): Nutzer fragen, dann mit maske_eintragen (Maske "interview") eintragen.`)
    if (gaps !== null && gaps.length > 0) nextSteps.push('Für den Ausdruck fehlen noch Angaben (siehe "gaps"): erfassen oder den Nutzer darum bitten.')
    if (unconfirmed.length > 0) nextSteps.push('Alles, was du eingetragen hast, ist unbestätigt: Der Nutzer prüft und bestätigt es je Anlage in der App („Prüfen & bestätigen“).')
    if (gaps !== null && gaps.length === 0 && unconfirmed.length === 0 && interview.openItems === 0) nextSteps.push('Alles erfasst und bestätigt: Der Nutzer kann den Ausdruck freischalten (zahllink_anfordern).')
    return {
      taxYear,
      estimate,
      printout: gaps === null ? { checked: false, ready: false, gaps: [] } : { checked: true, ready: gaps.length === 0, gaps: gaps.map(describePrintoutGap) },
      unconfirmed,
      interview: { openQuestions: interview.openItems },
      nextSteps,
    }
  }

  /** What is open about the church tax of the user (ADR-0052 amendment 3, 7): the yes/no, the confession, a contradiction. */
  private async churchTaxNotes(userId: string, taxYear: number): Promise<string[]> {
    const values = await this.confirmation.readRawValues(userId, taxYear, ['stammdaten.religion', 'stammdaten.kirchensteuerpflichtig'])
    const confession = churchTaxLiableFrom(values['stammdaten.religion'])
    const said = values['stammdaten.kirchensteuerpflichtig'] ?? null
    if (confession === null && said === null) return ['Kirchensteuerpflicht ist offen: Frage den Nutzer und trage stammdaten.kirchensteuerpflichtig („true“ oder „false“) ein.']
    if (confession === null && said === 'true') return ['Kirchensteuerpflichtig, aber die Konfession fehlt: Sie ist für den Satz und den Ausdruck nötig, und nur der Nutzer trägt sie in der App ein (Profil).']
    if (confession !== null && said !== null && String(confession) !== said) return ['Die Konfession, die der Nutzer eingetragen hat, widerspricht deiner Angabe „kirchensteuerpflichtig“; es gilt die Konfession. Kläre das mit dem Nutzer.']
    return []
  }

  /**
   * The open questions of every interview area the app asks (basic questions, Sonderausgaben, Lebenslagen,
   * Grenzgänger, Vorauszahlungen …): the facts only the user can give, area by area.
   */
  async openQuestions(userId: string, taxYear: number): Promise<{ readonly openQuestions: number; readonly next: AssistantQuestion | null; readonly bereiche: readonly { readonly bereich: string; readonly offen: number; readonly naechste: AssistantQuestion }[] }> {
    const bereiche: { bereich: string; offen: number; naechste: AssistantQuestion }[] = []
    for (const entry of admittedEntryIds(HOUSEHOLD_AND_HEALTH_BOOSTERS)) {
      const state = await this.interview.getState(userId, taxYear, entry)
      const step = state.nextStep
      if (step.kind === 'done' || step.id === undefined) continue
      // § 24b EStG is closed to married people; the app hides the area for them too.
      if (entry === 'alleinerziehend' && state.answers.familienstand === 'Verheiratet') continue
      const form = QUESTIONS[step.id as EntryStepId]?.form
      const answers = form?.kind === 'enum' ? [...form.values] : undefined
      bereiche.push({ bereich: entry, offen: state.openItems, naechste: { id: step.id, kind: step.kind, ...(answers ? { answers } : {}) } })
    }
    return { openQuestions: bereiche.reduce((sum, b) => sum + b.offen, 0), next: bereiche[0]?.naechste ?? null, bereiche }
  }

  /**
   * The way from the income to the result, in the figures of the app's own estimate (never recomputed):
   * what an assistant needs to explain the result and to find where a notice differs.
   */
  async breakdown(userId: string, taxYear: number): Promise<Record<string, unknown>> {
    const status = await this.estimate.getState(userId, taxYear)
    if (status.kind === 'offen') return { ok: false, grund: 'offen', fehlt: [...status.missing] }
    if (status.kind !== 'spanne') return { ok: false, grund: status.reason }
    // A range collapses to its figure where both ends agree, which is the rule once every line is known.
    const figure = (range: { readonly from: number; readonly to: number }) => (range.from === range.to ? range.from : { vonEur: range.from, bisEur: range.to })
    const steps = status.breakdown
    const child = steps?.childAllowance
    return {
      ok: true,
      taxYear,
      zusammenveranlagung: status.jointAssessment === true,
      ...(steps?.persons ? { personen: steps.persons.map((p, i) => ({ person: i === 0 ? 'A' : 'B', einkuenfteEur: p.incomeEur, werbungskostenEur: p.workExpensesEur, angerechneteSteuerEur: p.creditedTaxEur })) } : {}),
      ...(steps?.rentalSurplusEur !== undefined ? { vermietungEur: steps.rentalSurplusEur } : {}),
      ...(steps ? { summeDerEinkuenfteEur: steps.totalIncomeEur } : {}),
      vorsorgeAbzugEur: figure(status.provision),
      ...(steps?.provision ? { vorsorgeZeilen: steps.provision } : {}),
      sonderausgabenEur: status.specialExpenses,
      ...(steps ? { aussergewoehnlicheBelastungenEur: steps.extraordinaryBurdenEur } : {}),
      ...(child ? { kinder: { freibetragEur: child.allowanceEur, kindergeldEur: child.childBenefitEur, freibetragAngesetzt: child.used } } : {}),
      zuVersteuerndesEinkommenEur: figure(status.taxableIncome),
      ...(steps ? { tariflicheEinkommensteuerEur: figure(steps.tariffTax), steuerermaessigung35aEur: steps.householdReductionEur } : {}),
      ...(child?.used ? { hinzugerechnetesKindergeldEur: child.childBenefitEur } : {}),
      ...(steps?.capitalFlatTaxEur !== undefined ? { abgeltungsteuerEur: steps.capitalFlatTaxEur } : {}),
      einkommensteuerEur: figure(status.incomeTax),
      solidaritaetszuschlagEur: figure(status.solidaritaetszuschlag),
      kirchensteuer: status.churchTaxOpen ? 'offen: Kirchensteuerpflicht oder Konfession fehlt' : (status.churchTax ?? 'keine'),
      angerechnetEur: status.anrechnung,
      vorauszahlungenEur: status.prepayments ?? 0,
      ergebnisEur: figure(status.result),
      lesehilfe: 'einkommensteuerEur = tarifliche Steuer − § 35a + hinzugerechnetes Kindergeld + Abgeltungsteuer. ergebnisEur: positiv = Erstattung, negativ = Nachzahlung, nach Anrechnung und Vorauszahlungen.',
    }
  }

  /**
   * Joint against separate assessment (#548) from the case itself: the zvE of the app's own estimate, split
   * between the persons by their Einkünfte, through the core comparison. A typed partner income is not needed
   * and not taken. The split is an approximation (the deductions of each person are not kept apart).
   */
  async compareFilingTypes(userId: string, taxYear: number): Promise<Record<string, unknown>> {
    const [status, interview] = await Promise.all([this.estimate.getState(userId, taxYear), this.interview.getState(userId, taxYear)])
    if (status.kind === 'offen') return { ok: false, grund: 'Die Schätzung ist noch nicht möglich; ohne sie gibt es nichts zu vergleichen.', fehlt: [...status.missing] }
    if (status.kind !== 'spanne') return { ok: false, grund: 'Die Schätzung ist für dieses Jahr nicht möglich; ohne sie gibt es nichts zu vergleichen.' }
    const persons = status.breakdown?.persons ?? []
    if (persons.length !== 2) return { ok: false, grund: 'Es gibt keine Person B mit erfassten Angaben: Ein Vergleich der Veranlagungsarten setzt Ehe oder Lebenspartnerschaft und die Zahlen beider voraus.' }
    const [a, b] = persons as [(typeof persons)[number], (typeof persons)[number]]
    const zve = Math.max(0, Math.round(status.taxableIncome.to))
    const incomeA = Math.max(0, a.incomeEur)
    const incomeB = Math.max(0, b.incomeEur)
    const shareA = incomeA + incomeB === 0 ? 0.5 : incomeA / (incomeA + incomeB)
    const zveA = Math.round(zve * shareA)
    const zveB = zve - zveA
    let comparison: ReturnType<typeof filingTypeComparison>
    try {
      comparison = filingTypeComparison({ zveA, zveB, year: taxYear, progressionClause: progressionClauseFrom(interview.answers as Answers) })
    } catch {
      return { ok: false, grund: `Für ${taxYear} kennt die App den Tarif nicht.` }
    }
    return {
      ok: true,
      taxYear,
      aktuell: status.jointAssessment === true ? 'zusammen' : 'einzeln',
      zuVersteuerndesEinkommen: { personA: zveA, personB: zveB },
      einzelveranlagungEur: comparison.single,
      zusammenveranlagungEur: comparison.joint,
      differenzEur: comparison.delta,
      aussage: comparison.statement,
      ...(comparison.statement === 'eindeutig' ? { empfehlung: comparison.recommendation } : {}),
      ...(comparison.uncertainty.kind === 'unbestimmt' ? { offen: 'Lohnersatzleistungen (Progressionsvorbehalt) sind im Interview nicht beantwortet; frage den Nutzer (Frage "lohnersatz").' } : {}),
      lesehilfe: 'Beträge = Einkommensteuer + Solidaritätszuschlag, ohne Kirchensteuer. differenzEur = zusammen minus einzeln; negativ heißt, die Zusammenveranlagung spart. Näherung: Das zu versteuernde Einkommen der App ist im Verhältnis der Einkünfte auf beide aufgeteilt; Abzüge, die nur einer Person zustehen, verschieben das Ergebnis. „zu-knapp“: der Unterschied liegt innerhalb der Unsicherheit durch den Progressionsvorbehalt.',
    }
  }

  /**
   * This year beside the year before (#548): the breakdown of both, the change of the main figures, and the
   * fields that held a value last year and are empty now (names only, no values). The user's own fields; Person B's
   * and records with their own ids (children, rental objects) are not walked here.
   */
  async compareYears(userId: string, taxYear: number): Promise<Record<string, unknown>> {
    const prior = taxYear - 1
    const keys = YEARLY_KEYS.map((entry) => entry.key)
    const [now, before, valuesNow, valuesBefore] = await Promise.all([
      this.breakdown(userId, taxYear).catch(() => ({ ok: false })),
      this.breakdown(userId, prior).catch(() => ({ ok: false })),
      this.confirmation.readRawValues(userId, taxYear, keys),
      this.confirmation.readRawValues(userId, prior, keys),
    ])
    const filledBefore = YEARLY_KEYS.filter((entry) => isFilled(valuesBefore[entry.key]))
    if (before.ok !== true && filledBefore.length === 0) return { ok: false, grund: `Für ${prior} sind in diesem Konto keine Angaben erfasst; es gibt kein Vorjahr zum Vergleich.` }
    const emptyNow = new Map<Screen, string[]>()
    for (const entry of filledBefore) {
      if (isFilled(valuesNow[entry.key])) continue
      emptyNow.set(entry.screen, [...(emptyNow.get(entry.screen) ?? []), entry.field])
    }
    const change: Record<string, number> = {}
    for (const figure of COMPARED_FIGURES) {
      const a = (now as Record<string, unknown>)[figure]
      const b = (before as Record<string, unknown>)[figure]
      if (typeof a === 'number' && typeof b === 'number') change[figure] = Math.round((a - b) * 100) / 100
    }
    return {
      ok: true,
      taxYear,
      vorjahr: prior,
      diesesJahr: now,
      vorjahrZahlen: before,
      veraenderung: change,
      imVorjahrGefuelltJetztLeer: [...emptyNow].map(([screen, felder]) => ({ screen, felder })),
      lesehilfe: 'veraenderung = dieses Jahr minus Vorjahr (nur wo beide Jahre eine Zahl haben). imVorjahrGefuelltJetztLeer: Felder, die im Vorjahr einen Wert hatten und jetzt leer sind; frag den Nutzer, ob sie dieses Jahr wieder zutreffen, statt Werte zu übernehmen.',
    }
  }

  /**
   * What closes each gap of the printout and each fixed entry rule (ADR-0091, ADR-0093), as the in-app
   * advisor gets it: the field, whose it is, and whether the assistant may enter it or only the user.
   * Field names and neutral record names only; a child carries its `instance`.
   */
  async check(userId: string, taxYear: number, household: { readonly spouse: { readonly spouseUserId: string; readonly recordable: boolean } | null; readonly childIds: readonly string[] }): Promise<Record<string, unknown>> {
    const missing = await this.printout.check(userId, taxYear).then((check) => check.missing, () => null)
    if (missing === null) return { ok: false, grund: 'Die Ausdruck-Vorprüfung ließ sich für dieses Jahr nicht ausführen.' }
    const kinder = buildRecordHandles('kind', household.childIds)
    const plan = await buildPrintoutPlan({
      userId,
      taxYear,
      missing: [...missing, ...ENTRY_RULE_CODES],
      spouse: household.spouse,
      records: { kind: kinder },
      // The user's own assistant may enter personal fields (ADR-0052 §8).
      personalDataConsent: true,
      read: (dataUserId, year, keys) => this.confirmation.readRawValues(dataUserId, year, keys),
    })
    return {
      ok: true,
      taxYear,
      fragen: plan.questions.map((q) => ({
        betrifft: q.subject,
        frage: q.question,
        screen: q.screen,
        feld: q.field,
        ...(q.person === 'B' ? { person: 'B' } : {}),
        ...(q.record ? { instance: kinder.find((k) => k.handle === q.record)?.id ?? null } : {}),
        werTraegtEin: q.owlMayDraft ? 'du' : 'nur der Nutzer',
        sperrtAusdruck: q.required,
      })),
      nurNutzer: plan.unplanned.map(describePrintoutGap),
    }
  }

  /**
   * A notice beside the submitted return (ADR-0052 amendment 11, #546): the very Bescheid-Abgleich of the app
   * (ADR-0098 §8: the version frozen at submission against the Bescheid), each position with the effect of
   * the difference on the refund, and the appeal deadline. The diff and the effects are the core's; nothing
   * is recomputed here, and the Finanzamt's free text does not flow back (amendment 3, 5).
   */
  async compareAssessment(userId: string, taxYear: number): Promise<Record<string, unknown>> {
    const state = await this.assessment.getState(userId, taxYear)
    const diff = state.diff
    if (diff === null) {
      if (state.positions.every((position) => position.kind === 'offen')) return { ok: false, grund: 'Es ist kein Bescheid eingetragen: Trage seine Werte in die Maske "assessment" ein (maske_felder zeigt die Positionen).' }
      return { ok: false, grund: 'Für dieses Jahr gibt es keine abgegebene Erklärung, gegen die der Bescheid verglichen werden könnte: Der Nutzer gibt die Erklärung zuerst in der App ab. Die Schätzung der App ist kein Ersatz dafür.' }
    }
    const effects = new Map(diff.ownDeviations.map((deviation) => [deviation.position, deviation.refundEffect]))
    const positionen = diff.groups.flatMap((group) =>
      group.rows
        .filter((row) => row.status !== 'not_read' || row.assessed !== null || row.declared !== null)
        .map((row) => ({
          position: row.position,
          bezeichnung: row.label,
          erklaerungEur: row.declared,
          bescheidEur: row.assessed,
          abweichungEur: row.difference,
          status: row.status,
          ...(effects.has(row.position) ? { wirkungAufErstattungEur: effects.get(row.position) ?? null } : {}),
        })),
    )
    const frist = state.frist
    return {
      ok: true,
      taxYear,
      positionen,
      gesamtwirkungAufErstattungEur: diff.totalRefundEffect,
      wirkungenSummierenSichNicht: diff.effectsDifferFromTotal,
      einspruchsfrist: frist.deadlineEnd === null || frist.assessmentDate === null ? null : { bescheidVom: frist.assessmentDate, endetAm: frist.deadlineEnd, verbleibendeTage: frist.remainingDays, laeuft: frist.running },
      lesehilfe: 'Verglichen wird die abgegebene Erklärung (eingefrorene Fassung) mit dem Bescheid, nicht die heutige Schätzung. abweichungEur = Bescheid minus Erklärung. wirkungAufErstattungEur: was die Abweichung dieser einen Position für sich an der Erstattung ändert (positiv = mehr Erstattung); die App-Berechnung, nicht deine. „erstattung“: positiv = Erstattung, negativ = Nachzahlung. Die Steuer ist nicht linear: Ist wirkungenSummierenSichNicht wahr, ergeben die Einzelwirkungen nicht die Gesamtwirkung. Nenne dem Nutzer die Einspruchsfrist, wenn der Bescheid zu seinen Ungunsten abweicht.',
    }
  }

  /**
   * The refund before and after an entry, by the app's own estimate, through the very write path an
   * entry uses, inside a transaction that is always rolled back.
   */
  async simulate(userId: string, taxYear: number, screen: Screen, field: string, value: string, instance?: string, dataUserId: string = userId): Promise<SimulationResult> {
    return this.simulateEntries(userId, taxYear, [{ screen, field, value, instance, dataUserId }])
  }

  /** The same for several entries at once: one scenario, one refund before and after (#548). */
  async simulateEntries(userId: string, taxYear: number, entries: readonly SimulationEntry[]): Promise<SimulationResult> {
    // The write is rolled back only by a runner that says it rolls back, and never inside a transaction
    // already running (its commit would keep the write).
    const transactions = this.transactions
    if (!transactions.rollsBack || transactions.isActive()) return { ok: false, reason: 'Die Simulation steht in dieser Umgebung nicht zur Verfügung.' }
    // § 35a and § 33 are left out of the estimate while their boosters are off: 0 € would read as "brings nothing".
    for (const entry of entries) {
      const leftOut = effectLeftOutOfEstimate({ screen: entry.screen, instance: entry.instance ?? null, values: [[entry.field, entry.value]] }, HOUSEHOLD_AND_HEALTH_BOOSTERS)
      if (leftOut && leftOut.kind === 'not-computable') return { ok: false, reason: leftOut.hint }
    }
    let result: SimulationResult = { ok: false, reason: NOT_COMPUTABLE }
    try {
      await transactions.run(async () => {
        const before = estimateReadingFrom(await this.estimate.getState(userId, taxYear))
        for (const entry of entries) {
          // Whose field is written on trial: Person B's for a value of hers; the estimate is the couple's, read for the user.
          await this.confirmation.writeConfirmedByAdvisor(entry.dataUserId ?? userId, taxYear, provenanceKey(entry.screen, entry.field, entry.instance), entry.value, undefined, undefined, { personalDataConsent: true })
        }
        const after = estimateReadingFrom(await this.estimate.getState(userId, taxYear))
        if (before.kind === 'computed' && after.kind === 'computed') {
          const beforeRefundEur = midpoint(before.result)
          const afterRefundEur = midpoint(after.result)
          result = { ok: true, beforeRefundEur, afterRefundEur, deltaEur: afterRefundEur - beforeRefundEur, ...(after.churchTaxOpen ? { hinweis: CHURCH_TAX_STAYS_OPEN } : {}) }
        } else if (after.kind === 'computed') {
          result = { ok: false, reason: 'Mit dieser Angabe wird die Schätzung erstmals möglich; einen Unterschied zu vorher gibt es noch nicht.' }
        } else {
          result = { ok: false, reason: 'Die Wirkung ist erst berechenbar, wenn die Angaben für die Schätzung vollständig sind (z. B. die Lohnsteuerbescheinigung).' }
        }
        throw new SimulationRollback()
      })
    } catch (error) {
      if (!(error instanceof SimulationRollback)) {
        // The reason stays in our log; the external assistant gets no internals (ADR-0052 §8).
        this.logger.warn(`simulation failed for ${entries.map((entry) => entry.screen).join(',')}: ${error instanceof Error ? error.name : 'unknown'}`)
        return { ok: false, reason: NOT_COMPUTABLE }
      }
    }
    return result
  }
}
