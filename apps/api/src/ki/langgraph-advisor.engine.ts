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
  type AdvisorActionProposal,
  type AdvisorEnginePort,
  type AdvisorModelFailure,
  type AdvisorMessageMeta,
  type AdvisorNoteChange,
  type AdvisorQuestionRound,
  type AdvisorStreamEvent,
  type AdvisorSummaryRequest,
  type AdvisorTurnRequest,
  type AdvisorTurnResult,
  type AdvisorTurnUsage,
  type AdvisorTwoPathsProposal,
  type OwlSourceId,
} from '@steuereule/core'
import { AI_RUNTIME_CONFIG_SERVICE, DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService, type AiTurnLimits, type ResolvedAiSlotConfig } from './ai-runtime-config.service.js'
import { CHAT_MODEL_FACTORY, createChatModelFromConfig, type ChatModelFactory } from './chat-model.factory.js'
import { classifyModelFailure, providerName } from './advisor-failure.js'
import { checkPiiFree } from './ki.adapter.js'
import { buildSystemMessage, SUMMARY_MAX_CHARS, SUMMARY_INSTRUCTIONS } from './advisor-prompt.js'
import { buildToolSchemas, RejectedDraft, computedFiguresOf, unresolvedRejections } from './advisor-tools.js'
import { AdvisorGraphState, runToolRound } from './advisor-tool-round.js'
export { toProviderToolSchema, buildToolSchemas, computedFiguresOf, unresolvedRejections } from './advisor-tools.js'
export { buildStableSystemPrompt, buildSystemMessage } from './advisor-prompt.js'

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
  for (const message of messages) {
    const usage = (message as { usage_metadata?: UsageMetadata | undefined }).usage_metadata
    if (!usage) continue
    seen = true
    inputTokens += usage.input_tokens ?? 0
    outputTokens += usage.output_tokens ?? 0
    cachedInputTokens += usage.input_token_details?.cache_read ?? 0
  }
  return seen ? { inputTokens, outputTokens, cachedInputTokens } : undefined
}

/**
 * The savings plan and the assessment check look things up, plan, calculate and draft before they
 * answer. Seen against the real model: with the five rounds of a question the plan ended on a
 * draft and never reached its answer.
 */
export const TASK_TOOL_ROUNDS = 10
export const TASK_TIMEOUT_MS = 120_000

@Injectable()
export class LangGraphAdvisorEngine implements AdvisorEnginePort {
  private readonly resolveChatModel: ChatModelFactory
  private readonly logger = new Logger('AdvisorEngine')

  constructor(
    @Inject(AI_RUNTIME_CONFIG_SERVICE) private readonly runtimeConfig: AiRuntimeConfigService,
    @Optional() @Inject(CHAT_MODEL_FACTORY) modelFactory?: ChatModelFactory,
  ) {
    this.resolveChatModel = modelFactory ?? createChatModelFromConfig
  }

  private buildCompiledGraph(
    model: BaseChatModel,
    request: AdvisorTurnRequest,
    maxToolRounds: number,
    canForceTool: boolean,
  ) {
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
      const roundModel = state.toolRounds === 0 ? planFirstModel : state.toolRounds >= maxToolRounds ? answerOnlyModel : boundModel
      const streamOrValue = await roundModel.stream(state.messages, config)
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

      const finalMsg: BaseMessage =
        aggregated ??
        lastFallbackMsg ??
        new AIMessage('Ich habe deine Angaben geprüft, konnte aber keine Antwort erzeugen.')

      return { messages: [finalMsg] }
    }

    const toolsNode = (state: typeof AdvisorGraphState.State, config?: LangGraphRunnableConfig) => runToolRound(state, config, request, makeActionId)

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
    const evaluated =
      override ??
      evaluateAdvisorTurn({
        message: request.message,
        activeScreen: request.activeScreen,
        digest: request.digest,
        actionIdFactory: request.actionIdFactory,
      })
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
  private async resolveFailover(primary: ResolvedAiSlotConfig): Promise<{ readonly config: ResolvedAiSlotConfig; readonly model: BaseChatModel } | null> {
    try {
      const config = await this.runtimeConfig.resolveSlot('fallback')
      if (!config.enabled || config.provider === 'deterministic') return null
      if (config.provider === primary.provider && config.model === primary.model && config.apiKey === primary.apiKey) return null
      const model = this.resolveChatModel(config)
      return model ? { config, model } : null
    } catch {
      return null
    }
  }

  async *streamTurn(request: AdvisorTurnRequest): AsyncIterable<AdvisorStreamEvent> {
    // Zero-trust PII gate before ANY LLM or fallback branch runs
    checkPiiFree({
      digest: request.digest,
      history: request.history ?? [],
      message: request.message,
    })

    yield { event: 'status', data: { text: 'Eule prüft deine Akte & Paragraphen …' } }

    // Pre-LLM StBerG & prompt-injection boundary check
    const boundary = checkAdvisorInputBoundary(request.message)
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
        slotConfig = await this.runtimeConfig.resolveSlot('advisor_chat')
        chatModel = this.resolveChatModel(slotConfig)
      }
    } catch {
      chatModel = null
    }

    if (!chatModel || !slotConfig || !slotConfig.enabled || slotConfig.provider === 'deterministic') {
      yield* this.emitFallbackTurn(request)
      return
    }

    yield* this.runModelTurn(request, slotConfig, chatModel, limits, true)
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
  ): AsyncIterable<AdvisorStreamEvent> {
    // Anthropic rejects a forced tool call while extended thinking is on; the plan is then asked for in words.
    const canForceTool = !(slotConfig.provider === 'anthropic' && slotConfig.reasoning === 'summary')
    const systemMessage = buildSystemMessage(
      slotConfig.provider,
      request.digest,
      request.activeScreen,
      request.planRequired === true && !canForceTool,
      request.records,
      request.notes,
      request.skill,
      request.task,
      request.assessment,
      request.situation,
      request.opening,
    )
    const historyMessages: BaseMessage[] = (request.history ?? []).map((entry) =>
      entry.role === 'user' ? new HumanMessage(entry.content) : new AIMessage(entry.content),
    )
    const initialMessages: BaseMessage[] = [systemMessage, ...historyMessages, new HumanMessage(request.message)]

    let streamedTokenCount = 0
    let streamedText = ''
    let reasoning = ''
    let reasoningRound = 0
    let lastReasoningRound = 0
    let finalMessages: BaseMessage[] = []
    let pendingActions: AdvisorActionProposal[] = []
    let rejectedDrafts: RejectedDraft[] = []
    let noteChanges: AdvisorNoteChange[] = []
    let pendingTwoPaths: AdvisorTwoPathsProposal | null = null
    let choices: string[] = []
    let questionRound: AdvisorQuestionRound | null = null
    let situationSuggestions: string[] = []
    let sources: OwlSourceId[] = []

    // A task works through the whole case: it needs more rounds and more time than one question.
    const maxToolRounds = request.task ? Math.max(limits.maxToolRounds, TASK_TOOL_ROUNDS) : limits.maxToolRounds
    const timeout = AbortSignal.timeout(request.task ? Math.max(limits.turnTimeoutMs, TASK_TIMEOUT_MS) : limits.turnTimeoutMs)
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout
    const abortReason = (): 'client' | 'timeout' | null =>
      request.signal?.aborted ? 'client' : timeout.aborted ? 'timeout' : null

    try {
      const graph = this.buildCompiledGraph(chatModel, request, maxToolRounds, canForceTool)
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
        const next = await this.resolveFailover(slotConfig)
        if (next) {
          yield { event: 'status', data: { text: `${providerName(slotConfig.provider)} antwortet nicht. Die Eule fragt ${providerName(next.config.provider)} …` } }
          for await (const ev of this.runModelTurn(request, next.config, next.model, limits, false)) {
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

    if (replyText.length === 0) {
      replyText = pendingActions.length === 1
        ? `Ich habe den Entwurf „${pendingActions[0]!.label}“ als unverbindlichen Vorschlag vorbereitet.`
        : pendingActions.length > 1
          ? `Ich habe ${pendingActions.length} Entwürfe als unverbindliche Vorschläge vorbereitet.`
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
      ...(notices.length > 0 ? { notices } : {}),
      ...(noteChanges.length > 0 ? { noteChanges } : {}),
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
