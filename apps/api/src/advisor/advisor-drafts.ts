import { ADVISOR_LEGAL_SOURCES, draftPersonKey, provenanceKey, type AdvisorActionProposal, type AdvisorMessageMeta, type AdvisorPerson, type AdvisorUndoEntry } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { type TransactionRunner } from '../prisma/transaction.js'
import { assertAiWritable } from '../confirmation/ai-write-policy.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import { ConflictError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { type AdvisorChatMessageRecord, type AdvisorRepository } from './advisor.repository.js'
import type { AdvisorActionMutationResponseDto, ApplyBatchActionsDto, ApplyBatchActionsResponseDto } from './dto/advisor.dto.js'
import { ResolvedDraft, toPublicAction, toMessageDto } from './advisor-shared.js'

/** Whose data a person's draft writes; `LinkService.dataUser` in the app (ADR-0054, ADR-0073). */
export type DataUserResolver = (userId: string, taxYear: number, person: AdvisorPerson) => Promise<string>

/** Without a household behind the service there is no Person B to write for. */
const ownDataOnly: DataUserResolver = async (userId, _taxYear, person) => {
  if (person === 'A') return userId
  throw new InvalidInputError('NO_ACTIVE_ZUSAMMENVERANLAGUNG', 'There is no active Zusammenveranlagung.')
}

/** The life of a draft after the owl proposed it: baseline, superseding, applying with a compare-and-set, undo and dismissal. */
export class AdvisorDrafts {
  constructor(
    private readonly advisorRepo: AdvisorRepository,
    private readonly auditService: AuditService,
    private readonly confirmationService: ConfirmationService,
    private readonly transactions: TransactionRunner,
    private readonly dataUserOf: DataUserResolver = ownDataOnly,
  ) {}

  /** What a draft aims at: the field, and for Person B that it is B's field, not the user's. */
  targetKeyOf(action: Pick<AdvisorActionProposal, 'screen' | 'field' | 'instance' | 'person'>): string {
    return draftPersonKey(action.person, provenanceKey(action.screen, action.field, action.instance ?? undefined))
  }

  /** The user whose fields the draft writes. A refusal (B has an own account now) reaches the client as it stands. */
  async dataUserFor(userId: string, taxYear: number, action: Pick<AdvisorActionProposal, 'person'>): Promise<string> {
    return this.dataUserOf(userId, taxYear, action.person ?? 'A')
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
    assertAiWritable(draft.screen, draft.field)
    const dataUserId = await this.dataUserFor(userId, taxYear, draft)
    const key = provenanceKey(draft.screen, draft.field, draft.instance ?? undefined)
    const rawPreviousValue = await this.readBaseline(dataUserId, taxYear, key, draft.expectedPreviousValue)
    let companionExpectedValues: Record<string, string | null> | undefined
    if (draft.companionFields) {
      companionExpectedValues = {}
      for (const companionField of Object.keys(draft.companionFields)) {
        assertAiWritable(draft.screen, companionField)
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
  ): Promise<void> {
    if (targetKeys.size === 0) return
    const history = await this.advisorRepo.listForUserAndYear(userId, taxYear)
    for (const msg of history) {
      if (!msg.meta) continue
      let changed = false
      let updatedMeta = msg.meta

      const maybeSupersede = (proposal: AdvisorActionProposal): AdvisorActionProposal => {
        if (
          proposal.status === 'pending' &&
          !excludeActionIds.has(proposal.actionId) &&
          targetKeys.has(this.targetKeyOf(proposal))
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
        const nextSafe = maybeSupersede(updatedMeta.twoPaths.safePath)
        const nextMax = maybeSupersede(updatedMeta.twoPaths.maxPath)
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
    if (meta.twoPaths?.safePath.actionId === actionId) return meta.twoPaths.safePath
    if (meta.twoPaths?.maxPath.actionId === actionId) return meta.twoPaths.maxPath
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

  assertActionApplicable(action: AdvisorActionProposal): void {
    if (action.status === 'applied') {
      throw new ConflictError('ADVISOR_ACTION_ALREADY_APPLIED', 'Dieser Vorschlag wurde bereits übernommen.')
    }
    if (action.status === 'superseded') {
      throw new ConflictError('ADVISOR_ACTION_SUPERSEDED', 'Dieser Entwurf wurde durch einen neueren Vorschlag ersetzt.')
    }
    if (action.status === 'dismissed') {
      throw new ConflictError('ADVISOR_ACTION_DISMISSED', 'Dieser Entwurf wurde bereits verworfen.')
    }
    assertAiWritable(action.screen, action.field)
    for (const companionField of Object.keys(action.companionFields ?? {})) assertAiWritable(action.screen, companionField)
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
    plans: ReadonlyArray<{ actionId: string; dataUserId: string; writes: ReadonlyArray<{ key: string; expected: string | null }> }>,
  ): Promise<Array<{ actionId: string; key: string; currentValue: string | null }>> {
    const conflicts: Array<{ actionId: string; key: string; currentValue: string | null }> = []
    for (const plan of plans) {
      for (const write of plan.writes) {
        const currentValue = (await this.confirmationService.readRawValue(plan.dataUserId, taxYear, write.key)) ?? null
        if (currentValue !== write.expected) conflicts.push({ actionId: plan.actionId, key: write.key, currentValue })
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

    return this.transactions.run(async () => {
      const drafts: ResolvedDraft[] = []
      const targetKeys = new Set<string>()
      for (const item of dto.drafts) {
        const draft = await this.resolveDraft(userId, taxYear, item.actionId)
        this.assertActionApplicable(draft.action)
        const targetKey = this.targetKeyOf(draft.action)
        if (targetKeys.has(targetKey)) {
          throw new ConflictError('ADVISOR_BATCH_TARGET_CONFLICT', `Mehrere Entwürfe im Batch zielen auf dasselbe Feld "${draft.key}".`)
        }
        targetKeys.add(targetKey)
        drafts.push(draft)
      }

      const plans = drafts.map((draft, i) => ({
        draft,
        actionId: draft.action.actionId,
        dataUserId: draft.dataUserId,
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
      for (const { draft, writes } of plans) {
        const undoSnapshot: AdvisorUndoEntry[] = []
        const provenanceOverride = draft.action.receiptId
          ? ({ kind: 'beleg', receiptId: draft.action.receiptId } as const)
          : undefined
        for (const write of writes) {
          const record = `${draft.dataUserId}|${write.key.slice(0, write.key.lastIndexOf('.'))}`
          const expected = writtenRecords.has(record)
            ? ((await this.confirmationService.readRawValue(draft.dataUserId, taxYear, write.key)) ?? null)
            : write.expected
          undoSnapshot.push(
            await this.confirmationService.writeConfirmedByAdvisor(
              draft.dataUserId,
              taxYear,
              write.key,
              write.newValue,
              expected,
              provenanceOverride,
            ),
          )
          writtenRecords.add(record)
        }
        const { undoneAt: _previousUndo, ...reapplicable } = draft.action
        appliedActions.push({
          ...reapplicable,
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

      await this.supersedePendingDraftsForSameTargets(userId, taxYear, targetKeys, new Set(actionIds))
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

  async undoAction(userId: string, taxYear: number, actionId: string): Promise<AdvisorActionMutationResponseDto> {
    return this.transactions.run(async () => {
      const draft = await this.resolveDraft(userId, taxYear, actionId)
      if (draft.action.status !== 'applied') {
        throw new ConflictError('ADVISOR_ACTION_NOT_APPLIED', 'Nur bereits übernommene Vorschläge können rückgängig gemacht werden.')
      }
      // Drafts applied before snapshots existed only remember the main field's previous value.
      const snapshot: readonly AdvisorUndoEntry[] = draft.action.undoSnapshot ?? [
        { key: draft.key, previousValue: draft.action.previousValue, appliedValue: draft.action.newValue, previousMarking: null },
      ]
      // Main field first, companions after — the reverse of the apply order.
      for (let i = snapshot.length - 1; i >= 0; i -= 1) {
        await this.confirmationService.restoreByAdvisor(draft.dataUserId, taxYear, snapshot[i]!)
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
