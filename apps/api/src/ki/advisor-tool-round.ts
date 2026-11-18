// One round of the owl's tool calls: the loop over the model's last message that hands each call to
// its handler in ./tools/ and collects what the turn changed. The graph in the engine only decides when a round runs.
import { Annotation } from '@langchain/langgraph'
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { type LangGraphRunnableConfig } from '@langchain/langgraph'
import {
  ADVISOR_LEGAL_SOURCES,
  deriveBasisAnswers,
  type AdvisorActionProposal,
  type AdvisorNoteChange,
  type InterviewAreaChange,
  type AdvisorQuestionRound,
  type AdvisorStreamEvent,
  type AdvisorTurnRequest,
  type AdvisorTwoPathsProposal,
  type OwlSourceId,
} from '@steuereule/core'
import { checkStageValue, validateStageTarget } from './advisor-safety.js'
import { TOOL_LABELS, isToolName, RejectedDraft, MAX_DRAFTS_PER_TURN } from './advisor-tools.js'
import { createToolCallContext, toolHandlerFor, type ToolRoundTurn } from './tools/index.js'

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
  interviewChanges: Annotation<InterviewAreaChange[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  /** The owl asked the app to show the consent card for personal data (ADR-0091). */
  consentRequested: Annotation<boolean>({
    reducer: (left, right) => left || right,
    default: () => false,
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
  /** The user consented to personal data for the owl (ADR-0091); without it nothing changes. */
  const consent = request.personalDataConsent === true
  const turn: ToolRoundTurn = {
    pendingActions: state.pendingActions,
    rejectedDrafts: state.rejectedDrafts,
    pendingTwoPaths: state.pendingTwoPaths,
    choices: state.choices,
    questionRound: state.questionRound,
    situationSuggestions: [...(state.situationSuggestions ?? [])],
    noteChanges: state.noteChanges,
    interviewChanges: state.interviewChanges ?? [],
    consentRequested: state.consentRequested ?? false,
    sources: [],
  }

  for (const tc of toolCalls) {
    config?.writer?.({
      event: 'tool',
      data: {
        name: tc.name,
        label: TOOL_LABELS[tc.name] ?? `Führe ${tc.name} aus …`,
      },
    } satisfies AdvisorStreamEvent)

    const ctx = createToolCallContext({ call: tc, config, request, consent, makeActionId, turn, toolMessages })
    if (!isToolName(tc.name)) {
      ctx.answer({ ok: false, error: `UNKNOWN_TOOL: "${tc.name}" wird nicht unterstützt.` })
      continue
    }
    await toolHandlerFor(tc.name).run({ name: tc.name, args: tc.args }, ctx)
  }

  const pendingActions = withDerivedBasisDrafts(turn.pendingActions, request, makeActionId)

  return {
    messages: toolMessages,
    toolRounds: state.toolRounds + 1,
    pendingActions,
    rejectedDrafts: turn.rejectedDrafts,
    pendingTwoPaths: turn.pendingTwoPaths,
    choices: turn.choices,
    questionRound: turn.questionRound,
    situationSuggestions: turn.situationSuggestions,
    noteChanges: turn.noteChanges,
    interviewChanges: turn.interviewChanges,
    consentRequested: turn.consentRequested,
    sources: turn.sources,
  }
}

/**
 * Basis answers the owl can read off the case (job from a wage tax certificate, Switzerland from a
 * Swiss salary statement) become ordinary drafts when the model did not stage them itself. They pass
 * the same checks as the model's drafts and the user confirms them like any other.
 */
function withDerivedBasisDrafts(pending: AdvisorActionProposal[], request: AdvisorTurnRequest, makeActionId: () => string): AdvisorActionProposal[] {
  let result = pending
  for (const derived of deriveBasisAnswers(request.digest)) {
    if (result.length >= MAX_DRAFTS_PER_TURN) break
    if (result.some((existing) => existing.screen === 'interview' && existing.field === derived.field && existing.person === undefined)) continue
    if (!validateStageTarget('interview', derived.field).ok) continue
    const value = checkStageValue('interview', derived.field, derived.value)
    if (!value.ok) continue
    result = [
      ...result,
      {
        actionId: makeActionId(),
        status: 'pending',
        screen: 'interview',
        field: derived.field,
        instance: null,
        label: derived.label,
        previousValue: null,
        expectedPreviousValue: null,
        newValue: value.value,
        beforeRefundEur: 0,
        afterRefundEur: 0,
        deltaEur: 0,
        effect: 'not-computable',
        effectHint: 'Diese Angabe bestimmt, welche Schätzung möglich ist; sie ändert für sich keinen Betrag.',
        reason: derived.reason,
        sourceId: derived.sourceId,
        paragraph: ADVISOR_LEGAL_SOURCES[derived.sourceId].paragraph,
      },
    ]
  }
  return result
}
