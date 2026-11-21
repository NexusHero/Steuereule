// What a tool handler gets for one call of the owl: the request of the turn, the state the round
// accumulates, and the small helpers every draft tool shares (answer, refuse, resolve the record, price it).
import { randomUUID } from 'node:crypto'
import { ToolMessage } from '@langchain/core/messages'
import { type LangGraphRunnableConfig } from '@langchain/langgraph'
import { z } from 'zod'
import {
  fieldSpec,
  resolveRecordHandle,
  type AdvisorActionProposal,
  type AdvisorNoteChange,
  type InterviewAreaChange,
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
import { type StageTargetCheck } from '../advisor-safety.js'
import { toolResultLine } from '../advisor-tool-results.js'
import { toolResult, userReason, type RejectedDraft, type ToolName } from '../advisor-tools.js'

/** One tool call of the model's last message. */
export interface ToolCall<N extends string = ToolName> {
  readonly name: N
  readonly args: Record<string, unknown> | undefined
}

/**
 * What the round accumulates over its calls, in the order they come. Handlers replace or push
 * into these fields; the round returns them as the change of the turn.
 */
export interface ToolRoundTurn {
  pendingActions: AdvisorActionProposal[]
  rejectedDrafts: RejectedDraft[]
  pendingTwoPaths: AdvisorTwoPathsProposal | null
  choices: string[]
  questionRound: AdvisorQuestionRound | null
  situationSuggestions: string[]
  noteChanges: AdvisorNoteChange[]
  interviewChanges: InterviewAreaChange[]
  consentRequested: boolean
  sources: OwlSourceId[]
}

type DraftEffect = Pick<AdvisorActionProposal, 'beforeRefundEur' | 'afterRefundEur' | 'deltaEur' | 'effect' | 'effectHint'>

export interface ToolCallContext {
  readonly request: AdvisorTurnRequest
  readonly config: LangGraphRunnableConfig | undefined
  /** The user consented to personal data for the owl (ADR-0091); without it nothing changes. */
  readonly consent: boolean
  readonly makeActionId: () => string
  readonly turn: ToolRoundTurn
  /** Answers the model and tells the user in a few words what the tool found. */
  answer(payload: Record<string, unknown>): void
  /** The call's arguments, or null when they do not fit: the call is then already answered with the error. */
  parseArgs<S extends z.ZodTypeAny>(schema: S): z.infer<S> | null
  rejectTarget(target: Extract<StageTargetCheck, { ok: false }>): void
  /** Refuses a draft: the model gets the reason, and the answer will carry it unless a retry succeeds. */
  refuseDraft(label: string, screen: string, error: string, openScreen?: Screen, consentRequired?: true): void
  /**
   * Which stored record a draft is for. Masks with one record per case take no instance at
   * all; the others are addressed by their neutral name, and the id is filled in here.
   */
  resolveInstance(screen: Screen, field: string, raw: string | null | undefined): RecordHandleResolution | { ok: true; id: null; handle: null }
  /**
   * The euro effect of a draft: from the app's own estimate where the caller offers it, and
   * never a made-up figure when the estimate cannot say. The approximation over the digest
   * only remains for setups without a database behind the engine.
   */
  effectOf(target: AdvisorPreviewTarget, approximation: { beforeRefundEur: number; afterRefundEur: number; deltaEur: number }): Promise<DraftEffect>
}

/** Executes the calls of one tool, or of a small group of tools that share their checks. */
export interface ToolHandler<N extends ToolName = ToolName> {
  readonly names: readonly N[]
  run(call: ToolCall<N>, ctx: ToolCallContext): void | Promise<void>
}

export function toolHandler<N extends ToolName>(names: readonly N[], run: (call: ToolCall<N>, ctx: ToolCallContext) => void | Promise<void>): ToolHandler<N> {
  return { names, run }
}

export function createToolCallContext(input: {
  call: ToolCall<string> & { readonly id?: string }
  config: LangGraphRunnableConfig | undefined
  request: AdvisorTurnRequest
  consent: boolean
  makeActionId: () => string
  turn: ToolRoundTurn
  toolMessages: ToolMessage[]
}): ToolCallContext {
  const { call, config, request, consent, makeActionId, turn, toolMessages } = input
  const callId = call.id ?? `call-${randomUUID().slice(0, 8)}`
  const answer = (payload: Record<string, unknown>): void => {
    toolMessages.push(toolResult(callId, call.name, payload))
    config?.writer?.({
      event: 'tool_result',
      data: { name: call.name, ok: payload.ok === true, result: toolResultLine(call.name, payload) },
    } satisfies AdvisorStreamEvent)
  }
  const parseArgs = <S extends z.ZodTypeAny>(schema: S): z.infer<S> | null => {
    const parsed = schema.safeParse(call.args ?? {})
    if (parsed.success) return parsed.data as z.infer<S>
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
    answer({ ok: false, error: `INVALID_ARGUMENTS: ${fields}` })
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
    answer({ ok: false, error: target.error })
  }
  const refuseDraft = (label: string, screen: string, error: string, openScreen?: Screen, consentRequired?: true): void => {
    turn.rejectedDrafts = [...turn.rejectedDrafts, { label, screen, reason: userReason(error), ...(openScreen ? { openScreen } : {}), ...(consentRequired ? { consentRequired } : {}) }]
  }
  const resolveInstance = (screen: Screen, field: string, raw: string | null | undefined): RecordHandleResolution | { ok: true; id: null; handle: null } => {
    if (!fieldSpec(screen, field)?.perInstance) return { ok: true, id: null, handle: null }
    // A new record (ADR-0091): a rental object always, a child only with the consent to personal data.
    const allowNew = screen === 'vermietung' || (screen === 'kind' && consent)
    return resolveRecordHandle(screen, request.records?.[screen] ?? [], raw, { allowNew })
  }

  const effectOf = async (
    target: AdvisorPreviewTarget,
    approximation: { beforeRefundEur: number; afterRefundEur: number; deltaEur: number },
  ): Promise<DraftEffect> => {
    if (!request.previewEffect) {
      // The approximation only knows the user's own figures; for Person B it would be made up.
      return target.person === 'B'
        ? { beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, effect: 'not-computable', effectHint: 'Die Wirkung für Person B zeigt erst die gemeinsame Schätzung.' }
        : approximation
    }
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

  return { request, config, consent, makeActionId, turn, answer, parseArgs, rejectTarget, refuseDraft, resolveInstance, effectOf }
}

/** A staged draft as the fixed rules read it: its mask and every value it would write. */
export function draftValuesOf(action: AdvisorActionProposal): { screen: Screen; values: Record<string, string> } {
  return { screen: action.screen, values: { [action.field]: action.newValue, ...action.companionFields } }
}
