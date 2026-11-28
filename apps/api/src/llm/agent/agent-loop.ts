// The loop of a model agent that works with tools: a model round streams its thoughts and words, a
// tool round runs what it asked for, and so on until it answers or its rounds and time are spent.
// Nothing here knows what the agent is about. The agent brings its prompt, its tools, the state its
// tools fill and the words it says to a silent model; `ki/langgraph-advisor.engine.ts` is the owl's.
import type { BaseChatModel, BindToolsInput } from '@langchain/core/language_models/chat_models'
import { AIMessage, AIMessageChunk, HumanMessage, type BaseMessage, type UsageMetadata } from '@langchain/core/messages'
import { concat } from '@langchain/core/utils/stream'
import { Annotation, END, type LangGraphRunnableConfig } from '@langchain/langgraph'
import type { AgentOwnEvent, AgentRunEvent, AgentTurnUsage } from '@steuereule/core'
import { extractMessageText } from '../llm-json.js'

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

/** The token counts of all model rounds of a turn; undefined when no provider reported any. */
export function sumUsage(messages: readonly BaseMessage[]): AgentTurnUsage | undefined {
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

/** The words of the last thing the model said in a turn; empty when it said nothing. */
export function lastModelText(messages: readonly BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const candidate = messages[i]
    if (candidate instanceof AIMessage || candidate instanceof AIMessageChunk) return extractMessageText(candidate.content)
  }
  return ''
}

/** A model turn that says nothing and asks for no tool. */
function isEmptyEnding(message: BaseMessage): boolean {
  const toolCalls = 'tool_calls' in message ? (message as AIMessage).tool_calls : undefined
  return (toolCalls?.length ?? 0) === 0 && extractMessageText(message.content).trim().length === 0
}

/**
 * The two channels the loop itself reads and writes. An agent spreads them into the state its tools
 * fill: `Annotation.Root({ ...AGENT_LOOP_CHANNELS, drafts: … })`.
 */
export const AGENT_LOOP_CHANNELS = {
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  /** How many tool rounds have run; the tools node counts it up. */
  toolRounds: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
}

export interface AgentLoopState {
  readonly messages: BaseMessage[]
  readonly toolRounds: number
}

/** Filled as the loop runs: the time of each model round and of the tools. */
export interface AgentTimings {
  roundMs: number[]
  toolMs: number
}

export const newAgentTimings = (): AgentTimings => ({ roundMs: [], toolMs: 0 })

export interface ModelNodeOptions {
  readonly model: BaseChatModel
  readonly tools: readonly BindToolsInput[]
  readonly maxToolRounds: number
  /** The tool the first round has to call, where the agent wants one and the provider takes a forced call. */
  readonly forceFirstTool?: string | undefined
  /** From this moment (epoch ms) on, the model answers without tools. */
  readonly answerBy?: number
  readonly now?: () => number
  /** The messages as one round sends them, e.g. with a provider's cache marker on the newest one. */
  readonly forRound?: (messages: readonly BaseMessage[]) => BaseMessage[]
  readonly timings: AgentTimings
  /** Said to the model when it ended a round with neither words nor a tool call. */
  readonly answerNudge: string
  /** The answer when the model sent nothing at all, not even an empty message. */
  readonly silentAnswer: string
}

/**
 * One model round as a graph node: streams reasoning and words to the run as `reasoning` and `token`
 * events and returns the model's message.
 */
export function createModelNode({ model, tools, maxToolRounds, forceFirstTool, answerBy = Number.POSITIVE_INFINITY, now = Date.now, forRound = (messages) => [...messages], timings, answerNudge, silentAnswer }: ModelNodeOptions) {
  const bind = typeof model.bindTools === 'function' ? model.bindTools.bind(model) : null
  const boundModel = bind ? bind([...tools]) : model
  // Only the first round is forced; later rounds are free to work on and answer.
  const firstRoundModel = bind && forceFirstTool !== undefined ? bind([...tools], { tool_choice: forceFirstTool }) : boundModel
  const answerOnlyModel = bind ? bind([...tools], { tool_choice: 'none' }) : model
  const send = (config: LangGraphRunnableConfig | undefined, event: AgentRunEvent): void => config?.writer?.(event)

  return async (state: AgentLoopState, config?: LangGraphRunnableConfig): Promise<{ messages: BaseMessage[] }> => {
    let aggregated: AIMessageChunk | null = null
    let lastFallbackMsg: AIMessage | null = null

    // After the last tool round the model has to answer in words: with tools still on offer it
    // may ask for yet another one, and the turn would end without any text.
    // The same when the time is nearly up: an answer from what is there beats an error.
    const mustAnswer = state.toolRounds >= maxToolRounds || (state.toolRounds > 0 && now() >= answerBy)
    const roundModel = state.toolRounds === 0 ? firstRoundModel : mustAnswer ? answerOnlyModel : boundModel
    const roundStartedAt = now()
    const streamOrValue = await roundModel.stream(forRound(state.messages), config)
    for await (const chunk of streamOrValue) {
      if (chunk instanceof AIMessageChunk) {
        const thought = extractReasoningText(chunk)
        if (thought.length > 0) send(config, { event: 'reasoning', data: { text: thought } })
        const text = extractMessageText(chunk.content)
        if (text.length > 0) send(config, { event: 'token', data: { text } })
        aggregated = aggregated ? concat(aggregated, chunk) : chunk
      } else {
        lastFallbackMsg = chunk as unknown as AIMessage
        const text = extractMessageText(lastFallbackMsg.content)
        if (text.length > 0) send(config, { event: 'token', data: { text } })
      }
    }

    let finalMsg: BaseMessage = aggregated ?? lastFallbackMsg ?? new AIMessage(silentAnswer)

    // Found by the eval: Gemini sometimes ends a round with neither text nor a tool call, and the
    // user got a stock sentence instead of an answer. Ask once more, without tools, for the answer in words.
    // Also in the first round: a model that says nothing at all is no better than one that went silent after tools.
    if (isEmptyEnding(finalMsg)) {
      const nudge = new HumanMessage(answerNudge)
      let retried = null as BaseMessage | null
      for await (const chunk of await answerOnlyModel.stream(forRound([...state.messages, nudge]), config)) {
        const text = extractMessageText((chunk as BaseMessage).content)
        if (text.length > 0) send(config, { event: 'token', data: { text } })
        // A streaming model sends chunks, one that cannot stream sends the whole message once.
        const piece = chunk as BaseMessage
        retried = piece instanceof AIMessageChunk && retried instanceof AIMessageChunk ? concat(retried, piece) : piece
      }
      if (retried && extractMessageText(retried.content).trim().length > 0) finalMsg = retried
    }

    timings.roundMs.push(now() - roundStartedAt)
    return { messages: [finalMsg] }
  }
}

export interface ToolsNodeOptions<State extends AgentLoopState, Update> {
  /** Runs the tool calls of the model's last message and returns what they changed in the state. */
  readonly run: (state: State, config: LangGraphRunnableConfig | undefined) => Promise<Update>
  /** Awaited before any tool runs: a turn started beside a guard touches nothing until the verdict is in. */
  readonly beforeTools?: (() => Promise<void>) | undefined
  readonly timings: AgentTimings
  readonly now?: () => number
}

/** One tool round as a graph node, with its time counted. */
export function createToolsNode<State extends AgentLoopState, Update>({ run, beforeTools, timings, now = Date.now }: ToolsNodeOptions<State, Update>) {
  return async (state: State, config?: LangGraphRunnableConfig): Promise<Update> => {
    await beforeTools?.()
    const toolsStartedAt = now()
    try {
      return await run(state, config)
    } finally {
      timings.toolMs += now() - toolsStartedAt
    }
  }
}

/** After a model round: on to the tools it asked for, or the end when it asked for none or the rounds are spent. */
export function toolsOrEnd(maxToolRounds: number) {
  return (state: AgentLoopState): 'tools' | typeof END => {
    if (state.toolRounds >= maxToolRounds) return END
    const last = state.messages[state.messages.length - 1]
    const toolCalls = last && 'tool_calls' in last && Array.isArray((last as AIMessage).tool_calls) ? (last as AIMessage).tool_calls : undefined
    return toolCalls && toolCalls.length > 0 ? 'tools' : END
  }
}

/** What a run has produced so far. The caller owns it, so it still knows after the stream threw. */
export interface AgentRunProgress {
  /** Every message the graph added, model and tools alike, in order. */
  messages: BaseMessage[]
  streamedText: string
  streamedTokenCount: number
  /** The reasoning summaries of all rounds, a paragraph per round. */
  reasoning: string
}

export const newAgentRunProgress = (): AgentRunProgress => ({ messages: [], streamedText: '', streamedTokenCount: 0, reasoning: '' })

const textOf = (data: unknown): string | null =>
  typeof data === 'object' && data !== null && 'text' in data && typeof data.text === 'string' ? data.text : null

/**
 * Follows a graph stream opened with `streamMode: ['custom', 'updates']`: passes on the events the
 * nodes wrote, keeps count in `progress`, and hands every node update to `onUpdate`, where the agent
 * reads the channels of its own state.
 */
export async function* followAgentRun<Event extends AgentOwnEvent, Update extends { readonly messages?: BaseMessage[] | undefined }>(
  stream: AsyncIterable<readonly [string, unknown]>,
  progress: AgentRunProgress,
  onUpdate: (update: Update) => void,
): AsyncGenerator<Event> {
  let round = 0
  let lastReasoningRound = 0
  for await (const [mode, payload] of stream) {
    if (mode === 'custom') {
      const event = payload as Event
      const text = textOf(event.data)
      if (event.event === 'token' && text !== null) {
        progress.streamedTokenCount += 1
        progress.streamedText += text
      }
      if (event.event === 'reasoning' && text !== null) {
        // Thoughts of a later model round start a new paragraph instead of running into the last one.
        const separator = progress.reasoning.length > 0 && round !== lastReasoningRound ? '\n\n' : ''
        lastReasoningRound = round
        progress.reasoning += separator + text
        yield separator.length > 0 ? ({ event: 'reasoning', data: { text: separator + text } } as Event) : event
        continue
      }
      yield event
      continue
    }

    if (mode === 'updates' && payload && typeof payload === 'object') {
      for (const update of Object.values(payload as Record<string, Update | undefined>)) {
        if (!update) continue
        if (Array.isArray(update.messages)) {
          progress.messages = progress.messages.concat(update.messages)
          round += 1
        }
        onUpdate(update)
      }
    }
  }
}

/**
 * Time kept back for the final answer. Once less than this is left of the turn's budget, the model
 * gets no more tools and has to answer with what it has; without it a turn that kept calling tools
 * ran into the timeout and the user got an error instead of an answer (found by the eval).
 */
export const ANSWER_RESERVE_MS = 20_000

export interface TurnBudget {
  /** Aborts with the client or when the budget is spent. */
  readonly signal: AbortSignal
  /** From this moment (epoch ms) on, the model answers without tools. */
  readonly answerBy: number
  /** Why the turn was aborted, if it was: the client left, or the time ran out. */
  abortReason(): 'client' | 'timeout' | null
}

/** Starts the clock of one turn: `budgetMs` from now, with the reserve for the answer inside it. */
export function openTurnBudget(budgetMs: number, clientSignal?: AbortSignal): TurnBudget {
  const timeout = AbortSignal.timeout(budgetMs)
  return {
    signal: clientSignal ? AbortSignal.any([clientSignal, timeout]) : timeout,
    answerBy: Date.now() + Math.max(budgetMs - ANSWER_RESERVE_MS, budgetMs / 2),
    abortReason: () => (clientSignal?.aborted ? 'client' : timeout.aborted ? 'timeout' : null),
  }
}
