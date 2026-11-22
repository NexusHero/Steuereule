import { instanceForBusiness } from '../business/booking-field-access.js'
import {
  ADVISOR_LEGAL_SOURCES,
  addAmounts,
  amountCombination,
  childNamedIn,
  formatChf,
  formatEur,
  provenanceKey,
  sameReceiptAgain,
  sickPayQuestionForUser,
  dailyBenefitRecommendation,
  DAILY_BENEFIT_CONTRADICTION,
  DAILY_BENEFIT_RECOMMENDATION_REASON,
  type DailyBenefitHintContext,
  simulateAdvisorFieldDelta,
  sumFieldCombination,
  withPreviewedEffects,
  type AdvisorActionProposal,
  type AdvisorCountedItem,
  type AdvisorEngineInfo,
  type AdvisorMessageMeta,
  type AssignmentMember,
  type ChDailyBenefitRemark,
  type DailyBenefitSource,
  type ExistingValueSource,
  type LstbCalculationTerm,
  type LstbExtractedField,
  type LstbScanLine,
  type OwlSourceId,
  type ReceiptMark,
  type Screen,
  type WageTaxCertificateFieldId,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { type ChildRepository } from '../children/child.repository.js'
import { newActionId } from '../common/action-id.js'
import { assertAiWritable } from '../confirmation/ai-write-policy.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import { checkPiiFree } from '../ki/ki.adapter.js'
import { LinkService } from '../link/link.service.js'
import { OwlModeService } from '../owl-mode/owl-mode.service.js'
import { type TransactionRunner } from '../common/transaction-runner.js'
import { type ProfileRepository } from '../profile/profile.repository.js'
import { type AdvisorRepository } from './advisor.repository.js'
import { AdvisorCaseDigest } from './advisor-case-digest.js'
import { AdvisorDrafts } from './advisor-drafts.js'
import { toMessageDto, toPublicAction } from './advisor-shared.js'
import type { AdvisorChatMessageDto } from './dto/advisor.dto.js'

/** Commute-mask fields that are a year's total of several receipts. */
const ACCUMULATING_KEYS: ReadonlySet<string> = new Set([
  'commute.workEquipmentEur',
  'commute.otherWorkExpensesEur',
  'commute.professionalBodiesEur',
  'interview.fortbildung-kosten',
  'interview.umzug-kosten',
  'interview.haushalt-handwerker-betrag',
  'interview.haushalt-handwerker-rechnungsbetrag',
  'interview.spenden-betrag',
  'interview.gesundheit-betrag',
])

/** A field (of a person, of a child) whose receipts are counted so none counts twice. */
export interface CountTarget {
  readonly screen: Screen
  readonly field: string
  readonly person?: 'A' | 'B' | undefined
  readonly instance?: string | null | undefined
}

const EURO = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

/** A receipt read for one field (and its companions), for `stageReceiptProposal`. */
export interface ReceiptProposalInput {
  readonly screen: Screen
  readonly field: string
  readonly newValue: string
  readonly companionFields?: Readonly<Record<string, string>> | undefined
  readonly label: string
  readonly reason: string
  readonly sourceId: OwlSourceId
  readonly summaryText: string
  readonly engine: AdvisorEngineInfo
  /** The stored Beleg this proposal was read from: applying it records `{ kind: 'beleg' }` provenance. */
  readonly receiptId?: string | null | undefined
  /** The donations this receipt adds (hashed, ADR-0080); the draft carries them with those still waiting. */
  readonly countedItems?: readonly AdvisorCountedItem[] | undefined
  /** A receipt read from a photo or scan is never offered as read (ADR-0060). */
  readonly fromOcr?: boolean | undefined
  /** Whose Werbungskosten they are (ADR-0092 §2): B's go to B's own record. */
  readonly person?: 'A' | 'B' | undefined
  /** Whose data the draft writes: B's record for Person B. */
  readonly digestUserId?: string | undefined
  /** Issuer (hashed), amount and date of the receipt, to tell the same one again from another (§6). */
  readonly receiptMark?: ReceiptMark | undefined
}

/** A booking read from a business receipt (ADR-0101 §6, §18): the entry draft as JSON, checked by the core. */
export interface BookingProposalInput {
  /** Core `serializeBookingDraft`; the book checks it again when the user takes it. */
  readonly entry: string
  readonly label: string
  readonly reason: string
  readonly summaryText: string
  readonly engine: AdvisorEngineInfo
  readonly receiptId?: string | null | undefined
  readonly fromOcr?: boolean | undefined
  /** The business the draft books into (ADR-0101 §22); the first by default. */
  readonly business?: number | undefined
}

/** The fields of one scanned Lohnsteuerbescheinigung, for `stageLstbScanBatch`. */
export interface LstbScanBatchInput {
  readonly digestUserId?: string | undefined
  readonly receiptId: string | null
  readonly stage: 'deterministic' | 'llm_text_fallback'
  readonly taxYearOnDocument: number | null
  readonly person?: 'A' | 'B' | undefined
  /** Offer „zusätzlich“ and „ersetzen“ where a value is recorded already (the chat; the mask asks itself). */
  readonly askCombination?: boolean | undefined
  readonly engine: AdvisorEngineInfo
  readonly summaryText: string
  readonly fields: ReadonlyArray<{
    /** One of the three fields, or a further line of the mask (`LstbScanLine`). */
    readonly field: WageTaxCertificateFieldId | LstbScanLine
    readonly label: string
    readonly extracted: LstbExtractedField
  }>
}

/** The fields read from an uploaded document other than the LStB, for `stageDocumentDrafts`. */
export interface DocumentDraftsInput {
  readonly screen: Screen
  readonly person: 'A' | 'B'
  readonly digestUserId: string
  readonly receiptId: string | null
  readonly engine: AdvisorEngineInfo
  readonly summaryText: string
  readonly sourceId: OwlSourceId
  /** A paid-out daily benefit a Lohnausweis names in its remarks: the question about it carries the amount. */
  readonly dailyBenefit?: ChDailyBenefitRemark | null | undefined
  readonly fields: ReadonlyArray<{
    readonly field: string
    readonly label: string
    /** A whole amount, or a text such as a date for the fields that take one. */
    readonly value: number | string
    readonly status: 'ok' | 'pruefen'
    readonly reason: LstbExtractedField['reason']
    /** Another mask than `screen` for this field (a child's Anlage Kind beside the parent's mask). */
    readonly screen?: Screen | undefined
    /** The row this field belongs to (a child). */
    readonly instance?: string | undefined
    /** Add to what is recorded or waiting instead of replacing it (a second insurer in the year, ADR-0080). */
    readonly accumulate?: boolean | undefined
    /** What this document counts into the field, so it is not counted again. */
    readonly countedItems?: readonly AdvisorCountedItem[] | undefined
  }>
}

/** The names on record for Person A and, in a joint return, Person B (`householdNames`). */
export interface HouseholdNames {
  A: { firstName: string | null; lastName: string | null }
  B: { firstName: string | null; lastName: string | null; recordable: boolean } | null
}

/** Chat-facing reason of a scanned LStB proposal, e.g. „Zeile 23a (5.051,76 €) + Zeile 25 (…)“. */
function describeLstbCalculation(terms: readonly LstbCalculationTerm[]): string {
  if (terms.length === 0) return 'Aus Lohnsteuerbescheinigung extrahierter Wert (§ 9 Abs. 1 EStG).'
  return `Aus Lohnsteuerbescheinigung: ${terms.map((t) => `Zeile ${t.line} (${EURO.format(t.amount)})`).join(' + ')}`
}

/** A raw amount of a draft as people read it; a value that is no number is shown as it is. */
function eurText(raw: string): string {
  const amount = Number(raw)
  return raw.trim() !== '' && Number.isFinite(amount) ? formatEur(amount) : `${raw} €`
}

/**
 * Drafts read from documents (a receipt, an LStB scan, another form) staged as one owl message each
 * (Zero-Write), how a document's amount meets what a field already holds, and taking a document back.
 */
export class AdvisorDocumentStaging {
  constructor(
    private readonly advisorRepo: AdvisorRepository,
    private readonly owlModeService: OwlModeService,
    private readonly confirmationService: ConfirmationService,
    private readonly auditService: AuditService,
    private readonly transactions: TransactionRunner,
    private readonly caseDigest: AdvisorCaseDigest,
    private readonly drafts: AdvisorDrafts,
    private readonly profileRepo: ProfileRepository | undefined,
    private readonly link: LinkService | undefined,
    private readonly childRepo: ChildRepository | undefined,
  ) {}

  async stageReceiptProposal(
    userId: string,
    taxYear: number,
    input: ReceiptProposalInput,
  ): Promise<{ action: AdvisorActionProposal; assistantMessage: AdvisorChatMessageDto }> {
    assertAiWritable(input.screen, input.field)
    for (const companionField of Object.keys(input.companionFields ?? {})) assertAiWritable(input.screen, companionField)
    checkPiiFree(input)

    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) {
      await this.owlModeService.setSetting(userId, true)
    }

    const person = input.person ?? 'A'
    const dataUserId = input.digestUserId ?? userId
    const digest = await this.caseDigest.buildCaseDigest(dataUserId, taxYear)
    const counted = input.countedItems
    const proposal = (value: string, extra: Partial<AdvisorActionProposal> = {}): AdvisorActionProposal => {
      const sim = simulateAdvisorFieldDelta(digest, input.screen, input.field, value)
      return {
        actionId: newActionId(),
        status: 'pending',
        screen: input.screen,
        field: input.field,
        instance: null,
        // Person B's Werbungskosten go into B's own record (ADR-0092 §2).
        ...(person === 'B' ? { person: 'B' as const } : {}),
        ...(input.companionFields ? { companionFields: input.companionFields } : {}),
        label: input.label,
        previousValue: sim.previousValue,
        expectedPreviousValue: sim.previousValue,
        newValue: value,
        beforeRefundEur: sim.beforeRefundEur,
        afterRefundEur: sim.afterRefundEur,
        deltaEur: sim.deltaEur,
        reason: input.reason,
        sourceId: input.sourceId,
        paragraph: ADVISOR_LEGAL_SOURCES[input.sourceId].paragraph,
        ...(input.receiptId ? { receiptId: input.receiptId } : {}),
        ...(input.fromOcr ? { confidenceStatus: 'pruefen' as const, fieldReason: 'ocr_source' as const } : {}),
        ...(counted ? { countedItems: counted } : {}),
        ...(input.receiptMark ? { receiptMark: input.receiptMark } : {}),
        ...extra,
      }
    }
    const target = { screen: input.screen, field: input.field, person }
    const existing = /^\d+$/.test(input.newValue) ? await this.existingAmount(userId, taxYear, dataUserId, target, input.receiptId ?? null) : null
    // A sum's companions (a craftsman's invoice total) add up with it.
    const companionsAdded = async (): Promise<Record<string, string> | undefined> => {
      if (!input.companionFields) return undefined
      const entries: [string, string][] = []
      for (const [field, value] of Object.entries(input.companionFields)) {
        const key = `${input.screen}.${field}`
        if (!ACCUMULATING_KEYS.has(key) || !/^\d+$/.test(value)) {
          entries.push([field, value])
          continue
        }
        const base = existing?.companions?.[field] ?? (await this.confirmationService.readRawValue(dataUserId, taxYear, key).catch(() => null))
        entries.push([field, base !== null && base !== undefined && /^\d+$/.test(base) ? addAmounts(base, value) : value])
      }
      return Object.fromEntries(entries)
    }
    // A year's total built from several receipts (ADR-0092 §6): another receipt adds up without a question,
    // the same receipt again (a copy, a correction) asks „zusätzlich oder ersetzen?“. A field that holds one
    // value (a premium, a wage) asks whenever another source is in it.
    const sumField = ACCUMULATING_KEYS.has(`${input.screen}.${input.field}`)
    const how =
      existing === null
        ? 'write'
        : sumField
          ? sumFieldCombination(existing.value, input.newValue, existing.source, input.receiptMark !== undefined && sameReceiptAgain(input.receiptMark, existing.marks))
          : amountCombination(existing.value, input.newValue, existing.source)
    const drafts: AdvisorActionProposal[] = []
    if (how === 'write') drafts.push(proposal(input.newValue))
    else if (how === 'add') {
      const companions = await companionsAdded()
      const sum = addAmounts(existing!.value!, input.newValue)
      drafts.push(
        proposal(sum, {
          reason: `${input.reason} Bisher ${eurText(existing!.value!)}, dieser Beleg ${eurText(input.newValue)}: zusammen ${eurText(sum)}.`,
          ...(companions ? { companionFields: companions } : {}),
          ...(counted ? { countedItems: [...existing!.counted, ...counted] } : {}),
        }),
      )
    } else {
      const [add, replace] = combinationDrafts(proposal, input.label, existing!, input.newValue, counted)
      const companions = await companionsAdded()
      drafts.push({ ...add, ...(companions ? { companionFields: companions } : {}) }, replace)
    }

    // One draft, or the two ways „zusätzlich“ / „ersetzen“ as alternatives of one answer.
    const enrichedMeta = await this.withEstimateEffects(userId, taxYear, await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, {
      sources: [input.sourceId],
      ...(drafts.length === 1 ? { action: drafts[0]! } : { actions: drafts }),
    }))

    await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(enrichedMeta))

    const assistantMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      role: 'assistant',
      content: input.summaryText,
      meta: { ...enrichedMeta, engine: input.engine },
    })

    return {
      action: toPublicAction((enrichedMeta.action ?? enrichedMeta.actions?.[0])!),
      assistantMessage: toMessageDto(assistantMessage),
    }
  }

  /**
   * A booking draft from a receipt (ADR-0101 §18): one pending draft on the `buchung` mask, its own
   * reference as instance, so taking it posts exactly one entry and its undo posts the Storno.
   */
  async stageBookingProposal(userId: string, taxYear: number, input: BookingProposalInput): Promise<{ action: AdvisorActionProposal; assistantMessage: AdvisorChatMessageDto }> {
    assertAiWritable('buchung', 'entry')
    checkPiiFree({ label: input.label, reason: input.reason, summaryText: input.summaryText })
    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) await this.owlModeService.setSetting(userId, true)
    const action: AdvisorActionProposal = {
      actionId: newActionId(),
      status: 'pending',
      screen: 'buchung',
      field: 'entry',
      instance: instanceForBusiness(input.business ?? 1, `beleg-${input.receiptId ?? newActionId()}`),
      label: input.label,
      previousValue: null,
      expectedPreviousValue: null,
      newValue: input.entry,
      beforeRefundEur: 0,
      afterRefundEur: 0,
      deltaEur: 0,
      effect: 'not-computable',
      effectHint: 'Die Wirkung zeigt die Schätzung, sobald die Buchung übernommen ist.',
      reason: input.reason,
      sourceId: 'estg-4-3',
      paragraph: ADVISOR_LEGAL_SOURCES['estg-4-3'].paragraph,
      ...(input.receiptId ? { receiptId: input.receiptId } : {}),
      ...(input.fromOcr ? { confidenceStatus: 'pruefen' as const, fieldReason: 'ocr_source' as const } : {}),
    }
    const meta = await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, { sources: ['estg-4-3'], action })
    await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(meta))
    const assistantMessage = await this.advisorRepo.createMessage({ userId, taxYear, role: 'assistant', content: input.summaryText, meta: { ...meta, engine: input.engine } })
    return { action: toPublicAction((meta.action ?? meta.actions?.[0])!), assistantMessage: toMessageDto(assistantMessage) }
  }

  async stageLstbScanBatch(
    userId: string,
    taxYear: number,
    input: LstbScanBatchInput,
  ): Promise<{ actions: AdvisorActionProposal[]; assistantMessage: AdvisorChatMessageDto }> {
    for (const item of input.fields) {
      assertAiWritable('lstb', item.field)
    }

    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) {
      await this.owlModeService.setSetting(userId, true)
    }

    const digest = await this.caseDigest.buildCaseDigest(input.digestUserId ?? userId, taxYear)
    const rawActions: AdvisorActionProposal[] = []
    // The drafts the LStB mask takes over itself; an alternative „zusätzlich“ is the chat's own choice.
    const scanActionIds: string[] = []
    for (const item of input.fields) {
      const valueStr = item.extracted.value !== null ? String(item.extracted.value) : ''
      const draft = (value: string, extra: Partial<AdvisorActionProposal> = {}): AdvisorActionProposal => {
        const sim = item.extracted.value !== null ? simulateAdvisorFieldDelta(digest, 'lstb', item.field, value) : { previousValue: null, beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0 }
        return {
          actionId: newActionId(),
          status: 'pending',
          screen: 'lstb',
          field: item.field,
          instance: null,
          // A partner's LStB writes into B's record and must not replace the user's own drafts.
          ...(input.person === 'B' ? { person: 'B' as const } : {}),
          label: item.label,
          previousValue: sim.previousValue,
          expectedPreviousValue: sim.previousValue,
          newValue: value,
          beforeRefundEur: sim.beforeRefundEur,
          afterRefundEur: sim.afterRefundEur,
          deltaEur: sim.deltaEur,
          reason: describeLstbCalculation(item.extracted.calculation),
          sourceId: 'estg-9-1',
          paragraph: ADVISOR_LEGAL_SOURCES['estg-9-1'].paragraph,
          ...(input.receiptId ? { receiptId: input.receiptId } : {}),
          confidenceStatus: item.extracted.status,
          sourceLines: item.extracted.sourceLines,
          calculation: item.extracted.calculation,
          fieldReason: item.extracted.reason,
          ...extra,
        }
      }
      // The mask asks „hinzufügen oder ersetzen“ itself; the chat gets both ways as drafts (ADR-0092 §6).
      // Soli has cents: no „zusätzlich“ sum of whole amounts for it, a plain draft.
      const existing =
        input.askCombination === true && item.extracted.value !== null && /^\d+$/.test(valueStr)
          ? await this.existingAmount(userId, taxYear, input.digestUserId ?? userId, { screen: 'lstb', field: item.field, person: input.person ?? 'A' }, input.receiptId)
          : null
      if (existing === null || amountCombination(existing.value, valueStr, existing.source) === 'write') {
        const plain = draft(valueStr)
        rawActions.push(plain)
        scanActionIds.push(plain.actionId)
        continue
      }
      const [add, replace] = combinationDrafts(draft, item.label, existing, valueStr, undefined)
      rawActions.push(add, replace)
      scanActionIds.push(replace.actionId)
    }

    const initialMeta: AdvisorMessageMeta = {
      sources: ['estg-9-1'],
      actions: rawActions,
      lstbScan: {
        receiptId: input.receiptId,
        stage: input.stage,
        taxYearOnDocument: input.taxYearOnDocument,
        ...(input.person !== undefined ? { person: input.person } : {}),
        actionIds: scanActionIds,
      },
    }

    const enrichedMeta = await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, initialMeta)
    checkPiiFree(enrichedMeta)
    await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(enrichedMeta))

    const assistantMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      role: 'assistant',
      content: input.summaryText,
      meta: { ...enrichedMeta, engine: input.engine },
    })

    return {
      actions: (enrichedMeta.actions ?? []).map((a) => toPublicAction(a)),
      assistantMessage: toMessageDto(assistantMessage),
    }
  }

  /**
   * The names on record for Person A and, in a joint return, Person B: only to tell whose document
   * an upload is. They never go into a draft, a message or a prompt.
   */
  async householdNames(
    userId: string,
    taxYear: number,
  ): Promise<HouseholdNames> {
    const [profile, spouse] = await Promise.all([this.profileRepo?.findByUserId(userId), this.link?.spouseForAdvisor(userId, taxYear)])
    return {
      A: { firstName: profile?.firstName ?? null, lastName: profile?.lastName ?? null },
      B: spouse ? { firstName: spouse.firstName, lastName: spouse.lastName, recordable: spouse.recordable } : null,
    }
  }

  /**
   * The household of the year for the assignment of documents (ADR-0092): A, B in a joint return and the
   * children, with the names on record. Only to tell whose a document is; never in a draft or a prompt.
   */
  async householdMembers(userId: string, taxYear: number): Promise<AssignmentMember[]> {
    const names = await this.householdNames(userId, taxYear)
    const children = (await this.childRepo?.listForUserAndYear(userId, taxYear)) ?? []
    return [
      { ref: 'A', ...names.A },
      ...(names.B ? [{ ref: 'B' as const, firstName: names.B.firstName, lastName: names.B.lastName }] : []),
      ...children.map((c) => ({ ref: `kind:${c.id}` as const, firstName: c.firstName || null, lastName: c.lastName || null })),
    ]
  }

  /**
   * Drafts read from an uploaded document, for Person A or B, in one owl message (Zero-Write: nothing
   * is written until the user applies them). The LStB scan has its own path; this one is for other
   * forms such as the Swiss Lohnausweis.
   */
  async stageDocumentDrafts(
    userId: string,
    taxYear: number,
    input: DocumentDraftsInput,
  ): Promise<{ actions: AdvisorActionProposal[]; assistantMessage: AdvisorChatMessageDto }> {
    for (const item of input.fields) assertAiWritable(item.screen ?? input.screen, item.field)
    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) await this.owlModeService.setSetting(userId, true)

    const digest = await this.caseDigest.buildCaseDigest(input.digestUserId, taxYear)
    // An amount the field already holds from another source is never added to or overwritten silently
    // (ADR-0092 §6, finding N2): the user gets both ways as alternatives, „zusätzlich“ or „ersetzen“.
    const rawActions: AdvisorActionProposal[] = []
    for (const item of input.fields) {
      const screen = item.screen ?? input.screen
      const incoming = String(item.value)
      const draft = (value: string, extra: Partial<AdvisorActionProposal> = {}): AdvisorActionProposal => {
        const sim = simulateAdvisorFieldDelta(digest, screen, item.field, value)
        return {
          actionId: newActionId(),
          status: 'pending',
          screen,
          field: item.field,
          instance: item.instance ?? null,
          label: item.label,
          previousValue: sim.previousValue,
          expectedPreviousValue: sim.previousValue,
          newValue: value,
          beforeRefundEur: sim.beforeRefundEur,
          afterRefundEur: sim.afterRefundEur,
          deltaEur: sim.deltaEur,
          reason: 'Vom Beleg gelesen',
          ...(item.countedItems ? { countedItems: item.countedItems } : {}),
          sourceId: input.sourceId,
          paragraph: ADVISOR_LEGAL_SOURCES[input.sourceId].paragraph,
          ...(input.receiptId ? { receiptId: input.receiptId } : {}),
          ...(input.person === 'B' ? { person: 'B' as const } : {}),
          confidenceStatus: item.status,
          fieldReason: item.reason,
          ...extra,
        }
      }
      const target = { screen, field: item.field, person: input.person, instance: item.instance ?? null }
      const existing = typeof item.value === 'number' ? await this.existingAmount(userId, taxYear, input.digestUserId, target, input.receiptId) : null
      // A sum of several documents (the self-borne medical costs) adds another one up; a single value asks (§6).
      const how =
        existing === null
          ? 'write'
          : ACCUMULATING_KEYS.has(`${screen}.${item.field}`)
            ? sumFieldCombination(existing.value, incoming, existing.source, false)
            : amountCombination(existing.value, incoming, existing.source)
      if (how === 'write') {
        rawActions.push(draft(incoming))
        continue
      }
      // A second insurer's statement for another part of the year adds up; „ersetzen“ would delete the first
      // insurer's premium (real-data run). Both ways stay where the periods overlap, a period is unknown (a
      // correction of the same statement, N2) or the value was typed.
      if (how === 'ask' && item.accumulate === true && existing!.fromDocument && periodsApart(existing!.counted, item.countedItems)) {
        const sum = addAmounts(existing!.value!, incoming)
        rawActions.push(
          draft(sum, {
            reason: `Schon eingetragen: ${existing!.value} aus einem anderen Beleg. Dieser Beleg gilt für einen anderen Zeitraum des Jahres (etwa eine zweite Kasse nach einem Wechsel): zusammen ${sum}.`,
            ...(item.countedItems ? { countedItems: [...existing!.counted, ...item.countedItems] } : {}),
          }),
        )
        continue
      }
      if (how === 'add') {
        const sum = addAmounts(existing!.value!, incoming)
        rawActions.push(draft(sum, { reason: `Vom Beleg gelesen: bisher ${existing!.value}, dazu ${incoming}.`, ...(item.countedItems ? { countedItems: [...existing!.counted, ...item.countedItems] } : {}) }))
        continue
      }
      rawActions.push(...combinationDrafts(draft, item.label, existing!, incoming, item.countedItems))
    }
    const question = await this.sickPayQuestion(taxYear, input)
    // A daily benefit with a printed amount is proposed the only way the rules allow it (ADR-0093): as
    // two paths the user chooses between, never as a value that is simply taken over. A sickness benefit
    // and an accident benefit (UVG/SUVA) each go to their own field.
    const benefit = question !== null && input.dailyBenefit && input.dailyBenefit.amountChf !== null ? { kind: input.dailyBenefit.kind, amountChf: input.dailyBenefit.amountChf } : null
    const initialMeta: AdvisorMessageMeta = {
      sources: [input.sourceId],
      actions: rawActions,
      ...(benefit !== null ? { twoPaths: dailyBenefitPaths(benefit.kind, benefit.amountChf, input, dailyBenefitRecommendation(input.dailyBenefit, dailyBenefitContext(taxYear, input)) !== null) } : {}),
    }
    const enrichedMeta = await this.withEstimateEffects(userId, taxYear, await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, initialMeta))
    checkPiiFree(enrichedMeta)
    await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(enrichedMeta))
    const assistantMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      role: 'assistant',
      content: question === null ? input.summaryText : `${input.summaryText}\n\n${question}`,
      meta: { ...enrichedMeta, engine: input.engine },
    })
    return { actions: (enrichedMeta.actions ?? []).map((a) => toPublicAction(a)), assistantMessage: toMessageDto(assistantMessage) }
  }

  /**
   * The before and after of a document's drafts from the app's own estimate, as the chat's drafts have
   * it. The digest's approximation knows neither Person B nor the prepayments: a card read „-28.467 €
   * → -28.467 €“ while the estimate stood at -4 € (real-data run). Without an estimate behind the
   * service the approximation stays.
   */
  private async withEstimateEffects(userId: string, taxYear: number, meta: AdvisorMessageMeta): Promise<AdvisorMessageMeta> {
    return withPreviewedEffects(meta, this.caseDigest.previewEffectFor(userId, taxYear))
  }

  /**
   * A Swiss wage statement does not say where a daily benefit in the gross wage came from (ADR-0093,
   * ADR-0072 Punkt 5): asked once, under the statement just read, while neither the source nor an amount
   * in the sickness or the accident field is recorded. Ziffer 8 and 9 of the statement give the AHV hint.
   */
  private async sickPayQuestion(taxYear: number, input: DocumentDraftsInput): Promise<string | null> {
    const wageStatement = input.fields.some((item) => (item.screen ?? input.screen) === 'chLohnausweis' && item.field === 'bruttolohn-total')
    if (!wageStatement && !input.dailyBenefit) return null
    const read = (field: string) => this.confirmationService.readRawValue(input.digestUserId, taxYear, `chLohnausweis.${field}`).catch(() => null)
    const [source, sickness, accident] = await Promise.all([read('taggeldQuelle'), read('steuerfreiesKrankentaggeldChf'), read('steuerfreiesUnfalltaggeldChf')])
    if (source !== null || sickness !== null || accident !== null) return null
    return sickPayQuestionForUser(input.dailyBenefit, dailyBenefitContext(taxYear, input))
  }

  /**
   * What receipts already counted into a field that adds up (donations, a health insurer's premiums):
   * in applied drafts and in the draft still waiting (ADR-0080).
   */
  async countedReceiptItems(userId: string, taxYear: number, target: CountTarget): Promise<AdvisorCountedItem[]> {
    const items: AdvisorCountedItem[] = []
    for (const action of await this.draftsFor(userId, taxYear, target)) if (action.status === 'applied') items.push(...(action.countedItems ?? []))
    return [...items, ...((await this.pendingDraftFor(userId, taxYear, target))?.countedItems ?? [])]
  }

  /**
   * What a document's amount meets in its field (ADR-0092 §6): the draft still waiting for it, or else
   * the value recorded, and whether that came from this very document, another one, or by hand / the chat.
   */
  private async existingAmount(
    userId: string,
    taxYear: number,
    dataUserId: string,
    target: CountTarget,
    receiptId: string | null,
  ): Promise<ExistingAmount> {
    const drafts = await this.draftsFor(userId, taxYear, target)
    // The receipts already in this field (applied or waiting): another one of them again is a copy or a correction.
    const marks = drafts.filter((a) => a.status === 'applied' || a.status === 'pending').flatMap((a) => (a.receiptMark ? [a.receiptMark] : []))
    const pending = drafts.filter((a) => a.status === 'pending' && a.combination !== 'replace').at(-1)
    if (pending !== undefined) {
      const own = receiptId !== null && pending.receiptId === receiptId
      return { value: pending.newValue, source: own ? 'thisDocument' : 'other', fromDocument: pending.receiptId !== undefined, counted: pending.countedItems ?? [], marks, companions: pending.companionFields ?? {} }
    }
    const key = provenanceKey(target.screen, target.field, target.instance ?? undefined)
    const stored = await this.confirmationService.valueWithSource(dataUserId, taxYear, key).catch(() => ({ value: null, receiptId: null }))
    if (stored.value === null) return { value: null, source: 'none', fromDocument: false, counted: [], marks }
    const own = receiptId !== null && stored.receiptId === receiptId
    // What the applied draft counted (a statement, its period): a later document is compared with it.
    const counted = drafts.filter((a) => a.status === 'applied').at(-1)?.countedItems ?? []
    return { value: stored.value, source: own ? 'thisDocument' : 'other', fromDocument: stored.receiptId !== null || counted.length > 0, counted, marks }
  }

  private async pendingCountedItems(userId: string, taxYear: number, target: CountTarget): Promise<AdvisorCountedItem[]> {
    return [...((await this.pendingDraftFor(userId, taxYear, target))?.countedItems ?? [])]
  }

  private async draftsFor(userId: string, taxYear: number, target: CountTarget): Promise<AdvisorActionProposal[]> {
    return (await this.advisorRepo.listForUserAndYear(userId, taxYear))
      .flatMap((m) => [...(m.meta?.action ? [m.meta.action] : []), ...(m.meta?.actions ?? [])])
      .filter(
        (a) =>
          a.screen === target.screen &&
          a.field === target.field &&
          (a.person ?? 'A') === (target.person ?? 'A') &&
          (a.instance ?? null) === (target.instance ?? null),
      )
  }

  private async pendingDraftFor(userId: string, taxYear: number, target: CountTarget): Promise<AdvisorActionProposal | undefined> {
    // Of the two ways „zusätzlich“ / „ersetzen“ still open, the one adding up carries everything counted.
    return (await this.draftsFor(userId, taxYear, target)).filter((a) => a.status === 'pending' && a.combination !== 'replace').at(-1)
  }

  /**
   * The child a receipt is about: the only child of the year, or among several the one the document names
   * (ADR-0086). Null when it stays unclear; `children` says how many there are, for the question to the user.
   */
  async childForReceipt(userId: string, taxYear: number, text: string): Promise<{ id: string | null; children: number }> {
    const children = (await this.childRepo?.listForUserAndYear(userId, taxYear)) ?? []
    return { id: children.length === 0 ? null : childNamedIn(text, children), children: children.length }
  }

  /** Values of receipt drafts still waiting on this screen (newest first wins), for the fields that add up. */
  private async pendingReceiptValues(userId: string, taxYear: number, screen: Screen): Promise<Map<string, string>> {
    const values = new Map<string, string>()
    // Oldest to newest, so a newer draft overwrites an older one.
    for (const message of await this.advisorRepo.listForUserAndYear(userId, taxYear)) {
      // A single receipt's draft, and the drafts a document staged together (a health insurer's
      // statement puts the self-borne costs next to the premiums): a later receipt adds to either.
      const actions = [...(message.meta?.action ? [message.meta.action] : []), ...(message.meta?.actions ?? [])]
      for (const action of actions) {
        if (action.status !== 'pending' || action.screen !== screen || action.person === 'B' || (action.instance ?? null) !== null) continue
        values.set(action.field, action.newValue)
        for (const [field, value] of Object.entries(action.companionFields ?? {})) values.set(field, value)
      }
    }
    return values
  }

  /**
   * Takes back what one document put into the return (ADR-0092 §4), before it is assigned to someone else:
   * each applied draft from it is undone where the field still holds what the draft wrote — a value
   * changed since by hand or by another source stays — and its drafts still waiting are dismissed.
   * Returns how many applied drafts were taken back.
   */
  async takeBackDocumentValues(userId: string, taxYear: number, receiptId: string): Promise<number> {
    return this.transactions.run(async () => {
      let takenBack = 0
      const undoneAt = new Date().toISOString()
      for (const message of await this.advisorRepo.listForUserAndYear(userId, taxYear)) {
        const meta = message.meta
        if (!meta) continue
        let changed = false
        const takeBack = async (action: AdvisorActionProposal): Promise<AdvisorActionProposal> => {
          if (action.receiptId !== receiptId) return action
          if (action.status === 'pending') {
            changed = true
            return { ...action, status: 'dismissed' }
          }
          if (action.status !== 'applied') return action
          const dataUserId = await this.drafts.dataUserFor(userId, taxYear, action)
          const key = provenanceKey(action.screen, action.field, action.instance ?? undefined)
          const snapshot = action.undoSnapshot ?? [{ key, previousValue: null, appliedValue: action.newValue, previousMarking: null }]
          // Main field first, companions after — the reverse of the apply order.
          for (let i = snapshot.length - 1; i >= 0; i -= 1) {
            const entry = snapshot[i]!
            const current = await this.confirmationService.readRawValue(dataUserId, taxYear, entry.key).catch(() => undefined)
            // The user's own click in the app, not the owl: personal fields may be restored too.
            if (current === entry.appliedValue) await this.confirmationService.restoreByAdvisor(dataUserId, taxYear, entry, { personalDataConsent: true })
          }
          takenBack++
          changed = true
          const { undoSnapshot: _consumed, ...rest } = action
          return { ...rest, status: 'undone', undoneAt }
        }
        const actions: AdvisorActionProposal[] = []
        for (const action of meta.actions ?? []) actions.push(await takeBack(action))
        const next: AdvisorMessageMeta = {
          ...meta,
          ...(meta.action ? { action: await takeBack(meta.action) } : {}),
          ...(meta.actions ? { actions } : {}),
        }
        if (changed) await this.advisorRepo.updateMessageMeta(message.id, userId, next)
      }
      if (takenBack > 0) await this.auditService.append({ userId, action: 'WRITE', resource: 'beleg_zuordnung' })
      return takenBack
    })
  }

  async markLstbActionsApplied(userId: string, taxYear: number, actionIds: readonly string[]): Promise<void> {
    if (actionIds.length === 0) return
    const targetIds = new Set(actionIds)
    const history = await this.advisorRepo.listForUserAndYear(userId, taxYear)
    const appliedAt = new Date().toISOString()

    for (const msg of history) {
      if (!msg.meta?.actions) continue
      let changed = false
      const hits = msg.meta.actions.some((a) => targetIds.has(a.actionId))
      const nextActions = msg.meta.actions.map((a) => {
        if (targetIds.has(a.actionId) && a.status === 'pending') {
          changed = true
          return { ...a, status: 'applied' as const, appliedAt }
        }
        // The mask took the scan over its own way: the chat's „zusätzlich“ alternative is answered too.
        if (hits && a.status === 'pending' && a.combination !== undefined) {
          changed = true
          return { ...a, status: 'superseded' as const }
        }
        return a
      })
      if (changed) {
        await this.advisorRepo.updateMessageMeta(msg.id, userId, { ...msg.meta, actions: nextActions })
      }
    }
  }
}

/**
 * The two treatments of a daily benefit a wage statement names (ADR-0093): not deducted, or deducted
 * with the benefit statement as proof. Alternatives of one group; the user picks one. A sickness benefit
 * goes to its field, a benefit of the accident insurance (UVG/SUVA) to the other: both leave the wage,
 * only the accident benefit raises the tax rate (§ 32b EStG).
 */
/** Ziffer 8 and 9 of the statement just read, for the AHV hint and the recommendation. */
function dailyBenefitContext(taxYear: number, input: DocumentDraftsInput): DailyBenefitHintContext {
  const amountOf = (field: string): number | null => {
    const value = input.fields.find((item) => (item.screen ?? input.screen) === 'chLohnausweis' && item.field === field)?.value
    return typeof value === 'number' ? value : null
  }
  return { taxYear, grossWageChf: amountOf('bruttolohn-total'), ahvContributionsChf: amountOf('ahv-beitraege') }
}

/**
 * With `recommended` the remark and Ziffer 9 agree that an insurance paid the benefit: the deduction is
 * marked as the recommendation and not deducting carries the contradiction, the user still chooses.
 */
function dailyBenefitPaths(kind: ChDailyBenefitRemark['kind'], amountChf: number, input: DocumentDraftsInput, recommended = false): NonNullable<AdvisorMessageMeta['twoPaths']> {
  const paths = plainDailyBenefitPaths(kind, amountChf, input)
  if (!recommended) return paths
  return {
    ...paths,
    safePath: { ...paths.safePath, reason: `${paths.safePath.reason} ${DAILY_BENEFIT_CONTRADICTION}` },
    maxPath: { ...paths.maxPath, label: `${paths.maxPath.label} (empfohlen)`, reason: `${paths.maxPath.reason} ${DAILY_BENEFIT_RECOMMENDATION_REASON}` },
  }
}

function plainDailyBenefitPaths(kind: ChDailyBenefitRemark['kind'], amountChf: number, input: DocumentDraftsInput): NonNullable<AdvisorMessageMeta['twoPaths']> {
  const accident = kind === 'accident'
  const group = newActionId()
  // Taking the deduction answers where the money came from too (ADR-0072, Punkt 5). Not deducting leaves the
  // source open (continued pay, or a benefit outside Ziffer 8): the 0 answers the question either way.
  const deducted: DailyBenefitSource = accident ? 'unfallversicherung' : 'krankentaggeldversicherung'
  const path = (suffix: 'safe' | 'max', value: number, label: string, reason: string): AdvisorActionProposal => ({
    actionId: `${group}-${suffix}`,
    alternativeGroup: group,
    status: 'pending',
    screen: 'chLohnausweis',
    field: accident ? 'steuerfreiesUnfalltaggeldChf' : 'steuerfreiesKrankentaggeldChf',
    instance: null,
    ...(input.person === 'B' ? { person: 'B' as const } : {}),
    label,
    previousValue: null,
    expectedPreviousValue: null,
    newValue: String(value),
    beforeRefundEur: 0,
    afterRefundEur: 0,
    deltaEur: 0,
    effect: 'not-computable',
    effectHint: 'Die Wirkung zeigt die Schätzung, sobald der Lohnausweis übernommen ist.',
    reason,
    sourceId: input.sourceId,
    paragraph: ADVISOR_LEGAL_SOURCES[input.sourceId].paragraph,
    ...(input.receiptId ? { receiptId: input.receiptId } : {}),
    ...(suffix === 'max' ? { companionFields: { taggeldQuelle: deducted }, companionExpectedValues: { taggeldQuelle: null } } : {}),
  })
  if (accident) {
    return {
      title: 'Ausgezahltes Unfalltaggeld (UVG/SUVA): im Bruttolohn (Ziffer 8) enthalten?',
      sourceId: input.sourceId,
      safePath: path('safe', 0, 'Unfalltaggeld nicht abziehen', 'Das Unfalltaggeld ist nicht im Bruttolohn Ziffer 8 enthalten (oder du bist nicht sicher): Der Lohn bleibt, wie er auf dem Ausweis steht.'),
      maxPath: {
        ...path(
          'max',
          amountChf,
          `Unfalltaggeld ${formatChf(amountChf)} abziehen`,
          'Das Unfalltaggeld ist im Bruttolohn Ziffer 8 enthalten: Es ist steuerfrei und wird vom Lohn abgezogen (Anlage N-Gre, Zeile „SUVA – Geld“), erhöht aber den Steuersatz (Progressionsvorbehalt, § 32b EStG).',
        ),
        evidenceHint: 'Bitte die ergänzende Bescheinigung des Arbeitgebers oder die Taggeld-Abrechnung der Unfallversicherung aufbewahren.',
      },
    }
  }
  return {
    title: 'Ausgezahltes Krankentaggeld: im Bruttolohn (Ziffer 8) enthalten?',
    sourceId: input.sourceId,
    safePath: path('safe', 0, 'Krankentaggeld nicht abziehen', 'Lohnfortzahlung des Arbeitgebers ohne Versicherung, oder das Taggeld ist nicht im Bruttolohn Ziffer 8 enthalten (oder du bist nicht sicher): Der Lohn bleibt, wie er auf dem Ausweis steht.'),
    maxPath: {
      ...path('max', amountChf, `Krankentaggeld ${formatChf(amountChf)} abziehen`, 'Das Taggeld kam von der Krankentaggeldversicherung und ist im Bruttolohn Ziffer 8 enthalten: Es ist steuerfrei und wird vom Lohn abgezogen (Anlage N-Gre Zeile 9). Stockt der Arbeitgeber auf, wird nur der Teil der Versicherung abgezogen.'),
      evidenceHint: 'Bitte die Taggeld-Abrechnung des Versicherers aufbewahren.',
    },
  }
}

/** What a document's amount meets in its field. */
interface ExistingAmount {
  readonly value: string | null
  readonly source: ExistingValueSource
  /** The value came from a document (not typed by hand or told in the chat). */
  readonly fromDocument: boolean
  /** What the waiting draft already counted (a statement, a donation), carried on when adding. */
  readonly counted: readonly AdvisorCountedItem[]
  /** The receipts already in a sum field, to tell the same receipt again from another one. */
  readonly marks: readonly ReceiptMark[]
  /** The companion values of the draft still waiting (a craftsman's invoice total), which add up too. */
  readonly companions?: Readonly<Record<string, string>> | undefined
}

/**
 * The two ways to take a document's amount into a field that already holds one (ADR-0092 §6): on top of
 * it (a second employer, a second insurer) or instead of it (a correction). Alternatives of one group.
 */
export function combinationDrafts(
  draft: (value: string, extra?: Partial<AdvisorActionProposal>) => AdvisorActionProposal,
  label: string,
  existing: ExistingAmount,
  incoming: string,
  counted: readonly AdvisorCountedItem[] | undefined,
): [AdvisorActionProposal, AdvisorActionProposal] {
  const before = existing.value ?? '0'
  const sum = addAmounts(before, incoming)
  const said = existing.fromDocument ? 'aus einem anderen Beleg' : 'von Hand oder im Chat eingetragen'
  const add = draft(sum, {
    label: `${label} – zusätzlich`,
    reason: `Schon eingetragen: ${before} (${said}). Dieser Beleg: ${incoming}. Zusätzlich, etwa für einen zweiten Arbeitgeber oder eine zweite Kasse: zusammen ${sum}.`,
    combination: 'add',
    ...(counted ? { countedItems: [...existing.counted, ...counted] } : {}),
  })
  const replace = draft(incoming, {
    label: `${label} – ersetzen (Korrektur)`,
    reason: `Schon eingetragen: ${before} (${said}). Ersetzen, wenn dieser Beleg den bisherigen Wert korrigiert: dann ${incoming}.`,
    combination: 'replace',
    alternativeGroup: `combine:${add.actionId}`,
  })
  return [{ ...add, alternativeGroup: `combine:${add.actionId}` }, replace]
}

/** „01.01.2025 - 30.06.2025“ as two ISO dates, or null. */
function periodRange(period: string | undefined): readonly [string, string] | null {
  const m = /(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})/.exec(period ?? '')
  return m ? [`${m[3]}-${m[2]}-${m[1]}`, `${m[6]}-${m[5]}-${m[4]}`] : null
}

/** Whether a document covers another part of the year than the one already counted: both periods known, none overlapping. */
function periodsApart(counted: readonly AdvisorCountedItem[], incoming: readonly AdvisorCountedItem[] | undefined): boolean {
  const ranges = (items: readonly AdvisorCountedItem[]) => items.map((item) => periodRange(item.period)).filter((range): range is readonly [string, string] => range !== null)
  const before = ranges(counted)
  const now = ranges(incoming ?? [])
  if (before.length === 0 || before.length !== counted.length || now.length === 0 || now.length !== (incoming ?? []).length) return false
  return !before.some(([from, to]) => now.some(([nowFrom, nowTo]) => nowFrom <= to && from <= nowTo))
}

