import { newActionId } from '../common/action-id.js'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { END, START, StateGraph } from '@langchain/langgraph'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import {
  checkAdvisorAnswer,
  checkAdvisorInputBoundary,
  describeModelFailure,
  evaluateAdvisorTurn,
  preparedDraftsSentence,
  withPreviewedEffects,
  topicRefusal,
  type AdvisorActionProposal,
  type AdvisorEnginePort,
  type AdvisorModelFailure,
  type AdvisorMessageMeta,
  type AdvisorNoteChange,
  type AdvisorQuestionRound,
  type InterviewAreaChange,
  type AdvisorStreamEvent,
  type AdvisorSummaryRequest,
  type AdvisorTopicOutcome,
  type AdvisorTurnRequest,
  type AdvisorTurnResult,
  type AdvisorTwoPathsProposal,
  type OwlSourceId,
} from '@steuereule/core'
import { depthSetting, type AdvisorDepth } from '@steuereule/core'
import { AI_RUNTIME_CONFIG_SERVICE, DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService, type AiTurnLimits, type ResolvedAiSlotConfig } from '../llm/ai-runtime-config.service.js'
import { anthropicThinksOnBudget, CHAT_MODEL_FACTORY, type ChatModelFactory } from '../llm/chat-model.factory.js'
import { createAdvisorChatModel } from './advisor-chat-model.js'
import { classifyModelFailure, providerName } from '../llm/model-failure.js'
import { extractMessageText } from '../llm/llm-json.js'
import { ANSWER_RESERVE_MS, createModelNode, createToolsNode, extractReasoningText, followAgentRun, lastModelText, newAgentRunProgress, newAgentTimings, openTurnBudget, sumUsage, toolsOrEnd, type AgentTimings } from '../llm/agent/agent-loop.js'

export { ANSWER_RESERVE_MS, extractReasoningText }
import { checkPiiFree } from './ki.adapter.js'
import { buildCaseBlock, buildSystemMessage, buildTurnMessages, describeTurnContext, SUMMARY_MAX_CHARS, SUMMARY_INSTRUCTIONS, withHistoryCacheBreakpoint } from './advisor-prompt.js'
import { buildToolSchemas, RejectedDraft, computedFiguresOf, unresolvedRejections } from './advisor-tools.js'
import { AdvisorGraphState, runToolRound } from './advisor-tool-round.js'
import { ADVISOR_TOPIC_GUARD, type AdvisorTopicGuardPort } from './advisor-topic-guard.js'
export { toProviderToolSchema, buildToolSchemas, computedFiguresOf, unresolvedRejections } from './advisor-tools.js'
export { buildCaseBlock, buildStableSystemPrompt, buildSystemMessage, buildTurnMessages, describeTurnContext, TURN_CONTEXT_HEADER, USER_MESSAGE_HEADER, userTextOf, withHistoryCacheBreakpoint } from './advisor-prompt.js'


/**
 * The savings plan and the assessment check look things up, plan, calculate and draft before they
 * answer. Seen against the real model: with the five rounds of a question the plan ended on a
 * draft and never reached its answer.
 */
export const TASK_TOOL_ROUNDS = 10
export const TASK_TIMEOUT_MS = 120_000
/**
 * Max (ADR-0096): room for the answer after deep thinking, kept below what the Anthropic SDK still
 * allows without streaming (about 21k tokens), and the time of a task, since thinking at Max took
 * longer than the 60 s of one question and the turn fell back.
 */
export const MAX_DEPTH_OUTPUT_TOKENS = 20_000

/** Said to the model when it ended a round after tools without a word. */
export const ANSWER_NUDGE = 'Antworte jetzt dem Nutzer in Worten auf seine Frage, mit dem, was die Werkzeuge ergeben haben (Regel mit Norm, Betrag oder Satz, nächster Schritt). Keine weiteren Werkzeuge.'

/** The answer when the model sent nothing at all in a round. */
const SILENT_ANSWER = 'Ich habe deine Angaben geprüft, konnte aber keine Antwort erzeugen.'

type OwlStateUpdate = Partial<typeof AdvisorGraphState.State>

/** What the owl's tools produced in one turn, as the updates of her graph state report it. */
interface TurnFindings {
  pendingActions: AdvisorActionProposal[]
  rejectedDrafts: RejectedDraft[]
  noteChanges: AdvisorNoteChange[]
  interviewChanges: InterviewAreaChange[]
  consentRequested: boolean
  pendingTwoPaths: AdvisorTwoPathsProposal | null
  choices: string[]
  questionRound: AdvisorQuestionRound | null
  situationSuggestions: string[]
  sources: OwlSourceId[]
}

const newTurnFindings = (): TurnFindings => ({
  pendingActions: [],
  rejectedDrafts: [],
  noteChanges: [],
  interviewChanges: [],
  consentRequested: false,
  pendingTwoPaths: null,
  choices: [],
  questionRound: null,
  situationSuggestions: [],
  sources: [],
})

/** Takes one node update into the findings: lists are replaced by their newest state, sources add up, a consent request stays. */
function noteUpdate(found: TurnFindings, update: OwlStateUpdate): void {
  if (Array.isArray(update.pendingActions)) found.pendingActions = update.pendingActions
  if (Array.isArray(update.rejectedDrafts)) found.rejectedDrafts = update.rejectedDrafts
  if ('pendingTwoPaths' in update && update.pendingTwoPaths !== undefined) found.pendingTwoPaths = update.pendingTwoPaths
  if (Array.isArray(update.choices)) found.choices = update.choices
  if (Array.isArray(update.situationSuggestions)) found.situationSuggestions = update.situationSuggestions
  if (update.questionRound) found.questionRound = update.questionRound
  if (Array.isArray(update.noteChanges)) found.noteChanges = update.noteChanges
  if (update.consentRequested === true) found.consentRequested = true
  if (Array.isArray(update.interviewChanges)) found.interviewChanges = update.interviewChanges
  if (Array.isArray(update.sources)) found.sources = [...new Set([...found.sources, ...update.sources])]
}

/** An answer of the fixed rules, marked as theirs. */
const rulesResult = (replyText: string, meta: AdvisorMessageMeta): AdvisorTurnResult => ({
  replyText,
  meta,
  mode: 'deterministic_fallback',
  provider: 'deterministic',
  model: 'deterministic-fallback',
})

/** How the graph of one model turn is built. */
interface GraphOptions {
  readonly maxToolRounds: number
  readonly canForceTool: boolean
  /** From this moment (epoch ms) on, the model answers without tools. */
  readonly answerBy: number
  /** Anthropic caches only marked prefixes: each round marks its newest message (see `withHistoryCacheBreakpoint`). */
  readonly markHistoryForCache: boolean
  readonly timings: AgentTimings
  /** Awaited before any tool runs: a turn started beside the topic guard touches nothing until the verdict is in. */
  readonly beforeTools?: (() => Promise<void>) | undefined
}

/** One turn with one model: which model, within which limits, and what happens when it fails or says nothing. */
interface ModelRun {
  readonly slot: ResolvedAiSlotConfig
  readonly model: BaseChatModel
  readonly limits: AiTurnLimits
  /** Whether the fallback slot answers when this model fails before its first word (#493). */
  readonly canFailOver: boolean
  /** The guard called the question a grey zone: only its tax side is answered. */
  readonly grayZone?: boolean
  /** How often a turn that came back completely empty is asked again (ADR-0084). */
  readonly emptyRetries?: number
  /** See `GraphOptions`: holds the tools back while the topic guard is still deciding. */
  readonly beforeTools?: (() => Promise<void>) | undefined
}

/** The model's result with the guard's verdict and the time the guard took. */
function withGuard(result: AdvisorTurnResult, topic: AdvisorTopicOutcome, guardMs: number | undefined): AdvisorTurnResult {
  return { ...result, topic, ...(result.timings && guardMs !== undefined ? { timings: { ...result.timings, guardMs } } : {}) }
}

@Injectable()
export class LangGraphAdvisorEngine implements AdvisorEnginePort {
  private readonly resolveChatModel: ChatModelFactory
  private readonly logger = new Logger('AdvisorEngine')

  constructor(
    @Inject(AI_RUNTIME_CONFIG_SERVICE) private readonly runtimeConfig: AiRuntimeConfigService,
    @Optional() @Inject(CHAT_MODEL_FACTORY) modelFactory?: ChatModelFactory,
    /** Without one no topic is checked: the owl's prompt rule and the attack patterns remain (ADR-0069). */
    @Optional() @Inject(ADVISOR_TOPIC_GUARD) private readonly topicGuard?: AdvisorTopicGuardPort,
  ) {
    this.resolveChatModel = modelFactory ?? createAdvisorChatModel
  }

  /** The owl's graph on the agent loop of `llm/agent/`: her tools, her state, her words to a silent model. */
  private buildCompiledGraph(model: BaseChatModel, request: AdvisorTurnRequest, { maxToolRounds, canForceTool, answerBy, markHistoryForCache, timings, beforeTools }: GraphOptions) {
    const makeActionId = request.actionIdFactory ?? newActionId
    const modelNode = createModelNode({
      model,
      tools: buildToolSchemas(),
      maxToolRounds,
      // The quick start „Was hab ich vergessen?“ must open with a plan (decision 17).
      forceFirstTool: request.planRequired && canForceTool ? 'plan_steps' : undefined,
      answerBy,
      ...(markHistoryForCache ? { forRound: withHistoryCacheBreakpoint } : {}),
      timings,
      answerNudge: ANSWER_NUDGE,
      silentAnswer: SILENT_ANSWER,
    })
    const toolsNode = createToolsNode({
      run: (state: typeof AdvisorGraphState.State, config) => runToolRound(state, config, request, makeActionId),
      beforeTools,
      timings,
    })
    return new StateGraph(AdvisorGraphState)
      .addNode('agent', modelNode)
      .addNode('tools', toolsNode)
      .addEdge(START, 'agent')
      .addConditionalEdges('agent', toolsOrEnd(maxToolRounds), ['tools', END])
      .addEdge('tools', 'agent')
      .compile()
  }

  private async *emitFallbackTurn(
    request: AdvisorTurnRequest,
    override?: { replyText: string; meta: AdvisorMessageMeta },
    /** Set when the rules answer because the model could not: the answer says so instead of passing as the model's. */
    failure?: AdvisorModelFailure,
  ): AsyncIterable<AdvisorStreamEvent> {
    const rules = override
      ? undefined
      : evaluateAdvisorTurn({
          message: request.message,
          activeScreen: request.activeScreen,
          digest: request.digest,
          actionIdFactory: request.actionIdFactory,
        })
    // The rules' drafts name the effect the real estimate computes, or none (K3).
    const evaluated = override ?? { ...rules!, meta: await withPreviewedEffects(rules!.meta, request.previewEffect) }
    const turn = failure ? { ...evaluated, meta: { ...evaluated.meta, modelFailure: failure } } : evaluated

    yield { event: 'token', data: { text: turn.replyText } }
    if (turn.meta.choices && turn.meta.choices.length > 0) {
      yield { event: 'choices', data: { choices: turn.meta.choices } }
    }
    if (turn.meta.action) {
      yield { event: 'action', data: turn.meta.action }
    }
    if (turn.meta.twoPaths) {
      yield { event: 'twoPaths', data: turn.meta.twoPaths }
    }
    yield { event: 'done', data: rulesResult(turn.replyText, turn.meta) }
  }

  /**
   * The model to ask when the first one fails: the fallback slot, if it is set up and is not the
   * same model with the same key (asking the same thing again helps nobody).
   */
  private async resolveFailover(primary: ResolvedAiSlotConfig, depth: AdvisorDepth | undefined): Promise<{ readonly config: ResolvedAiSlotConfig; readonly model: BaseChatModel } | null> {
    try {
      // A Max question stays Max: the fallback thinks at its own deepest level (ADR-0096).
      const config = withDepth(await this.runtimeConfig.resolveSlot('fallback'), depth)
      if (!config.enabled || config.provider === 'deterministic') return null
      if (config.provider === primary.provider && config.model === primary.model && config.apiKey === primary.apiKey) return null
      const model = this.resolveChatModel(config)
      return model ? { config, model } : null
    } catch {
      return null
    }
  }

  /** The conversation's own model, when the user picked one and its provider has a key; else the operator's. */
  private async chatSlotFor(request: AdvisorTurnRequest): Promise<ResolvedAiSlotConfig> {
    const choice = request.chatChoice
    const chosen = choice !== undefined && this.runtimeConfig.resolveChatChoice ? await this.runtimeConfig.resolveChatChoice(choice.provider, choice.model) : null
    return chosen ?? this.runtimeConfig.resolveSlot('advisor_chat')
  }

  async *streamTurn(request: AdvisorTurnRequest): AsyncIterable<AdvisorStreamEvent> {
    // Zero-trust PII gate before ANY LLM or fallback branch runs. With the consent to personal data
    // (ADR-0091) the user's own words may carry a Steuer-ID or an IBAN; the case digest never does.
    checkPiiFree(
      request.personalDataConsent === true
        ? { digest: request.digest }
        : {
            digest: request.digest,
            history: request.history ?? [],
            message: request.message,
          },
    )

    yield { event: 'status', data: { text: 'Eule prüft deine Akte & Paragraphen …' } }

    // Pre-LLM StBerG & prompt-injection boundary check
    const boundary = checkAdvisorInputBoundary(request.message, request.digest)
    if (boundary !== null) {
      yield* this.emitFallbackTurn(request, boundary)
      return
    }

    let slotConfig: ResolvedAiSlotConfig | null = null
    let chatModel: BaseChatModel | null = null
    let limits: AiTurnLimits = DEFAULT_AI_TURN_LIMITS

    try {
      limits = await this.runtimeConfig.resolveLimits()
      if (!(await this.runtimeConfig.isKillSwitchActive())) {
        slotConfig = withSpokenPace(withDepth(await this.chatSlotFor(request), request.depth), request.spoken === true && request.depth !== 'max')
        chatModel = this.resolveChatModel(slotConfig)
        // The day's model calls across all users are spent (ADR-0109): the rules answer, and say why.
        if (chatModel && slotConfig.enabled && slotConfig.provider !== 'deterministic' && slotConfig.provider !== 'fake' && !(await this.runtimeConfig.takeCallBudget?.(request.callTier ?? 'free') ?? true)) {
          yield* this.emitFallbackTurn(request, undefined, { reason: 'unavailable', detail: 'Tageskontingent der SteuerEule für heute aufgebraucht' })
          return
        }
      }
    } catch {
      chatModel = null
    }

    if (!chatModel || !slotConfig || !slotConfig.enabled || slotConfig.provider === 'deterministic') {
      yield* this.emitFallbackTurn(request)
      return
    }

    // No guard to wait for (a question the app itself sent, or none configured): the model answers straight away.
    if (request.topicCheck === 'skip' || !this.topicGuard) {
      const topic = await this.checkTopic(request)
      for await (const ev of this.runModelTurn(request, { slot: slotConfig, model: chatModel, limits, canFailOver: true })) {
        yield ev.event === 'done' ? { event: 'done', data: withGuard(ev.data as AdvisorTurnResult, topic, undefined) } : ev
      }
      return
    }

    // ADR-0100 (amends ADR-0069 §Themengrenze): the guard sorts the question while the model already works on it.
    // Measured, the guard took 1.3 to 3 s of every turn while the model waited. Nothing of the model's
    // turn reaches the user, and no tool runs, before the verdict; an off-topic or grey-zone verdict
    // drops the started turn (its first round is the price of a refusal).
    const guardStartedAt = Date.now()
    let guardMs: number | undefined
    const verdict: Promise<AdvisorTopicOutcome> = this.checkTopic(request)
      .catch((): AdvisorTopicOutcome => ({ verdict: 'unavailable', reason: 'error' }))
      .then((topic) => {
        guardMs = Date.now() - guardStartedAt
        return topic
      })
    const dropsTurn = (topic: AdvisorTopicOutcome) => topic.verdict === 'off_topic' || topic.verdict === 'gray'
    const speculation = new AbortController()
    const beforeTools = async () => {
      if (dropsTurn(await verdict)) {
        speculation.abort()
        throw new Error('turn dropped by the topic guard')
      }
    }
    const speculative: AdvisorTurnRequest = { ...request, signal: request.signal ? AbortSignal.any([request.signal, speculation.signal]) : speculation.signal }
    const turn = this.runModelTurn(speculative, { slot: slotConfig, model: chatModel, limits, canFailOver: true, beforeTools })[Symbol.asyncIterator]()
    const held: AdvisorStreamEvent[] = []
    let next: Promise<IteratorResult<AdvisorStreamEvent>> | null = turn.next()
    const decision = verdict.then(() => 'verdict' as const)
    // Hold what the model sends until the verdict is in; the loop ends with the verdict or with the turn.
    while (next !== null) {
      const first = await Promise.race([next, decision])
      if (first === 'verdict') break
      if (first.done) next = null
      else {
        held.push(first.value)
        next = turn.next()
      }
    }
    const topic = await verdict

    if (dropsTurn(topic)) {
      speculation.abort()
      // The dropped turn ends on its own once the abort reaches it; nobody waits for it.
      next?.catch(() => undefined)
      void turn.return?.(undefined).catch(() => undefined)
      if (topic.verdict === 'off_topic') {
        const refusal = topicRefusal(topic.language, request.digest)
        for await (const ev of this.emitFallbackTurn(request, refusal)) {
          yield ev.event === 'done' ? { event: 'done', data: { ...(ev.data as AdvisorTurnResult), topic } } : ev
        }
        return
      }
      // A grey zone is answered with its own instruction in the case, so the turn starts again with it.
      for await (const ev of this.runModelTurn(request, { slot: slotConfig, model: chatModel, limits, canFailOver: true, grayZone: true })) {
        yield ev.event === 'done' ? { event: 'done', data: withGuard(ev.data as AdvisorTurnResult, topic, guardMs) } : ev
      }
      return
    }

    const tagged = (ev: AdvisorStreamEvent): AdvisorStreamEvent => (ev.event === 'done' ? { event: 'done', data: withGuard(ev.data as AdvisorTurnResult, topic, guardMs) } : ev)
    for (const ev of held) yield tagged(ev)
    while (next !== null) {
      const step: IteratorResult<AdvisorStreamEvent> = await next
      if (step.done) break
      yield tagged(step.value)
      next = turn.next()
    }
  }

  private async checkTopic(request: AdvisorTurnRequest): Promise<AdvisorTopicOutcome> {
    if (request.topicCheck === 'skip') return { verdict: 'skipped' }
    if (!this.topicGuard) return { verdict: 'unavailable', reason: 'not_configured' }
    return this.topicGuard.check({ message: request.message, history: request.history ?? [] }, request.signal)
  }

  /**
   * One turn with one model. When that model fails before its first word, the fallback slot (a
   * model of another provider, or another model of the same one) answers instead, once (#493).
   */
  private async *runModelTurn(request: AdvisorTurnRequest, run: ModelRun): AsyncIterable<AdvisorStreamEvent> {
    const { slot: slotConfig, model: chatModel, limits, canFailOver, grayZone = false, emptyRetries = 1, beforeTools } = run
    // Anthropic rejects a forced tool call while extended thinking is on, and its current models reject
    // it always; the plan is then asked for in words.
    const canForceTool = slotConfig.provider !== 'anthropic' || (anthropicThinksOnBudget(slotConfig.model) && slotConfig.reasoning !== 'summary')
    const caseBlock = buildCaseBlock(request)
    const turnContext = describeTurnContext({ activeScreen: request.activeScreen, planFirst: request.planRequired === true && !canForceTool, grayZone, spoken: request.spoken === true })
    const historyMessages: BaseMessage[] = (request.history ?? []).map((entry) =>
      entry.role === 'user' ? new HumanMessage(entry.content) : new AIMessage(entry.content),
    )
    const initialMessages = buildTurnMessages(buildSystemMessage(slotConfig.provider, caseBlock, request.personalDataConsent === true), historyMessages, turnContext, request.message)

    const progress = newAgentRunProgress()
    const found = newTurnFindings()

    // A task works through the whole case: it needs more rounds and more time than one question.
    // The interview also does several things per answer (drafts, ticking areas off, the next
    // round): with the budget of one question it ran out of rounds before the next round (eval).
    const bigTurn = request.task !== undefined || request.skill === 'berater-interview'
    const budgetMs = bigTurn || request.depth === 'max' ? Math.max(limits.turnTimeoutMs, TASK_TIMEOUT_MS) : limits.turnTimeoutMs
    const maxToolRounds = bigTurn ? Math.max(limits.maxToolRounds, TASK_TOOL_ROUNDS) : limits.maxToolRounds
    const budget = openTurnBudget(budgetMs, request.signal)

    const timings = newAgentTimings()
    try {
      const graph = this.buildCompiledGraph(chatModel, request, { maxToolRounds, canForceTool, answerBy: budget.answerBy, markHistoryForCache: slotConfig.provider === 'anthropic', timings, beforeTools })
      const stream = await graph.stream(
        { messages: initialMessages },
        { streamMode: ['custom', 'updates'], signal: budget.signal },
      )

      // Words, thoughts and messages are counted by the loop; what the tools changed in the owl's state is kept in `found`.
      yield* followAgentRun<AdvisorStreamEvent, OwlStateUpdate>(stream, progress, (update) => noteUpdate(found, update))
    } catch (error) {
      const aborted = budget.abortReason()
      // A failed model call used to vanish into the fallback; operations need to see why (#476).
      if (aborted !== 'client') {
        this.logger.warn(
          `advisor turn failed (${slotConfig.provider}/${slotConfig.model}, ${aborted ?? 'error'}): ${error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)}`,
        )
      }
      // Nobody is listening any more; persisting a turn for a closed connection would only cost money.
      if (aborted === 'client') return
      const failure = classifyModelFailure(error, aborted === 'timeout' ? 'timeout' : 'error', slotConfig.provider)
      if (progress.streamedTokenCount === 0 && canFailOver && failure.reason !== 'blocked') {
        const next = await this.resolveFailover(slotConfig, request.depth)
        if (next) {
          yield { event: 'status', data: { text: `${providerName(slotConfig.provider)} antwortet nicht. Die Eule fragt ${providerName(next.config.provider)} …` } }
          for await (const ev of this.runModelTurn(request, { ...run, slot: next.config, model: next.model, canFailOver: false, emptyRetries: 1 })) {
            yield ev.event === 'done' ? { event: 'done', data: { ...(ev.data as AdvisorTurnResult), primaryFailure: failure } } : ev
          }
          return
        }
      }
      if (progress.streamedTokenCount === 0) {
        yield* this.emitFallbackTurn(request, undefined, failure)
        return
      }
      // Half an answer must not be stored as if it were complete: the client discards it.
      yield {
        event: 'error',
        data: {
          code: aborted === 'timeout' ? 'ADVISOR_TURN_TIMEOUT' : 'ADVISOR_TURN_FAILED',
          message: `Die Antwort ist unterwegs abgebrochen. ${describeModelFailure(failure.reason).text}`,
          failure,
        },
      }
      return
    }

    const { pendingActions, rejectedDrafts, noteChanges, interviewChanges, consentRequested, pendingTwoPaths, choices, questionRound, situationSuggestions, sources } = found
    let replyText = (progress.streamedText || lastModelText(progress.messages)).trim()

    // Found in the real case: a turn came back with nothing at all, not even after the nudge, and the stock
    // sentence below made it look answered. Ask once more; if it stays silent, say so (ADR-0084).
    const nothingAtAll =
      replyText.length === 0 &&
      progress.streamedTokenCount === 0 &&
      pendingActions.length === 0 &&
      pendingTwoPaths === null &&
      choices.length === 0 &&
      questionRound === null &&
      noteChanges.length === 0 &&
      interviewChanges.length === 0
    if (nothingAtAll) {
      this.logger.warn(`advisor turn came back empty (${slotConfig.provider}/${slotConfig.model}), ${emptyRetries > 0 ? 'asking again' : 'giving up'}`)
      if (emptyRetries > 0) {
        yield { event: 'status', data: { text: 'Die Eule fragt noch einmal nach …' } }
        yield* this.runModelTurn(request, { ...run, emptyRetries: emptyRetries - 1 })
        return
      }
      yield* this.emitFallbackTurn(request, undefined, { reason: 'unknown', detail: 'empty answer' })
      return
    }

    if (replyText.length === 0) {
      // One sentence for the drafts, in the core: the service writes it again when it leaves a draft out.
      replyText = pendingActions.length > 0
        ? preparedDraftsSentence(pendingActions.map((action) => action.label))
        : pendingTwoPaths
          ? `Ich habe zwei steuerliche Wege für „${pendingTwoPaths.title}“ vorbereitet.`
          : 'Ich habe deine Steuerakte geprüft.'
    }

    if (progress.streamedTokenCount === 0 && replyText.length > 0) {
      yield { event: 'token', data: { text: replyText } }
    }

    const usage = sumUsage(progress.messages)
    const notStaged = unresolvedRejections(rejectedDrafts, pendingActions)
    // The finished text is checked without a model; what it finds, the app says under the answer.
    const notices = checkAdvisorAnswer({
      replyText,
      userMessage: request.message,
      drafts: [...pendingActions, ...(pendingTwoPaths ? [pendingTwoPaths.safePath, pendingTwoPaths.maxPath] : [])],
      notStagedCount: notStaged.length,
      // The opening's figures are the app's own calculation, so naming them is backed.
      computedFigures: [...computedFiguresOf(progress.messages), ...(request.opening?.figures.map((figure) => figure.amountEur) ?? [])],
    })
    const meta: AdvisorMessageMeta = {
      ...(choices.length > 0 ? { choices } : {}),
      ...(questionRound ? { questionRound } : {}),
      ...(situationSuggestions.length > 0 ? { situationSuggestions } : {}),
      // One draft keeps its place as `action`; several travel as `actions` and are reviewed together.
      ...(pendingActions.length === 1 ? { action: pendingActions[0]! } : {}),
      ...(pendingActions.length > 1 ? { actions: pendingActions } : {}),
      ...(pendingTwoPaths ? { twoPaths: pendingTwoPaths } : {}),
      ...(sources.length > 0 ? { sources } : {}),
      ...(notStaged.length > 0 ? { notStaged } : {}),
      // The owl asked for the consent, or for a field the consent would open: the chat shows the consent card (ADR-0091).
      ...(request.personalDataConsent !== true && (consentRequested || rejectedDrafts.some((draft) => draft.consentRequired)) ? { personalDataConsentRequest: true as const } : {}),
      ...(notices.length > 0 ? { notices } : {}),
      ...(noteChanges.length > 0 ? { noteChanges } : {}),
      ...(interviewChanges.length > 0 ? { interviewChanges } : {}),
    }

    if (meta.choices && meta.choices.length > 0) {
      yield { event: 'choices', data: { choices: meta.choices } }
    }
    for (const action of pendingActions) {
      yield { event: 'action', data: action }
    }
    if (meta.twoPaths) {
      yield { event: 'twoPaths', data: meta.twoPaths }
    }

    const result: AdvisorTurnResult = {
      replyText,
      meta,
      mode: 'langgraph',
      provider: slotConfig.provider,
      model: slotConfig.model,
      ...(progress.reasoning.trim().length > 0 ? { reasoning: progress.reasoning.trim() } : {}),
      ...(usage ? { usage } : {}),
      timings,
    }
    yield { event: 'done', data: result }
  }

  /**
   * One plain model call without tools. The model is told to keep to what was said: a summary is
   * the only memory of the older conversation, so an invented detail would be read as a fact later.
   */
  async summarize(input: AdvisorSummaryRequest): Promise<string | null> {
    try {
      checkPiiFree({ transcript: input.transcript, previousSummary: input.previousSummary ?? '' })
      if (await this.runtimeConfig.isKillSwitchActive()) return null
      const slotConfig = await this.runtimeConfig.resolveSlot('advisor_chat')
      if (!slotConfig.enabled || slotConfig.provider === 'deterministic' || slotConfig.provider === 'fake') return null
      if (!((await this.runtimeConfig.takeCallBudget?.(input.callTier ?? 'free')) ?? true)) return null
      // A summary needs no line of thought: the plain, quick variant of the same model.
      const { reasoning: _reasoning, reasoningBudgetTokens: _budget, ...plain } = slotConfig
      const model = this.resolveChatModel({ ...plain, thinkingLevel: 'low' })
      if (!model) return null
      const { turnTimeoutMs } = await this.runtimeConfig.resolveLimits()
      const response = await model.invoke(
        [
          new SystemMessage(SUMMARY_INSTRUCTIONS),
          new HumanMessage(
            [...(input.previousSummary ? ['Bisherige Zusammenfassung:', input.previousSummary, ''] : []), 'Gesprächsverlauf:', input.transcript].join('\n'),
          ),
        ],
        { signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(turnTimeoutMs)]) : AbortSignal.timeout(turnTimeoutMs) },
      )
      const text = extractMessageText(response.content).trim()
      if (text === '') return null
      checkPiiFree({ summary: text })
      return text.slice(0, SUMMARY_MAX_CHARS)
    } catch (error) {
      this.logger.warn(`conversation summary failed: ${error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)}`)
      return null
    }
  }

  async runTurn(request: AdvisorTurnRequest): Promise<AdvisorTurnResult> {
    let finalResult: AdvisorTurnResult | null = null
    for await (const ev of this.streamTurn(request)) {
      if (ev.event === 'done') {
        finalResult = ev.data as AdvisorTurnResult
      }
    }
    if (!finalResult) {
      const fallback = evaluateAdvisorTurn({
        message: request.message,
        activeScreen: request.activeScreen,
        digest: request.digest,
        actionIdFactory: request.actionIdFactory,
      })
      return rulesResult(fallback.replyText, fallback.meta)
    }
    return finalResult
  }
}

/**
 * Max sets the deepest level the model offers (ADR-0096); Gründlich keeps the slot as configured,
 * which is the chat's standard. A provider without a level of its own is left as it is.
 */
/**
 * In a spoken conversation the wait before the first word is silence (ADR-0115): the model thinks at its
 * lowest level, where the provider offers levels. A question asked with Max keeps its depth.
 */
export function withSpokenPace(config: ResolvedAiSlotConfig, spoken: boolean): ResolvedAiSlotConfig {
  return spoken && config.enabled ? { ...config, thinkingLevel: 'low' } : config
}

export function withDepth(config: ResolvedAiSlotConfig, depth: AdvisorDepth | undefined): ResolvedAiSlotConfig {
  if (depth !== 'max' || !config.enabled) return config
  if (config.provider !== 'anthropic' && config.provider !== 'google-genai' && config.provider !== 'openai') return config
  const setting = depthSetting(config.provider, config.model, 'max')
  if (Object.keys(setting).length === 0) return config
  // Thinking at Max used up the usual 4096 tokens before a word was said: the answer came back empty.
  return { ...config, ...setting, maxTokens: Math.max(config.maxTokens ?? 0, MAX_DEPTH_OUTPUT_TOKENS) }
}
