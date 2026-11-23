import { ADVISOR_LEGAL_SOURCES, alternativeKeyOf, draftPersonKey, isNewRecordId, withTwoPathsGroup, provenanceKey, type AdvisorActionProposal, type AdvisorMessageMeta, type AdvisorUndoEntry, type Screen } from '@steuereule/core'
import { Inject, Injectable } from '@nestjs/common'
import { AuditService } from '../audit/audit.service.js'
import { LinkService } from '../link/link.service.js'
import { PersonalDataConsentService } from '../owl-mode/personal-data-consent.service.js'
import { TRANSACTION_RUNNER, type TransactionRunner } from '../common/transaction-runner.js'
import { assertAiWritable } from '../confirmation/ai-write-policy.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import { ConflictError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { ADVISOR_REPOSITORY, type AdvisorChatMessageRecord, type AdvisorRepository } from './advisor.repository.js'
import type { AdvisorActionMutationResponseDto, ApplyBatchActionsDto, ApplyBatchActionsResponseDto } from './dto/advisor.dto.js'
import { ResolvedDraft, toPublicAction, toMessageDto } from './advisor-shared.js'

/**
 * Creates and removes the rows a draft prepared as new (ADR-0091): a child from its first name and
 * birth date, a rental object. `create` answers the new id, or null where the mask has no rows.
 */
export interface DraftRecords {
  create(dataUserId: string, taxYear: number, screen: Screen, values: Readonly<Record<string, string>>): Promise<string | null>
  remove(dataUserId: string, taxYear: number, screen: Screen, id: string): Promise<void>
}

/** Injection token of the rows the owl may create and remove for a draft. */
export const DRAFT_RECORDS = Symbol('DRAFT_RECORDS')

/** A field's record: whose data, which mask and which row — the part of the key before the field. */
const recordOf = (dataUserId: string, key: string): string => `${dataUserId}|${key.slice(0, key.lastIndexOf('.'))}`

/** The life of a draft after the owl proposed it: baseline, superseding, applying with a compare-and-set, undo and dismissal. */
@Injectable()
export class AdvisorDrafts {
  constructor(
    @Inject(ADVISOR_REPOSITORY) private readonly advisorRepo: AdvisorRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(ConfirmationService) private readonly confirmationService: ConfirmationService,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    /** Whose data a person's draft writes (ADR-0054, ADR-0073). */
    @Inject(LinkService) private readonly link: LinkService,
    /** The consent to personal data for the owl (ADR-0091); read on every apply, so a revocation stops drafts at once. */
    @Inject(PersonalDataConsentService) private readonly personalDataConsent: PersonalDataConsentService,
    @Inject(DRAFT_RECORDS) private readonly records: DraftRecords,
  ) {}

  /** What a draft aims at: the field, and for Person B that it is B's field, not the user's. */
  targetKeyOf(action: Pick<AdvisorActionProposal, 'screen' | 'field' | 'instance' | 'person'>): string {
    return draftPersonKey(action.person, provenanceKey(action.screen, action.field, action.instance ?? undefined))
  }

  /** The user whose fields the draft writes. A refusal (B has an own account now) reaches the client as it stands. */
  async dataUserFor(userId: string, taxYear: number, action: Pick<AdvisorActionProposal, 'person'>): Promise<string> {
    return this.link.dataUser(userId, taxYear, action.person ?? 'A')
  }

  collectPendingTargetKeys(meta: AdvisorMessageMeta | null): Set<string> {
    const keys = new Set<string>()
    if (!meta) return keys
    if (meta.action?.status === 'pending') keys.add(this.targetKeyOf(meta.action))
    for (const a of meta.actions ?? []) {
      if (a.status === 'pending') keys.add(this.targetKeyOf(a))
    }
    if (meta.twoPaths?.safePath.status === 'pending') keys.add(this.targetKeyOf(meta.twoPaths.safePath))
    if (meta.twoPaths?.maxPath.status === 'pending') keys.add(this.targetKeyOf(meta.twoPaths.maxPath))
    return keys
  }

  async enrichSingleDraft(
    userId: string,
    taxYear: number,
    draft: AdvisorActionProposal,
  ): Promise<AdvisorActionProposal> {
    const consent = await this.personalDataConsent.hasConsent(userId)
    assertAiWritable(draft.screen, draft.field, undefined, consent)
    const dataUserId = await this.dataUserFor(userId, taxYear, draft)
    const key = provenanceKey(draft.screen, draft.field, draft.instance ?? undefined)
    const rawPreviousValue = await this.readBaseline(dataUserId, taxYear, key, draft.expectedPreviousValue)
    let companionExpectedValues: Record<string, string | null> | undefined
    if (draft.companionFields) {
      companionExpectedValues = {}
      for (const companionField of Object.keys(draft.companionFields)) {
        assertAiWritable(draft.screen, companionField, undefined, consent)
        const companionKey = provenanceKey(draft.screen, companionField, draft.instance ?? undefined)
        companionExpectedValues[companionField] = (await this.readBaseline(dataUserId, taxYear, companionKey, null)) ?? null
      }
    }
    return {
      ...draft,
      // The engine only knows the user's own figures; Person B's previous value is read here.
      ...(draft.person === 'B' ? { previousValue: rawPreviousValue ?? null } : {}),
      expectedPreviousValue: rawPreviousValue ?? null,
      ...(companionExpectedValues ? { companionExpectedValues } : {}),
      paragraph: draft.paragraph ?? ADVISOR_LEGAL_SOURCES[draft.sourceId].paragraph,
    }
  }

  /** A field that does not exist yet (e.g. no commute record) has no baseline; the draft's own one stands. */
  async readBaseline(
    userId: string,
    taxYear: number,
    key: string,
    fallback: string | null | undefined,
  ): Promise<string | null | undefined> {
    try {
      return await this.confirmationService.readRawValue(userId, taxYear, key)
    } catch (error) {
      if (error instanceof InvalidInputError || error instanceof NotFoundError) return fallback
      throw error
    }
  }

  async enrichDraftsWithRawBaseline(
    userId: string,
    taxYear: number,
    meta: AdvisorMessageMeta,
  ): Promise<AdvisorMessageMeta> {
    let nextMeta: AdvisorMessageMeta = meta
    if (nextMeta.action) {
      nextMeta = {
        ...nextMeta,
        action: await this.enrichSingleDraft(userId, taxYear, nextMeta.action),
      }
    }
    if (nextMeta.actions) {
      nextMeta = {
        ...nextMeta,
        actions: await Promise.all(nextMeta.actions.map((a) => this.enrichSingleDraft(userId, taxYear, a))),
      }
    }
    if (nextMeta.twoPaths) {
      const [safePath, maxPath] = await Promise.all([
        this.enrichSingleDraft(userId, taxYear, nextMeta.twoPaths.safePath),
        this.enrichSingleDraft(userId, taxYear, nextMeta.twoPaths.maxPath),
      ])
      nextMeta = {
        ...nextMeta,
        twoPaths: {
          ...nextMeta.twoPaths,
          safePath,
          maxPath: {
            ...maxPath,
            evidenceHint: nextMeta.twoPaths.maxPath.evidenceHint,
          },
        },
      }
    }
    return nextMeta
  }

  async supersedePendingDraftsForSameTargets(
    userId: string,
    taxYear: number,
    targetKeys: Set<string>,
    excludeActionIds: Set<string> = new Set(),
    /** Alternative groups of the applied drafts: their other pending alternatives drop out too. */
    alternativeKeys: Set<string> = new Set(),
  ): Promise<void> {
    if (targetKeys.size === 0 && alternativeKeys.size === 0) return
    const history = await this.advisorRepo.listForUserAndYear(userId, taxYear)
    for (const msg of history) {
      if (!msg.meta) continue
      let changed = false
      let updatedMeta = msg.meta

      const maybeSupersede = (proposal: AdvisorActionProposal): AdvisorActionProposal => {
        if (
          proposal.status === 'pending' &&
          !excludeActionIds.has(proposal.actionId) &&
          (targetKeys.has(this.targetKeyOf(proposal)) || alternativeKeys.has(alternativeKeyOf(proposal)))
        ) {
          changed = true
          return { ...proposal, status: 'superseded' }
        }
        return proposal
      }

      if (updatedMeta.action) {
        updatedMeta = { ...updatedMeta, action: maybeSupersede(updatedMeta.action) }
      }
      if (updatedMeta.actions) {
        updatedMeta = { ...updatedMeta, actions: updatedMeta.actions.map(maybeSupersede) }
      }
      if (updatedMeta.twoPaths) {
        // A comparison stored before alternative groups existed still has its two paths exclude each other.
        const grouped = withTwoPathsGroup(updatedMeta.twoPaths)
        const nextSafe = maybeSupersede(grouped.safePath)
        const nextMax = maybeSupersede(grouped.maxPath)
        updatedMeta = {
          ...updatedMeta,
          twoPaths: {
            ...updatedMeta.twoPaths,
            safePath: nextSafe,
            maxPath: {
              ...nextMax,
              evidenceHint: updatedMeta.twoPaths.maxPath.evidenceHint,
            },
          },
        }
      }

      if (changed) {
        await this.advisorRepo.updateMessageMeta(msg.id, userId, updatedMeta)
      }
    }
  }

  findActionInMeta(
    meta: AdvisorMessageMeta | null,
    actionId: string,
  ): AdvisorActionProposal | null {
    if (!meta) return null
    if (meta.action?.actionId === actionId) return meta.action
    const inActions = meta.actions?.find((a) => a.actionId === actionId)
    if (inActions) return inActions
    if (meta.twoPaths?.safePath.actionId === actionId) return withTwoPathsGroup(meta.twoPaths).safePath
    if (meta.twoPaths?.maxPath.actionId === actionId) return withTwoPathsGroup(meta.twoPaths).maxPath
    return null
  }

  replaceActionInMeta(
    meta: AdvisorMessageMeta,
    updatedAction: AdvisorActionProposal,
  ): AdvisorMessageMeta {
    if (meta.action?.actionId === updatedAction.actionId) {
      return { ...meta, action: updatedAction }
    }
    if (meta.actions?.some((a) => a.actionId === updatedAction.actionId)) {
      return {
        ...meta,
        actions: meta.actions.map((a) => (a.actionId === updatedAction.actionId ? updatedAction : a)),
      }
    }
    if (meta.twoPaths) {
      if (meta.twoPaths.safePath.actionId === updatedAction.actionId) {
        return {
          ...meta,
          twoPaths: {
            ...meta.twoPaths,
            safePath: updatedAction,
          },
        }
      }
      if (meta.twoPaths.maxPath.actionId === updatedAction.actionId) {
        return {
          ...meta,
          twoPaths: {
            ...meta.twoPaths,
            maxPath: {
              ...updatedAction,
              evidenceHint: meta.twoPaths.maxPath.evidenceHint,
            },
          },
        }
      }
    }
    return meta
  }

  assertActionApplicable(action: AdvisorActionProposal, personalDataConsent = false): void {
    if (action.status === 'applied') {
      throw new ConflictError('ADVISOR_ACTION_ALREADY_APPLIED', 'Dieser Vorschlag wurde bereits übernommen.')
    }
    if (action.status === 'superseded') {
      throw new ConflictError('ADVISOR_ACTION_SUPERSEDED', 'Dieser Entwurf wurde durch einen neueren Vorschlag ersetzt.')
    }
    if (action.status === 'dismissed') {
      throw new ConflictError('ADVISOR_ACTION_DISMISSED', 'Dieser Entwurf wurde bereits verworfen.')
    }
    assertAiWritable(action.screen, action.field, undefined, personalDataConsent)
    for (const companionField of Object.keys(action.companionFields ?? {})) assertAiWritable(action.screen, companionField, undefined, personalDataConsent)
  }

  async findDraft(userId: string, taxYear: number, actionId: string): Promise<Omit<ResolvedDraft, 'dataUserId'>> {
    const messageRecord = await this.advisorRepo.findMessageByActionId(userId, taxYear, actionId)
    const action = messageRecord?.meta ? this.findActionInMeta(messageRecord.meta, actionId) : null
    if (!messageRecord || !action) {
      throw new NotFoundError('ADVISOR_ACTION_NOT_FOUND', `Aktion "${actionId}" wurde nicht gefunden.`)
    }
    return { messageRecord, action, key: provenanceKey(action.screen, action.field, action.instance ?? undefined) }
  }

  /** A draft about to touch the return, with whose data it writes. */
  async resolveDraft(userId: string, taxYear: number, actionId: string): Promise<ResolvedDraft> {
    const draft = await this.findDraft(userId, taxYear, actionId)
    return { ...draft, dataUserId: await this.dataUserFor(userId, taxYear, draft.action) }
  }

  /**
   * Every field a draft writes, with the value it must still hold. After a stale conflict the
   * client can re-baseline a field by naming the value it now holds (from the 409 details);
   * the write stays a compare-and-set, so a further change in between still fails.
   */
  writePlan(
    draft: ResolvedDraft,
    acknowledged: Readonly<Record<string, string | null>> | undefined,
  ): Array<{ key: string; newValue: string; expected: string | null }> {
    const { action, key } = draft
    const baseline = (writeKey: string, own: string | null): string | null =>
      acknowledged !== undefined && Object.hasOwn(acknowledged, writeKey) ? (acknowledged[writeKey] ?? null) : own
    const companions = Object.entries(action.companionFields ?? {}).map(([field, newValue]) => {
      const companionKey = provenanceKey(action.screen, field, action.instance ?? undefined)
      return { key: companionKey, newValue, expected: baseline(companionKey, action.companionExpectedValues?.[field] ?? null) }
    })
    return [
      ...companions,
      {
        key,
        newValue: action.newValue,
        // `previousValue` is display text ("0 €"); it is only a baseline for drafts stored before raw baselines existed.
        expected: baseline(key, action.expectedPreviousValue !== undefined ? action.expectedPreviousValue : action.previousValue),
      },
    ]
  }

  async collectStaleConflicts(
    taxYear: number,
    plans: ReadonlyArray<{ actionId: string; dataUserId: string; fresh?: boolean; writes: ReadonlyArray<{ key: string; expected: string | null; newValue?: string | undefined }> }>,
  ): Promise<Array<{ actionId: string; key: string; currentValue: string | null }>> {
    const conflicts: Array<{ actionId: string; key: string; currentValue: string | null }> = []
    for (const plan of plans) {
      // A row this batch has just created holds nothing anyone could have changed (ADR-0091).
      if (plan.fresh === true) continue
      for (const write of plan.writes) {
        const currentValue = (await this.confirmationService.readRawValue(plan.dataUserId, taxYear, write.key)) ?? null
        // A field that meanwhile holds exactly what the draft writes overwrites nothing (two receipts
        // both opening „Krankheitskosten: Ja“): no conflict to show.
        if (currentValue !== write.expected && currentValue !== (write.newValue ?? undefined)) conflicts.push({ actionId: plan.actionId, key: write.key, currentValue })
      }
    }
    return conflicts
  }

  /**
   * Turbo mode: applies every pending draft of one answer as one batch, as if the user had tapped
   * "apply all". Nothing is forced: a stale field, a clash or a refused write leaves all drafts as
   * they are, pending, for the user to decide. Two-path proposals always wait for a choice.
   */
  async applyPendingOf(userId: string, taxYear: number, message: AdvisorChatMessageRecord): Promise<AdvisorChatMessageRecord | null> {
    const pending = [message.meta?.action, ...(message.meta?.actions ?? [])].filter((a): a is AdvisorActionProposal => a?.status === 'pending')
    if (pending.length === 0) return null
    try {
      await this.applyBatch(userId, taxYear, { drafts: pending.map((a) => ({ actionId: a.actionId })) })
    } catch (error) {
      if (error instanceof ConflictError || error instanceof InvalidInputError || error instanceof NotFoundError) return null
      throw error
    }
    const applied = await this.advisorRepo.findMessage(message.id, userId)
    if (!applied?.meta) return null
    return this.advisorRepo.updateMessageMeta(applied.id, userId, { ...applied.meta, turbo: true })
  }

  async applyAction(userId: string, taxYear: number, actionId: string): Promise<AdvisorActionMutationResponseDto> {
    const result = await this.applyBatch(userId, taxYear, { drafts: [{ actionId }] })
    return { message: result.messages[0]!, action: result.actions[0]! }
  }

  /**
   * Applies several drafts as one unit: one transaction, a compare-and-set per field, and
   * every stale field reported at once so the client can show the whole conflict.
   */
  async applyBatch(userId: string, taxYear: number, dto: ApplyBatchActionsDto): Promise<ApplyBatchActionsResponseDto> {
    const actionIds = dto.drafts.map((d) => d.actionId)
    if (new Set(actionIds).size !== actionIds.length) {
      throw new InvalidInputError('ADVISOR_BATCH_DUPLICATE_ACTION', 'Eine Aktion ist doppelt im Batch enthalten.')
    }

    const consent = await this.personalDataConsent.hasConsent(userId)
    return this.transactions.run(async () => {
      const drafts: ResolvedDraft[] = []
      const targetKeys = new Set<string>()
      const alternativeKeys = new Set<string>()
      for (const item of dto.drafts) {
        const draft = await this.resolveDraft(userId, taxYear, item.actionId)
        this.assertActionApplicable(draft.action, consent)
        const targetKey = this.targetKeyOf(draft.action)
        if (targetKeys.has(targetKey)) {
          throw new ConflictError('ADVISOR_BATCH_TARGET_CONFLICT', `Mehrere Entwürfe im Batch zielen auf dasselbe Feld "${draft.key}".`)
        }
        targetKeys.add(targetKey)
        if (draft.action.alternativeGroup !== undefined) {
          const alternativeKey = alternativeKeyOf(draft.action)
          if (alternativeKeys.has(alternativeKey)) {
            throw new ConflictError('ADVISOR_BATCH_ALTERNATIVE_CONFLICT', 'Wähle einen der Wege — beide zusammen geht nicht.')
          }
          alternativeKeys.add(alternativeKey)
        }
        drafts.push(draft)
      }

      // Rows the owl prepared as new are created now, once per answer and placeholder (ADR-0091).
      const created = await this.createNewRecords(taxYear, drafts)
      const placed = drafts.map((draft) => this.placeOnCreatedRecord(draft, created))
      const plans = placed.map((draft, i) => ({
        draft,
        actionId: draft.action.actionId,
        dataUserId: draft.dataUserId,
        fresh: created.has(this.placeholderKey(drafts[i]!)),
        writes: this.writePlan(draft, dto.drafts[i]!.acknowledgedCurrentValues),
      }))
      const conflicts = await this.collectStaleConflicts(taxYear, plans)
      if (conflicts.length > 0) {
        const first = conflicts[0]!
        throw new ConflictError(
          'ADVISOR_ACTION_STALE_CONFLICT',
          conflicts.length === 1
            ? `Das Feld "${first.key}" wurde zwischenzeitlich manuell geändert.`
            : `${conflicts.length} Felder wurden zwischenzeitlich manuell geändert.`,
          { conflicts },
        )
      }

      // Recorded on the draft itself, next to field, values, legal source and engine: together with
      // the audit row this answers "which AI suggestion changed which field when" (StBerG), while
      // the audit table keeps carrying no value-bearing column (REQ-004.5).
      const appliedAt = new Date().toISOString()
      const appliedActions: AdvisorActionProposal[] = []
      // The first write to a record that does not exist yet creates it with its defaults (a commute
      // record starts with Mon–Fri), so a sibling field of the same draft no longer holds the value
      // it had when the draft was made. All baselines were checked above, inside this transaction;
      // for a record this batch has already written to, the comparison uses what is there now.
      const writtenRecords = new Set<string>()
      // The other drafts of the same answers, as they read before these writes (C3).
      const siblings = await this.siblingBaselines(userId, taxYear, placed, plans)
      for (const { draft, writes, fresh } of plans) {
        const undoSnapshot: AdvisorUndoEntry[] = []
        const provenanceOverride = draft.action.receiptId
          ? ({ kind: 'beleg', receiptId: draft.action.receiptId } as const)
          : undefined
        for (const write of writes) {
          const record = `${draft.dataUserId}|${write.key.slice(0, write.key.lastIndexOf('.'))}`
          const current = (await this.confirmationService.readRawValue(draft.dataUserId, taxYear, write.key)) ?? null
          // A field that already holds the draft's value (checked above) is compared with itself: its undo keeps it.
          const expected = fresh || writtenRecords.has(record) || current === write.newValue ? current : write.expected
          undoSnapshot.push(
            await this.confirmationService.writeConfirmedByAdvisor(
              draft.dataUserId,
              taxYear,
              write.key,
              write.newValue,
              expected,
              provenanceOverride,
              { personalDataConsent: consent },
            ),
          )
          writtenRecords.add(record)
        }
        const { undoneAt: _previousUndo, ...reapplicable } = draft.action
        appliedActions.push({
          ...reapplicable,
          ...(fresh && created.get(this.placeholderKey(drafts[plans.findIndex((p) => p.draft === draft)]!))?.creator === draft.action.actionId ? { createdRecord: true as const } : {}),
          status: 'applied',
          appliedAt,
          previousValue: undoSnapshot[undoSnapshot.length - 1]!.previousValue,
          undoSnapshot,
        })
      }

      // Drafts flip to "applied" only once every field write went through.
      const updatedMessages = new Map<string, AdvisorChatMessageRecord>()
      for (const [i, applied] of appliedActions.entries()) {
        const record = updatedMessages.get(drafts[i]!.messageRecord.id) ?? drafts[i]!.messageRecord
        const persisted = await this.advisorRepo.updateMessageMeta(record.id, userId, this.replaceActionInMeta(record.meta!, applied))
        updatedMessages.set(persisted.id, persisted)
      }
      await this.settleSiblings(userId, taxYear, siblings, created, updatedMessages)

      await this.supersedePendingDraftsForSameTargets(userId, taxYear, targetKeys, new Set(actionIds), alternativeKeys)
      await this.auditService.append({
        userId,
        action: 'WRITE',
        resource: drafts.length === 1 ? 'berater_aktion' : 'berater_batch_aktion',
        source: 'Assistent: SteuerEule',
      })

      return {
        actions: appliedActions.map(toPublicAction),
        messages: [...updatedMessages.values()].map(toMessageDto),
      }
    })
  }

  /** Which new row a draft means: its answer, whose data, the mask and the placeholder („neu:1“). */
  private placeholderKey(draft: ResolvedDraft): string {
    return `${draft.messageRecord.id}|${draft.dataUserId}|${draft.action.screen}|${draft.action.instance ?? ''}`
  }

  /**
   * Creates the rows the batch's drafts prepared as new, one per answer and placeholder. A child is
   * created by the draft that names it and its birth date; another draft for the same new child
   * waits for that one (it is applied in the same batch, or before).
   */
  private async createNewRecords(taxYear: number, drafts: readonly ResolvedDraft[]): Promise<Map<string, { id: string; creator: string }>> {
    const created = new Map<string, { id: string; creator: string }>()
    const fresh = drafts.filter((draft) => isNewRecordId(draft.action.instance))
    const valuesOf = (draft: ResolvedDraft): Record<string, string> => ({ ...draft.action.companionFields, [draft.action.field]: draft.action.newValue })
    const canCreate = (draft: ResolvedDraft): boolean => draft.action.screen !== 'kind' || (valuesOf(draft).firstName !== undefined && valuesOf(draft).geburtsdatum !== undefined)
    for (const draft of [...fresh.filter(canCreate), ...fresh.filter((d) => !canCreate(d))]) {
      const key = this.placeholderKey(draft)
      if (created.has(key)) continue
      if (!canCreate(draft)) {
        throw new ConflictError('ADVISOR_RECORD_NOT_CREATED', 'Übernimm zuerst den Entwurf, der das Kind mit Vorname und Geburtsdatum anlegt.')
      }
      const id = await this.records.create(draft.dataUserId, taxYear, draft.action.screen, valuesOf(draft))
      if (id === null) throw new InvalidInputError('ADVISOR_RECORD_NOT_CREATED', 'Dieser Eintrag lässt sich hier nicht neu anlegen.')
      created.set(key, { id, creator: draft.action.actionId })
    }
    return created
  }

  /** A draft for a row created in this batch, addressed to that row. */
  private placeOnCreatedRecord(draft: ResolvedDraft, created: ReadonlyMap<string, { id: string; creator: string }>): ResolvedDraft {
    const row = created.get(this.placeholderKey(draft))
    if (row === undefined) return draft
    const action = { ...draft.action, instance: row.id }
    return { ...draft, action, key: provenanceKey(action.screen, action.field, row.id) }
  }

  /**
   * The pending drafts of the same answers that are not in this batch, with what their fields hold
   * before the batch writes (C3). The first write to a record that does not exist yet creates it
   * with its defaults (a commute record starts with 0 sick days); a sibling draft from the same
   * answer must not see that as a manual change.
   */
  private async siblingBaselines(
    userId: string,
    taxYear: number,
    batch: readonly ResolvedDraft[],
    plans: ReadonlyArray<{ dataUserId: string; writes: ReadonlyArray<{ key: string }> }>,
  ): Promise<Array<{ messageId: string; draft: ResolvedDraft; before: Map<string, string | null> }>> {
    const inBatch = new Set(batch.map((draft) => draft.action.actionId))
    const touched = new Set(plans.flatMap((plan) => plan.writes.map((write) => recordOf(plan.dataUserId, write.key))))
    const result: Array<{ messageId: string; draft: ResolvedDraft; before: Map<string, string | null> }> = []
    const messages = new Map(batch.map((draft) => [draft.messageRecord.id, draft.messageRecord]))
    for (const message of messages.values()) {
      const pending = [message.meta?.action, ...(message.meta?.actions ?? [])].filter(
        (a): a is AdvisorActionProposal => a !== undefined && a.status === 'pending' && !inBatch.has(a.actionId),
      )
      for (const action of pending) {
        let dataUserId: string
        try {
          dataUserId = await this.dataUserFor(userId, taxYear, action)
        } catch {
          continue
        }
        const draft: ResolvedDraft = { messageRecord: message, action, dataUserId, key: provenanceKey(action.screen, action.field, action.instance ?? undefined) }
        const before = new Map<string, string | null>()
        for (const write of this.writePlan(draft, undefined)) {
          if (!touched.has(recordOf(dataUserId, write.key))) continue
          before.set(write.key, (await this.readBaseline(dataUserId, taxYear, write.key, null)) ?? null)
        }
        result.push({ messageId: message.id, draft, before })
      }
    }
    return result
  }

  /**
   * After the batch: a sibling draft whose field the batch changed without writing it (a default of a
   * new record) takes the new value as its baseline, and a sibling of a new row is addressed to it.
   * A field changed by anyone else stays a conflict, as before.
   */
  private async settleSiblings(
    userId: string,
    taxYear: number,
    siblings: ReadonlyArray<{ messageId: string; draft: ResolvedDraft; before: Map<string, string | null> }>,
    created: ReadonlyMap<string, { id: string; creator: string }>,
    updatedMessages: Map<string, AdvisorChatMessageRecord>,
  ): Promise<void> {
    for (const { messageId, draft, before } of siblings) {
      let action = draft.action
      const row = created.get(this.placeholderKey(draft))
      if (row !== undefined) action = { ...action, instance: row.id }
      for (const [key, previous] of before) {
        const now = (await this.readBaseline(draft.dataUserId, taxYear, key, null)) ?? null
        if (now === previous) continue
        const plan = this.writePlan(draft, undefined).find((write) => write.key === key)
        if (plan === undefined || plan.expected !== previous) continue
        if (key === draft.key) action = { ...action, expectedPreviousValue: now }
        else {
          const field = key.slice(key.lastIndexOf('.') + 1)
          action = { ...action, companionExpectedValues: { ...action.companionExpectedValues, [field]: now } }
        }
      }
      if (action === draft.action) continue
      const record = updatedMessages.get(messageId) ?? (await this.advisorRepo.findMessage(messageId, userId))
      if (!record?.meta) continue
      updatedMessages.set(messageId, await this.advisorRepo.updateMessageMeta(messageId, userId, this.replaceActionInMeta(record.meta, action)))
    }
  }

  async undoAction(userId: string, taxYear: number, actionId: string): Promise<AdvisorActionMutationResponseDto> {
    const consent = await this.personalDataConsent.hasConsent(userId)
    return this.transactions.run(async () => {
      const draft = await this.resolveDraft(userId, taxYear, actionId)
      if (draft.action.status !== 'applied') {
        throw new ConflictError('ADVISOR_ACTION_NOT_APPLIED', 'Nur bereits übernommene Vorschläge können rückgängig gemacht werden.')
      }
      // Drafts applied before snapshots existed only remember the main field's previous value.
      const snapshot: readonly AdvisorUndoEntry[] = draft.action.undoSnapshot ?? [
        { key: draft.key, previousValue: draft.action.previousValue, appliedValue: draft.action.newValue, previousMarking: null },
      ]
      // A row the draft created goes with it (ADR-0091); a rental object stays, emptied, as the mask keeps it.
      const removable = draft.action.createdRecord === true && draft.action.screen === 'kind' && draft.action.instance !== null
      if (removable) {
        await this.records.remove(draft.dataUserId, taxYear, draft.action.screen, draft.action.instance!)
      } else {
        // Main field first, companions after — the reverse of the apply order.
        for (let i = snapshot.length - 1; i >= 0; i -= 1) {
          await this.confirmationService.restoreByAdvisor(draft.dataUserId, taxYear, snapshot[i]!, { personalDataConsent: consent })
        }
      }

      const { undoSnapshot: _consumed, ...rest } = draft.action
      const undone: AdvisorActionProposal = { ...rest, status: 'undone', undoneAt: new Date().toISOString() }
      const updatedMessage = await this.advisorRepo.updateMessageMeta(
        draft.messageRecord.id,
        userId,
        this.replaceActionInMeta(draft.messageRecord.meta!, undone),
      )
      await this.auditService.append({
        userId,
        action: 'WRITE',
        resource: 'berater_undo',
        source: 'Assistent: SteuerEule',
      })
      return { message: toMessageDto(updatedMessage), action: undone }
    })
  }

  async dismissAction(userId: string, taxYear: number, actionId: string): Promise<AdvisorActionMutationResponseDto> {
    return this.transactions.run(async () => {
      const draft = await this.findDraft(userId, taxYear, actionId)
      this.assertActionApplicable(draft.action)

      let nextMeta = draft.messageRecord.meta!
      if (nextMeta.lstbScan && nextMeta.actions) {
        nextMeta = {
          ...nextMeta,
          actions: nextMeta.actions.map((a) => (a.status === 'pending' ? { ...a, status: 'dismissed' as const } : a)),
        }
      } else {
        nextMeta = this.replaceActionInMeta(nextMeta, { ...draft.action, status: 'dismissed' })
      }

      const updatedMessage = await this.advisorRepo.updateMessageMeta(draft.messageRecord.id, userId, nextMeta)
      const dismissedAction = this.findActionInMeta(updatedMessage.meta, actionId) ?? { ...draft.action, status: 'dismissed' as const }
      return {
        message: toMessageDto(updatedMessage),
        action: toPublicAction(dismissedAction),
      }
    })
  }
}
