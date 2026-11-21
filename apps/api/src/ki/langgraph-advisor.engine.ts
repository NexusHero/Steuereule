import { newActionId } from '../common/action-id.js'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage, type BaseMessage, type UsageMetadata } from '@langchain/core/messages'
import { concat } from '@langchain/core/utils/stream'
import { END, START, StateGraph, type LangGraphRunnableConfig } from '@langchain/langgraph'
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
  type AdvisorTurnUsage,
  type AdvisorTwoPathsProposal,
  type OwlSourceId,
} from '@steuereule/core'
import { depthSetting, type AdvisorDepth } from '@steuereule/core'
import { AI_RUNTIME_CONFIG_SERVICE, DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService, type AiTurnLimits, type ResolvedAiSlotConfig } from './ai-runtime-config.service.js'
import { anthropicThinksOnBudget, CHAT_MODEL_FACTORY, createChatModelFromConfig, type ChatModelFactory } from './chat-model.factory.js'
import { classifyModelFailure, providerName } from './advisor-failure.js'
import { checkPiiFree } from './ki.adapter.js'
import { buildCaseBlock, buildSystemMessage, buildTurnMessages, describeTurnContext, SUMMARY_MAX_CHARS, SUMMARY_INSTRUCTIONS, withHistoryCacheBreakpoint } from './advisor-prompt.js'
import { buildToolSchemas, RejectedDraft, computedFiguresOf, unresolvedRejections } from './advisor-tools.js'
import { AdvisorGraphState, runToolRound } from './advisor-tool-round.js'
import { ADVISOR_TOPIC_GUARD, type AdvisorTopicGuardPort } from './advisor-topic-guard.js'
export { toProviderToolSchema, buildToolSchemas, computedFiguresOf, unresolvedRejections } from './advisor-tools.js'
export { buildCaseBlock, buildStableSystemPrompt, buildSystemMessage, buildTurnMessages, describeTurnContext, TURN_CONTEXT_HEADER, USER_MESSAGE_HEADER, userTextOf, withHistoryCacheBreakpoint } from './advisor-prompt.js'

export const ADVISOR_ENGINE = Symbol('ADVISOR_ENGINE')

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text
      }
      return ''
    })
    .join('')
}

/**
 * The reasoning summary a provider attached to a chunk, in any of the shapes they use: Anthropic and
 * Gemini `thinking` parts, LangChain's standard `reasoning` blocks, OpenAI's summary list. Encrypted
 * or redacted reasoning has no text and yields nothing.
 */
export function extractReasoningText(message: { content: unknown; additional_kwargs?: Record<string, unknown> | undefined }): string {
  const fromSummary = (summary: unknown): string =>
    Array.isArray(summary)
      ? summary.map((item) => (item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string' ? (item as { text: string }).text : '')).join('')
      : ''

  let text = ''
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (!part || typeof part !== 'object') continue
      const block = part as { type?: unknown; thinking?: unknown; reasoning?: unknown; summary?: unknown }
      if (block.type === 'thinking' && typeof block.thinking === 'string') text += block.thinking
      else if (block.type === 'reasoning' && typeof block.reasoning === 'string') text += block.reasoning
      else if (block.type === 'reasoning') text += fromSummary(block.summary)
    }
  }
  const kwargs = message.additional_kwargs
  if (kwargs) {
    const reasoning = kwargs.reasoning
    if (reasoning && typeof reasoning === 'object') text += fromSummary((reasoning as { summary?: unknown }).summary)
    if (typeof kwargs.reasoning_content === 'string') text += kwargs.reasoning_content
  }
  return text
}

function sumUsage(messages: readonly BaseMessage[]): AdvisorTurnUsage | undefined {
  let seen = false
  let inputTokens = 0
  let outputTokens = 0
  let cachedInputTokens = 0
  let cacheWriteInputTokens = 0
  for (const message of messages) {
    const usage = (message as { usage_metadata?: UsageMetadata | undefined }).usage_metadata
    if (!usage) continue
    seen = true
    inputTokens += usage.input_tokens ?? 0
    outputTokens += usage.output_tokens ?? 0
    cachedInputTokens += usage.input_token_details?.cache_read ?? 0
    cacheWriteInputTokens += usage.input_token_details?.cache_creation ?? 0
  }
  return seen ? { inputTokens, outputTokens, cachedInputTokens, cacheWriteInputTokens } : undefined
}

/**
 * The savings plan and the assessment check look things up, plan, calculate and draft before they
 * answer. Seen against the real model: with the five rounds of a question the plan ended on a
 * draft and never reached its answer.
 */
export const TASK_TOOL_ROUNDS = 10
export const TASK_TIMEOUT_MS = 120_000
/**
 * Time kept back for the final answer. Once less than this is left of the turn's budget, the model
 * gets no more tools and has to answer with what it has; without it a turn that kept calling tools
 * ran into the timeout and the user got an error instead of an answer (found by the eval).
 */
export const ANSWER_RESERVE_MS = 20_000
/**
 * Max (ADR-0096): room for the answer after deep thinking, kept below what the Anthropic SDK still
 * allows without streaming (about 21k tokens), and the time of a task, since thinking at Max took
 * longer than the 60 s of one question and the turn fell back.
 */
export const MAX_DEPTH_OUTPUT_TOKENS = 20_000

/** Said to the model when it ended a round after tools without a word. */
export const ANSWER_NUDGE = 'Antworte jetzt dem Nutzer in Worten auf seine Frage, mit dem, was die Werkzeuge ergeben haben (Regel mit Norm, Betrag oder Satz, nächster Schritt). Keine weiteren Werkzeuge.'

/** A model turn that says nothing and asks for no tool. */
function isEmptyEnding(message: BaseMessage): boolean {
  const toolCalls = 'tool_calls' in message ? (message as AIMessage).tool_calls : undefined
  return (toolCalls?.length ?? 0) === 0 && extractMessageText(message.content).trim().length === 0
}

interface MutableTimings {
  roundMs: number[]
  toolMs: number
}

const newTimings = (): MutableTimings => ({ roundMs: [], toolMs: 0 })

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
    this.resolveChatModel = modelFactory ?? createChatModelFromConfig
  }

  private buildCompiledGraph(
    model: BaseChatModel,
    request: AdvisorTurnRequest,
    maxToolRounds: number,
    canForceTool: boolean,
    /** From this moment (epoch ms) on, the model answers without tools. */
    answerBy: number = Number.POSITIVE_INFINITY,
    now: () => number = Date.now,
    /** Anthropic caches only marked prefixes: each round marks its newest message (see `withHistoryCacheBreakpoint`). */
    markHistoryForCache = false,
    /** Filled as the graph runs: the time of each model round and of the tools. */
    timings: MutableTimings = newTimings(),
    /** Awaited before any tool runs: a turn started beside the topic guard touches nothing until the verdict is in. */
    beforeTools?: () => Promise<void>,
  ) {
    const forRound = (messages: readonly BaseMessage[]) => (markHistoryForCache ? withHistoryCacheBreakpoint(messages) : [...messages])
    const tools = buildToolSchemas()
    const bind = typeof model.bindTools === 'function' ? model.bindTools.bind(model) : null
    const boundModel = bind ? bind([...tools]) : model
    // The quick start „Was hab ich vergessen?“ must open with a plan (decision 17): only the first
    // round is forced, later rounds are free to work through the steps and answer.
    const planFirstModel = bind && request.planRequired && canForceTool ? bind([...tools], { tool_choice: 'plan_steps' }) : boundModel
    const answerOnlyModel = bind ? bind([...tools], { tool_choice: 'none' }) : model
    const makeActionId = request.actionIdFactory ?? (newActionId)

    const agentNode = async (
      state: typeof AdvisorGraphState.State,
      config?: LangGraphRunnableConfig,
    ) => {
      let aggregated: AIMessageChunk | null = null
      let lastFallbackMsg: AIMessage | null = null

      // After the last tool round the model has to answer in words: with tools still on offer it
      // may ask for yet another one, and the turn would end without any text.
      // The same when the time is nearly up: an answer from what is there beats an error.
      const mustAnswer = state.toolRounds >= maxToolRounds || (state.toolRounds > 0 && now() >= answerBy)
      const roundModel = state.toolRounds === 0 ? planFirstModel : mustAnswer ? answerOnlyModel : boundModel
      const roundStartedAt = now()
      const streamOrValue = await roundModel.stream(forRound(state.messages), config)
      for await (const chunk of streamOrValue) {
        if (chunk instanceof AIMessageChunk) {
          const thought = extractReasoningText(chunk)
          if (thought.length > 0) {
            config?.writer?.({ event: 'reasoning', data: { text: thought } } satisfies AdvisorStreamEvent)
          }
          const text = extractMessageText(chunk.content)
          if (text.length > 0) {
            config?.writer?.({ event: 'token', data: { text } } satisfies AdvisorStreamEvent)
          }
          aggregated = aggregated ? concat(aggregated, chunk) : chunk
        } else {
          lastFallbackMsg = chunk as unknown as AIMessage
          const text = extractMessageText(lastFallbackMsg.content)
          if (text.length > 0) {
            config?.writer?.({ event: 'token', data: { text } } satisfies AdvisorStreamEvent)
          }
        }
      }

      let finalMsg: BaseMessage =
        aggregated ??
        lastFallbackMsg ??
        new AIMessage('Ich habe deine Angaben geprüft, konnte aber keine Antwort erzeugen.')

      // Found by the eval: Gemini sometimes ends a round with neither text nor a tool
      // call, and the user got a stock sentence ("Ich habe deine Steuerakte geprüft.") instead of
      // an answer. Ask once more, without tools, for the answer in words.
      // Also in the first round: a model that says nothing at all is no better than one that went silent after tools.
      if (isEmptyEnding(finalMsg)) {
        const nudge = new HumanMessage(ANSWER_NUDGE)
        let retried = null as BaseMessage | null
        for await (const chunk of await answerOnlyModel.stream(forRound([...state.messages, nudge]), config)) {
          const text = extractMessageText((chunk as BaseMessage).content)
          if (text.length > 0) config?.writer?.({ event: 'token', data: { text } } satisfies AdvisorStreamEvent)
          // A streaming model sends chunks, one that cannot stream sends the whole message once.
          const piece = chunk as BaseMessage
          retried = piece instanceof AIMessageChunk && retried instanceof AIMessageChunk ? concat(retried, piece) : piece
        }
        if (retried && extractMessageText(retried.content).trim().length > 0) finalMsg = retried
      }

      timings.roundMs.push(now() - roundStartedAt)
      return { messages: [finalMsg] }
    }

    const toolsNode = async (state: typeof AdvisorGraphState.State, config?: LangGraphRunnableConfig) => {
      await beforeTools?.()
      const toolsStartedAt = now()
      try {
        return await runToolRound(state, config, request, makeActionId)
      } finally {
        timings.toolMs += now() - toolsStartedAt
      }
    }

    const shouldContinue = (state: typeof AdvisorGraphState.State) => {
      if (state.toolRounds >= maxToolRounds) return END
      const last = state.messages[state.messages.length - 1]
      const toolCalls =
        last && 'tool_calls' in last && Array.isArray((last as AIMessage).tool_calls)
          ? (last as AIMessage).tool_calls
          : undefined
      if (toolCalls && toolCalls.length > 0) return 'tools'
      return END
    }

    return new StateGraph(AdvisorGraphState)
      .addNode('agent', agentNode)
      .addNode('tools', toolsNode)
      .addEdge(START, 'agent')
      .addConditionalEdges('agent', shouldContinue, ['tools', END])
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
    const result: AdvisorTurnResult = {
      replyText: turn.replyText,
      meta: turn.meta,
      mode: 'deterministic_fallback',
      provider: 'deterministic',
      model: 'deterministic-fallback',
    }
    yield { event: 'done', data: result }
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
        slotConfig = withDepth(await this.chatSlotFor(request), request.depth)
        chatModel = this.resolveChatModel(slotConfig)
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
      for await (const ev of this.runModelTurn(request, slotConfig, chatModel, limits, true)) {
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
    const turn = this.runModelTurn(speculative, slotConfig, chatModel, limits, true, false, 1, beforeTools)[Symbol.asyncIterator]()
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
      for await (const ev of this.runModelTurn(request, slotConfig, chatModel, limits, true, true)) {
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
  private async *runModelTurn(
    request: AdvisorTurnRequest,
    slotConfig: ResolvedAiSlotConfig,
    chatModel: BaseChatModel,
    limits: AiTurnLimits,
    canFailOver: boolean,
    /** The guard called the question a grey zone: only its tax side is answered. */
    grayZone = false,
    /** How often a turn that came back completely empty is asked again (ADR-0084). */
    emptyRetries = 1,
    /** See `buildCompiledGraph`: holds the tools back while the topic guard is still deciding. */
    beforeTools?: () => Promise<void>,
  ): AsyncIterable<AdvisorStreamEvent> {
    // Anthropic rejects a forced tool call while extended thinking is on, and its current models reject
    // it always; the plan is then asked for in words.
    const canForceTool = slotConfig.provider !== 'anthropic' || (anthropicThinksOnBudget(slotConfig.model) && slotConfig.reasoning !== 'summary')
    const caseBlock = buildCaseBlock(request.digest, request.records, request.notes, request.skill, request.task, request.assessment, request.situation, request.opening, request.interview, undefined, request.household, request.openPlan)
    const turnContext = describeTurnContext(request.activeScreen, request.planRequired === true && !canForceTool, grayZone)
    const historyMessages: BaseMessage[] = (request.history ?? []).map((entry) =>
      entry.role === 'user' ? new HumanMessage(entry.content) : new AIMessage(entry.content),
    )
    const initialMessages = buildTurnMessages(buildSystemMessage(slotConfig.provider, caseBlock, request.personalDataConsent === true), historyMessages, turnContext, request.message)

    let streamedTokenCount = 0
    let streamedText = ''
    let reasoning = ''
    let reasoningRound = 0
    let lastReasoningRound = 0
    let finalMessages: BaseMessage[] = []
    let pendingActions: AdvisorActionProposal[] = []
    let rejectedDrafts: RejectedDraft[] = []
    let noteChanges: AdvisorNoteChange[] = []
    let interviewChanges: InterviewAreaChange[] = []
    let consentRequested = false
    let pendingTwoPaths: AdvisorTwoPathsProposal | null = null
    let choices: string[] = []
    let questionRound: AdvisorQuestionRound | null = null
    let situationSuggestions: string[] = []
    let sources: OwlSourceId[] = []

    // A task works through the whole case: it needs more rounds and more time than one question.
    // The interview also does several things per answer (drafts, ticking areas off, the next
    // round): with the budget of one question it ran out of rounds before the next round (eval).
    const bigTurn = request.task !== undefined || request.skill === 'berater-interview'
    const budgetMs = bigTurn || request.depth === 'max' ? Math.max(limits.turnTimeoutMs, TASK_TIMEOUT_MS) : limits.turnTimeoutMs
    const maxToolRounds = bigTurn ? Math.max(limits.maxToolRounds, TASK_TOOL_ROUNDS) : limits.maxToolRounds
    const timeout = AbortSignal.timeout(budgetMs)
    const answerBy = Date.now() + Math.max(budgetMs - ANSWER_RESERVE_MS, budgetMs / 2)
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout
    const abortReason = (): 'client' | 'timeout' | null =>
      request.signal?.aborted ? 'client' : timeout.aborted ? 'timeout' : null

    const timings = newTimings()
    try {
      const graph = this.buildCompiledGraph(chatModel, request, maxToolRounds, canForceTool, answerBy, Date.now, slotConfig.provider === 'anthropic', timings, beforeTools)
      const stream = await graph.stream(
        { messages: initialMessages },
        { streamMode: ['custom', 'updates'], signal },
      )

      for await (const [mode, payload] of stream) {
        if (mode === 'custom') {
          const ev = payload as AdvisorStreamEvent
          if (ev.event === 'token') {
            streamedTokenCount++
            streamedText += ev.data.text
          }
          if (ev.event === 'reasoning') {
            // Thoughts of a later model round start a new paragraph instead of running into the last one.
            const separator = reasoning.length > 0 && reasoningRound !== lastReasoningRound ? '\n\n' : ''
            lastReasoningRound = reasoningRound
            reasoning += separator + ev.data.text
            yield separator.length > 0 ? { event: 'reasoning', data: { text: separator + ev.data.text } } : ev
            continue
          }
          yield ev
          continue
        }

        if (mode === 'updates' && payload && typeof payload === 'object') {
          const updates = payload as Record<string, Partial<typeof AdvisorGraphState.State>>
          for (const nodeUpdate of Object.values(updates)) {
            if (!nodeUpdate) continue
            if (Array.isArray(nodeUpdate.messages)) {
              finalMessages = finalMessages.concat(nodeUpdate.messages)
              reasoningRound += 1
            }
            if (Array.isArray(nodeUpdate.pendingActions)) {
              pendingActions = nodeUpdate.pendingActions
            }
            if (Array.isArray(nodeUpdate.rejectedDrafts)) {
              rejectedDrafts = nodeUpdate.rejectedDrafts
            }
            if ('pendingTwoPaths' in nodeUpdate && nodeUpdate.pendingTwoPaths !== undefined) {
              pendingTwoPaths = nodeUpdate.pendingTwoPaths
            }
            if (Array.isArray(nodeUpdate.choices)) {
              choices = nodeUpdate.choices
            }
            if (Array.isArray(nodeUpdate.situationSuggestions)) {
              situationSuggestions = nodeUpdate.situationSuggestions
            }
            if (nodeUpdate.questionRound) {
              questionRound = nodeUpdate.questionRound
            }
            if (Array.isArray(nodeUpdate.noteChanges)) {
              noteChanges = nodeUpdate.noteChanges
            }
            if (nodeUpdate.consentRequested === true) consentRequested = true
            if (Array.isArray(nodeUpdate.interviewChanges)) {
              interviewChanges = nodeUpdate.interviewChanges
            }
            if (Array.isArray(nodeUpdate.sources)) {
              sources = [...new Set([...sources, ...nodeUpdate.sources])]
            }
          }
        }
      }
    } catch (error) {
      const aborted = abortReason()
      // A failed model call used to vanish into the fallback; operations need to see why (#476).
      if (aborted !== 'client') {
        this.logger.warn(
          `advisor turn failed (${slotConfig.provider}/${slotConfig.model}, ${aborted ?? 'error'}): ${error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)}`,
        )
      }
      // Nobody is listening any more; persisting a turn for a closed connection would only cost money.
      if (aborted === 'client') return
      const failure = classifyModelFailure(error, aborted === 'timeout' ? 'timeout' : 'error', slotConfig.provider)
      if (streamedTokenCount === 0 && canFailOver && failure.reason !== 'blocked') {
        const next = await this.resolveFailover(slotConfig, request.depth)
        if (next) {
          yield { event: 'status', data: { text: `${providerName(slotConfig.provider)} antwortet nicht. Die Eule fragt ${providerName(next.config.provider)} …` } }
          for await (const ev of this.runModelTurn(request, next.config, next.model, limits, false, grayZone, 1, beforeTools)) {
            yield ev.event === 'done' ? { event: 'done', data: { ...(ev.data as AdvisorTurnResult), primaryFailure: failure } } : ev
          }
          return
        }
      }
      if (streamedTokenCount === 0) {
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

    let lastAiMessage: BaseMessage | undefined
    for (let i = finalMessages.length - 1; i >= 0; i -= 1) {
      const candidate = finalMessages[i]
      if (candidate instanceof AIMessage || candidate instanceof AIMessageChunk) {
        lastAiMessage = candidate
        break
      }
    }
    const lastAiText = lastAiMessage ? extractMessageText(lastAiMessage.content) : ''
    let replyText = (streamedText || lastAiText).trim()

    // Found in the real case: a turn came back with nothing at all, not even after the nudge, and the stock
    // sentence below made it look answered. Ask once more; if it stays silent, say so (ADR-0084).
    const nothingAtAll =
      replyText.length === 0 &&
      streamedTokenCount === 0 &&
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
        yield* this.runModelTurn(request, slotConfig, chatModel, limits, canFailOver, grayZone, emptyRetries - 1, beforeTools)
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

    if (streamedTokenCount === 0 && replyText.length > 0) {
      yield { event: 'token', data: { text: replyText } }
    }

    const usage = sumUsage(finalMessages)
    const notStaged = unresolvedRejections(rejectedDrafts, pendingActions)
    // The finished text is checked without a model; what it finds, the app says under the answer.
    const notices = checkAdvisorAnswer({
      replyText,
      userMessage: request.message,
      drafts: [...pendingActions, ...(pendingTwoPaths ? [pendingTwoPaths.safePath, pendingTwoPaths.maxPath] : [])],
      notStagedCount: notStaged.length,
      // The opening's figures are the app's own calculation, so naming them is backed.
      computedFigures: [...computedFiguresOf(finalMessages), ...(request.opening?.figures.map((figure) => figure.amountEur) ?? [])],
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
      ...(reasoning.trim().length > 0 ? { reasoning: reasoning.trim() } : {}),
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
      return {
        replyText: fallback.replyText,
        meta: fallback.meta,
        mode: 'deterministic_fallback',
        provider: 'deterministic',
        model: 'deterministic-fallback',
      }
    }
    return finalResult
  }
}

/**
 * Max sets the deepest level the model offers (ADR-0096); Gründlich keeps the slot as configured,
 * which is the chat's standard. A provider without a level of its own is left as it is.
 */
export function withDepth(config: ResolvedAiSlotConfig, depth: AdvisorDepth | undefined): ResolvedAiSlotConfig {
  if (depth !== 'max' || !config.enabled) return config
  if (config.provider !== 'anthropic' && config.provider !== 'google-genai' && config.provider !== 'openai') return config
  const setting = depthSetting(config.provider, config.model, 'max')
  if (Object.keys(setting).length === 0) return config
  // Thinking at Max used up the usual 4096 tokens before a word was said: the answer came back empty.
  return { ...config, ...setting, maxTokens: Math.max(config.maxTokens ?? 0, MAX_DEPTH_OUTPUT_TOKENS) }
}
