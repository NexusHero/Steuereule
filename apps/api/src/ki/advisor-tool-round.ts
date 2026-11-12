// One round of the owl's tool calls: what each tool checks, what it leaves in the state of the turn,
// and what it tells the model. The graph in the engine only decides when a round runs.
import { Annotation } from '@langchain/langgraph'
import { randomUUID } from 'node:crypto'
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { type LangGraphRunnableConfig } from '@langchain/langgraph'
import { z } from 'zod'
import {
  ADVISOR_LEGAL_SOURCES,
  ADVISOR_NOTES_MAX,
  resolveNoteHandle,
  tidyNoteText,
  fieldSpec,
  resolveRecordHandle,
  simulateAdvisorFieldDelta,
  type AdvisorActionProposal,
  type AdvisorNoteChange,
  type AdvisorPreviewEffect,
  type AdvisorPreviewTarget,
  type AdvisorQuestionRound,
  type AdvisorStreamEvent,
  type AdvisorTurnRequest,
  type AdvisorTwoPathsProposal,
  type OwlSourceId,
  type RecordHandleResolution,
  type Screen,
} from '@steuereule/core'
import { checkStageValue, normalizeSourceId, validateStageTarget, type StageTargetCheck } from './advisor-safety.js'
import { checkPiiFree } from './ki.adapter.js'
import { ADVISOR_KNOWLEDGE } from './advisor-knowledge.generated.js'
import { computeIncomeTax } from './advisor-income-tax.js'
import { MAX_COMPANION_FIELDS, TOOL_LABELS, TOOL_ARG_SCHEMAS, isToolName, toolResult, RejectedDraft, MAX_DRAFTS_PER_TURN, draftKey, humanReason } from './advisor-tools.js'

export const AdvisorGraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  toolRounds: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
  /** Every draft of this answer, in the order they were made; a later one for the same field replaces the earlier. */
  pendingActions: Annotation<AdvisorActionProposal[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  /** Drafts the model asked for and did not get, with the screen they aimed at. */
  rejectedDrafts: Annotation<RejectedDraft[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  pendingTwoPaths: Annotation<AdvisorTwoPathsProposal | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  situationSuggestions: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  questionRound: Annotation<AdvisorQuestionRound | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  choices: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  noteChanges: Annotation<AdvisorNoteChange[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  sources: Annotation<OwlSourceId[]>({
    reducer: (left, right) => [...new Set([...left, ...right])],
    default: () => [],
  }),
})


/**
 * Executes the tool calls of the model's last message and returns what changed in the turn.
 * Nothing here writes to the return: tools prepare drafts, notes and plans, and report back.
 */
export async function runToolRound(
  state: typeof AdvisorGraphState.State,
  config: LangGraphRunnableConfig | undefined,
  request: AdvisorTurnRequest,
  makeActionId: () => string,
) {
  const last = state.messages[state.messages.length - 1]
  const toolCalls =
    last && ('tool_calls' in last) && Array.isArray((last as AIMessage).tool_calls)
      ? (last as AIMessage).tool_calls!
      : []

  const toolMessages: ToolMessage[] = []
  let pendingActions = state.pendingActions
  let rejectedDrafts = state.rejectedDrafts
  let pendingTwoPaths = state.pendingTwoPaths
  let choices = state.choices
  let questionRound = state.questionRound
  const situationSuggestions = [...(state.situationSuggestions ?? [])]
  let noteChanges = state.noteChanges
  const sources: OwlSourceId[] = []

  for (const tc of toolCalls) {
    config?.writer?.({
      event: 'tool',
      data: {
        name: tc.name,
        label: TOOL_LABELS[tc.name] ?? `Führe ${tc.name} aus …`,
      },
    } satisfies AdvisorStreamEvent)

    const callId = tc.id ?? `call-${randomUUID().slice(0, 8)}`
    if (!isToolName(tc.name)) {
      toolMessages.push(toolResult(callId, tc.name, { ok: false, error: `UNKNOWN_TOOL: "${tc.name}" wird nicht unterstützt.` }))
      continue
    }
    const parseArgs = <S extends z.ZodTypeAny>(schema: S): z.infer<S> | null => {
      const parsed = schema.safeParse(tc.args ?? {})
      if (parsed.success) return parsed.data as z.infer<S>
      const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
      toolMessages.push(toolResult(callId, tc.name, { ok: false, error: `INVALID_ARGUMENTS: ${fields}` }))
      return null
    }

    const rejectTarget = (target: Extract<StageTargetCheck, { ok: false }>): void => {
      // A locked field is not a dead end for the user: the workbench opens it for manual entry.
      if (target.locked) {
        config?.writer?.({
          event: 'ui_command',
          data: { openMask: target.locked.screen, focus: target.locked.field },
        } satisfies AdvisorStreamEvent)
      }
      toolMessages.push(toolResult(callId, tc.name, { ok: false, error: target.error }))
    }
    /** Refuses a draft: the model gets the reason, and the answer will carry it unless a retry succeeds. */
    const refuseDraft = (label: string, screen: string, error: string, openScreen?: Screen): void => {
      rejectedDrafts = [...rejectedDrafts, { label, screen, reason: humanReason(error), ...(openScreen ? { openScreen } : {}) }]
    }
    /**
     * Which stored record a draft is for. Masks with one record per case take no instance at
     * all; the others are addressed by their neutral name, and the id is filled in here.
     */
    const resolveInstance = (screen: Screen, field: string, raw: string | null | undefined): RecordHandleResolution | { ok: true; id: null; handle: null } => {
      if (!fieldSpec(screen, field)?.perInstance) return { ok: true, id: null, handle: null }
      return resolveRecordHandle(screen, request.records?.[screen] ?? [], raw)
    }

    /**
     * The euro effect of a draft: from the app's own estimate where the caller offers it, and
     * never a made-up figure when the estimate cannot say. The approximation over the digest
     * only remains for setups without a database behind the engine.
     */
    const effectOf = async (
      target: AdvisorPreviewTarget,
      approximation: { beforeRefundEur: number; afterRefundEur: number; deltaEur: number },
    ): Promise<Pick<AdvisorActionProposal, 'beforeRefundEur' | 'afterRefundEur' | 'deltaEur' | 'effect' | 'effectHint'>> => {
      if (!request.previewEffect) return approximation
      let preview: AdvisorPreviewEffect
      try {
        preview = await request.previewEffect(target)
      } catch {
        preview = { kind: 'not-computable', hint: 'Die Wirkung lässt sich gerade nicht berechnen.' }
      }
      if (preview.kind === 'computed') {
        return { beforeRefundEur: preview.beforeRefundEur, afterRefundEur: preview.afterRefundEur, deltaEur: preview.deltaEur, effect: 'computed' }
      }
      return { beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, effect: 'not-computable', effectHint: preview.hint }
    }

    if (tc.name === 'simulate_tax_delta') {
      const args = parseArgs(TOOL_ARG_SCHEMAS.simulate_tax_delta)
      if (args === null) continue
      const { screen, field, newValue } = args
      const target = validateStageTarget(screen, field)
      if (!target.ok) {
        rejectTarget(target)
        continue
      }
      const simValue = checkStageValue(target.screen, field, newValue)
      if (!simValue.ok) {
        toolMessages.push(toolResult(callId, tc.name, { ok: false, error: simValue.error }))
        continue
      }
      const sim = simulateAdvisorFieldDelta(request.digest, target.screen, field.trim(), simValue.value)
      const simRecord = resolveInstance(target.screen, field.trim(), null)
      const simEffect = simRecord.ok
        ? await effectOf({ screen: target.screen, instance: simRecord.id, values: [[field.trim(), simValue.value]] }, sim)
        : ({ beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, effect: 'not-computable', effectHint: simRecord.reason } as const)
      toolMessages.push(new ToolMessage({ tool_call_id: callId, name: tc.name, content: JSON.stringify({ ok: true, previousValue: sim.previousValue, ...simEffect }) }))
      continue
    }

    if (tc.name === 'stage_field_draft') {
      const args = parseArgs(TOOL_ARG_SCHEMAS.stage_field_draft)
      if (args === null) continue
      const { screen, field, label, reason } = args
      const sourceId = normalizeSourceId(args.sourceId)
      const rawCompanions = Object.entries(args.companionFields ?? {}).map(([k, v]) => [k.trim(), v] as const)

      const target = validateStageTarget(screen, field)
      if (!target.ok) {
        refuseDraft(label, screen, target.error)
        rejectTarget(target)
        continue
      }
      if (rawCompanions.length > MAX_COMPANION_FIELDS) {
        toolMessages.push(toolResult(callId, tc.name, { ok: false, error: `INVALID_ARGUMENTS: höchstens ${MAX_COMPANION_FIELDS} Begleitfelder.` }))
        continue
      }
      const record = resolveInstance(target.screen, field.trim(), args.instance)
      if (!record.ok) {
        const error = `${record.code}: ${record.reason}`
        // No record yet: the user creates it in the mask, and the chat offers the way there.
        // Which of several: that is a question for the user, not something to report as failed.
        if (record.code !== 'RECORD_REQUIRED') refuseDraft(label, screen, error, record.code === 'NO_RECORD' ? target.screen : undefined)
        if (record.code === 'NO_RECORD') {
          config?.writer?.({ event: 'ui_command', data: { openMask: target.screen, focus: field.trim() } } satisfies AdvisorStreamEvent)
        }
        toolMessages.push(toolResult(callId, tc.name, { ok: false, error }))
        continue
      }
      const instance = record.id
      if (pendingActions.length >= MAX_DRAFTS_PER_TURN) {
        const error = `TOO_MANY_DRAFTS: höchstens ${MAX_DRAFTS_PER_TURN} Entwürfe pro Antwort. Bitte den Nutzer erst diese prüfen lassen.`
        refuseDraft(label, screen, error)
        toolMessages.push(toolResult(callId, tc.name, { ok: false, error }))
        continue
      }
      // Companion fields are written with the same rights as the main field, so they pass the same gate.
      const lockedCompanion = rawCompanions
        .map(([companionField]) => validateStageTarget(screen, companionField))
        .find((check): check is Extract<StageTargetCheck, { ok: false }> => !check.ok)
      if (lockedCompanion) {
        refuseDraft(label, screen, lockedCompanion.error)
        rejectTarget(lockedCompanion)
        continue
      }
      // Every value is checked against the field catalogue and stored in its tidied form: a
      // draft that could not be applied is refused here, with the reason, instead of being made.
      const checkedValues = [[field.trim(), args.newValue] as const, ...rawCompanions].map(([name, value]) => ({ name, check: checkStageValue(screen, name, value) }))
      const badValue = checkedValues.find((entry) => !entry.check.ok)
      if (badValue && !badValue.check.ok) {
        refuseDraft(label, screen, badValue.check.error)
        toolMessages.push(toolResult(callId, tc.name, { ok: false, error: badValue.check.error }))
        continue
      }
      const tidy = (name: string): string => {
        const entry = checkedValues.find((candidate) => candidate.name === name)!
        return entry.check.ok ? entry.check.value : ''
      }
      const newValue = tidy(field.trim())
      const companionEntries = rawCompanions.map(([name]) => [name, tidy(name)] as const)
      const companionFields = companionEntries.length > 0 ? Object.fromEntries(companionEntries) : undefined

      try {
        checkPiiFree({ newValue, label, reason, companionFields: companionFields ?? {} })
      } catch (error) {
        toolMessages.push(
          new ToolMessage({
            tool_call_id: callId,
            name: tc.name,
            content: JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : 'PII boundary rejected draft payload.',
            }),
          }),
        )
        continue
      }

      const cleanField = field.trim()
      const sim = simulateAdvisorFieldDelta(request.digest, target.screen, cleanField, newValue)
      const effect = await effectOf({ screen: target.screen, instance, values: [...companionEntries, [cleanField, newValue]] }, sim)
      sources.push(sourceId)

      const stagedAction: AdvisorActionProposal = {
        actionId: makeActionId(),
        status: 'pending',
        screen: target.screen,
        field: cleanField,
        instance,
        ...(companionFields ? { companionFields } : {}),
        label: record.handle && !label.includes(record.handle) ? `${label} (${record.handle})` : label,
        previousValue: sim.previousValue,
        expectedPreviousValue: sim.previousValue,
        newValue,
        ...effect,
        reason,
        sourceId,
        paragraph: ADVISOR_LEGAL_SOURCES[sourceId].paragraph,
      }

      // Several drafts in one answer stand side by side; a second one for the same field is a correction.
      pendingActions = [...pendingActions.filter((existing) => draftKey(existing) !== draftKey(stagedAction)), stagedAction]

      toolMessages.push(toolResult(callId, tc.name, { ok: true, stagedAction: { ...stagedAction, instance: record.handle }, draftsInThisAnswer: pendingActions.length }))
      continue
    }

    if (tc.name === 'propose_two_paths') {
      const args = parseArgs(TOOL_ARG_SCHEMAS.propose_two_paths)
      if (args === null) continue
      const title = args.title
      const sourceId = normalizeSourceId(args.sourceId)
      const rawSafe = args.safePath
      const rawMax = args.maxPath

      const safeCheck = validateStageTarget(rawSafe.screen, rawSafe.field)
      if (!safeCheck.ok) {
        rejectTarget(safeCheck)
        continue
      }
      const maxCheck = validateStageTarget(rawMax.screen, rawMax.field)
      if (!maxCheck.ok) {
        rejectTarget(maxCheck)
        continue
      }

      const safeField = rawSafe.field.trim()
      const maxField = rawMax.field.trim()
      const safeValue = checkStageValue(safeCheck.screen, safeField, rawSafe.newValue)
      const maxValue = checkStageValue(maxCheck.screen, maxField, rawMax.newValue)
      if (!safeValue.ok || !maxValue.ok) {
        toolMessages.push(toolResult(callId, tc.name, { ok: false, error: !safeValue.ok ? safeValue.error : !maxValue.ok ? maxValue.error : '' }))
        continue
      }
      const safeNewValue = safeValue.value
      const maxNewValue = maxValue.value

      // Two paths name no record: fine while there is exactly one, a question for the user otherwise.
      const safeRecord = resolveInstance(safeCheck.screen, safeField, rawSafe.instance)
      const maxRecord = resolveInstance(maxCheck.screen, maxField, rawMax.instance)
      const missingRecord = !safeRecord.ok ? safeRecord : !maxRecord.ok ? maxRecord : null
      if (!safeRecord.ok || !maxRecord.ok || missingRecord) {
        toolMessages.push(toolResult(callId, tc.name, { ok: false, error: missingRecord ? `${missingRecord.code}: ${missingRecord.reason}` : '' }))
        continue
      }
      try {
        checkPiiFree({ safeNewValue, maxNewValue, title, safeLabel: rawSafe.label, maxLabel: rawMax.label })
      } catch (error) {
        toolMessages.push(
          new ToolMessage({
            tool_call_id: callId,
            name: tc.name,
            content: JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : 'PII boundary rejected twoPaths payload.',
            }),
          }),
        )
        continue
      }

      const safeSim = simulateAdvisorFieldDelta(request.digest, safeCheck.screen, safeField, safeNewValue)
      const maxSim = simulateAdvisorFieldDelta(request.digest, maxCheck.screen, maxField, maxNewValue)
      const safeEffect = await effectOf({ screen: safeCheck.screen, instance: safeRecord.id, values: [[safeField, safeNewValue]] }, safeSim)
      const maxEffect = await effectOf({ screen: maxCheck.screen, instance: maxRecord.id, values: [[maxField, maxNewValue]] }, maxSim)
      const baseActionId = makeActionId()
      sources.push(sourceId)

      pendingTwoPaths = {
        title,
        sourceId,
        safePath: {
          actionId: `${baseActionId}-safe`,
          status: 'pending',
          screen: safeCheck.screen,
          field: safeField,
          instance: safeRecord.id,
          label: rawSafe.label,
          previousValue: safeSim.previousValue,
          expectedPreviousValue: safeSim.previousValue,
          newValue: safeNewValue,
          ...safeEffect,
          reason: rawSafe.reason,
          sourceId,
          paragraph: ADVISOR_LEGAL_SOURCES[sourceId].paragraph,
        },
        maxPath: {
          actionId: `${baseActionId}-max`,
          status: 'pending',
          screen: maxCheck.screen,
          field: maxField,
          instance: maxRecord.id,
          label: rawMax.label,
          previousValue: maxSim.previousValue,
          expectedPreviousValue: maxSim.previousValue,
          newValue: maxNewValue,
          ...maxEffect,
          reason: rawMax.reason,
          evidenceHint: rawMax.evidenceHint,
          sourceId,
          paragraph: ADVISOR_LEGAL_SOURCES[sourceId].paragraph,
        },
      }

      toolMessages.push(toolResult(callId, tc.name, { ok: true, twoPaths: pendingTwoPaths }))
      continue
    }

    if (tc.name === 'ask_questions') {
      const args = parseArgs(TOOL_ARG_SCHEMAS.ask_questions)
      if (args === null) continue
      questionRound = {
        questions: args.questions.map((q) => {
          const options = q.options.map((o) => o.trim()).filter((o) => o.length > 0)
          return { text: q.text.trim(), options, ...(q.recommended !== undefined && options.includes(q.recommended.trim()) ? { recommended: q.recommended.trim() } : {}) }
        }),
      }
      toolMessages.push(toolResult(callId, tc.name, { ok: true, questions: questionRound.questions.length }))
      continue
    }

    if (tc.name === 'suggest_situation') {
      const args = parseArgs(TOOL_ARG_SCHEMAS.suggest_situation)
      if (args === null) continue
      const text = args.text.replace(/\s+/g, ' ').trim()
      try {
        // A suggestion is shown to the user and may be stored: it must not carry a name or an identifier.
        checkPiiFree({ text })
      } catch {
        toolMessages.push(toolResult(callId, tc.name, { ok: false, error: 'Der Vorschlag enthält persönliche Daten. Formuliere ihn ohne Namen und Kennungen.' }))
        continue
      }
      if (situationSuggestions.length < 3 && !situationSuggestions.includes(text)) situationSuggestions.push(text)
      toolMessages.push(toolResult(callId, tc.name, { ok: true, suggested: text }))
      continue
    }

    if (tc.name === 'lookup_tax_knowledge') {
      const args = parseArgs(TOOL_ARG_SCHEMAS.lookup_tax_knowledge)
      if (args === null) continue
      const entry = ADVISOR_KNOWLEDGE[args.topic]
      toolMessages.push(toolResult(callId, tc.name, { ok: true, topic: args.topic, title: entry.title, text: entry.text }))
      continue
    }

    if (tc.name === 'compute_income_tax') {
      const args = parseArgs(TOOL_ARG_SCHEMAS.compute_income_tax)
      if (args === null) continue
      if (args.churchTaxRate !== 0 && args.churchTaxRate !== 0.08 && args.churchTaxRate !== 0.09) {
        toolMessages.push(toolResult(callId, tc.name, { ok: false, error: 'Der Kirchensteuersatz ist 0, 0.08 (Bayern, Baden-Württemberg) oder 0.09.' }))
        continue
      }
      const result = computeIncomeTax({ ...args, churchTaxRate: args.churchTaxRate })
      toolMessages.push(toolResult(callId, tc.name, result === null ? { ok: false, error: `Für das Jahr ${args.year} kennt der Rechenkern keinen Tarif.` } : { ok: true, ...result }))
      continue
    }

    if (tc.name === 'ask_clarification') {
      const args = parseArgs(TOOL_ARG_SCHEMAS.ask_clarification)
      if (args === null) continue
      choices = args.choices.map((c) => c.trim()).filter((c) => c.length > 0)
      toolMessages.push(toolResult(callId, tc.name, { ok: true, choices }))
      continue
    }

    if (tc.name === 'remember_note' || tc.name === 'replace_note' || tc.name === 'forget_note') {
      // The notes as they stand after what this answer has already changed.
      const gone = new Set(noteChanges.filter((change) => change.kind === 'removed').map((change) => change.noteId))
      const added = noteChanges.filter((change) => change.kind === 'added').length
      const known = (request.notes ?? []).filter((note) => !gone.has(note.id))
      const refuse = (error: string) => toolMessages.push(toolResult(callId, tc.name, { ok: false, error }))

      if (tc.name === 'forget_note') {
        const args = parseArgs(TOOL_ARG_SCHEMAS.forget_note)
        if (args === null) continue
        const note = resolveNoteHandle(known, args.note)
        if (!note) {
          refuse(`UNKNOWN_NOTE: „${args.note}“ gibt es nicht. Vorhanden: ${known.map((n) => n.handle).join(', ') || 'keine'}.`)
          continue
        }
        noteChanges = [...noteChanges.filter((change) => change.noteId !== note.id), { kind: 'removed', noteId: note.id, text: note.text }]
        toolMessages.push(toolResult(callId, tc.name, { ok: true, removed: note.handle }))
        continue
      }

      // One parse per call: a failed parse has already answered the call with its error.
      const replaceArgs = tc.name === 'replace_note' ? parseArgs(TOOL_ARG_SCHEMAS.replace_note) : null
      const args = tc.name === 'replace_note' ? replaceArgs : parseArgs(TOOL_ARG_SCHEMAS.remember_note)
      if (args === null) continue
      const text = tidyNoteText(args.text)
      if (!text.ok) {
        refuse(`INVALID_NOTE: ${text.reason}`)
        continue
      }
      try {
        checkPiiFree({ note: text.text })
      } catch {
        refuse('INVALID_NOTE: Eine Notiz darf keine persönlichen Daten enthalten (Namen, Adressen, Steuer-ID, IBAN, Geburtsdatum).')
        continue
      }
      if (replaceArgs !== null) {
        const note = resolveNoteHandle(known, replaceArgs.note)
        if (!note) {
          refuse(`UNKNOWN_NOTE: „${replaceArgs.note}“ gibt es nicht. Vorhanden: ${known.map((n) => n.handle).join(', ') || 'keine'}.`)
          continue
        }
        const before = noteChanges.find((change) => change.noteId === note.id)?.previousText ?? note.text
        noteChanges = [...noteChanges.filter((change) => change.noteId !== note.id), { kind: 'replaced', noteId: note.id, text: text.text, previousText: before }]
        toolMessages.push(toolResult(callId, tc.name, { ok: true, replaced: note.handle }))
        continue
      }
      if (known.length + added >= ADVISOR_NOTES_MAX) {
        refuse(`TOO_MANY_NOTES: höchstens ${ADVISOR_NOTES_MAX} Notizen. Ersetze oder entferne zuerst eine überholte.`)
        continue
      }
      if ([...known.map((n) => n.text), ...noteChanges.filter((c) => c.kind === 'added').map((c) => c.text)].some((existing) => existing.toLowerCase() === text.text.toLowerCase())) {
        toolMessages.push(toolResult(callId, tc.name, { ok: true, alreadyNoted: true }))
        continue
      }
      noteChanges = [...noteChanges, { kind: 'added', text: text.text }]
      toolMessages.push(toolResult(callId, tc.name, { ok: true, noted: text.text }))
      continue
    }

    if (tc.name === 'plan_steps') {
      const args = parseArgs(TOOL_ARG_SCHEMAS.plan_steps)
      if (args === null) continue
      const steps = args.steps.map((step) => ({ text: step.text.trim(), status: step.status }))
      try {
        checkPiiFree({ steps })
      } catch (error) {
        toolMessages.push(toolResult(callId, tc.name, { ok: false, error: error instanceof Error ? error.message : 'PII boundary rejected plan.' }))
        continue
      }
      config?.writer?.({ event: 'plan', data: { steps } } satisfies AdvisorStreamEvent)
      toolMessages.push(toolResult(callId, tc.name, { ok: true, shown: steps.length }))
      continue
    }

    const lookupArgs = parseArgs(TOOL_ARG_SCHEMAS.lookup_legal_source)
    if (lookupArgs === null) continue
    const sourceId = normalizeSourceId(lookupArgs.sourceId)
    sources.push(sourceId)
    toolMessages.push(toolResult(callId, tc.name, { ok: true, source: ADVISOR_LEGAL_SOURCES[sourceId] }))
  }

  return {
    messages: toolMessages,
    toolRounds: state.toolRounds + 1,
    pendingActions,
    rejectedDrafts,
    pendingTwoPaths,
    choices,
    questionRound,
    situationSuggestions,
    noteChanges,
    sources,
  }
}
