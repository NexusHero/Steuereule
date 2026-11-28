// The agent loop of `llm/agent/` with an agent that has nothing to do with the owl: its own state, its own
// tool, its own event. What holds here holds for any agent built on the loop.
import { AIMessage, AIMessageChunk, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { Annotation, END, START, StateGraph, type LangGraphRunnableConfig } from '@langchain/langgraph'
import { describe, expect, it } from 'vitest'
import type { AgentStreamEvent } from '@steuereule/core'
import {
  AGENT_LOOP_CHANNELS,
  ANSWER_RESERVE_MS,
  createModelNode,
  createToolsNode,
  followAgentRun,
  lastModelText,
  newAgentRunProgress,
  newAgentTimings,
  openTurnBudget,
  sumUsage,
  toolsOrEnd,
} from '../src/llm/agent/agent-loop.js'
import { ScriptedModel } from './fakes/scripted-model.js'

/** A list keeper: its one tool puts an item on a list. */
const ListState = Annotation.Root({
  ...AGENT_LOOP_CHANNELS,
  items: Annotation<string[]>({ reducer: (left, right) => left.concat(right), default: () => [] }),
})
type ListUpdate = Partial<typeof ListState.State>
type ListEvent = AgentStreamEvent<{ readonly event: 'item'; readonly data: { readonly name: string } }>

const NUDGE = 'Answer in words now.'
const SILENT = 'Nothing to say.'

const addItem = (name: string, id = 'call-1'): AIMessageChunk =>
  new AIMessageChunk({ content: '', tool_call_chunks: [{ name: 'add_item', args: JSON.stringify({ name }), id, index: 0 }] })

async function runTools(state: typeof ListState.State, config: LangGraphRunnableConfig | undefined): Promise<ListUpdate> {
  const calls = (state.messages.at(-1) as AIMessage).tool_calls ?? []
  const names = calls.map((call) => String(call.args.name))
  for (const name of names) config?.writer?.({ event: 'item', data: { name } } satisfies ListEvent)
  return {
    messages: calls.map((call) => new ToolMessage({ content: 'added', tool_call_id: call.id ?? '' })),
    toolRounds: state.toolRounds + 1,
    items: names,
  }
}

interface RunOptions {
  readonly maxToolRounds?: number
  readonly answerBy?: number
  readonly beforeTools?: () => Promise<void>
}

async function run(model: ScriptedModel, { maxToolRounds = 3, answerBy, beforeTools }: RunOptions = {}) {
  const timings = newAgentTimings()
  const graph = new StateGraph(ListState)
    .addNode('agent', createModelNode({ model, tools: [], maxToolRounds, ...(answerBy !== undefined ? { answerBy } : {}), timings, answerNudge: NUDGE, silentAnswer: SILENT }))
    .addNode('tools', createToolsNode({ run: runTools, beforeTools, timings }))
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', toolsOrEnd(maxToolRounds), ['tools', END])
    .addEdge('tools', 'agent')
    .compile()
  const progress = newAgentRunProgress()
  const events: ListEvent[] = []
  const items: string[] = []
  const stream = await graph.stream({ messages: [new HumanMessage('Put milk on the list.')] }, { streamMode: ['custom', 'updates'] })
  for await (const event of followAgentRun<ListEvent, ListUpdate>(stream, progress, (update) => items.push(...(update.items ?? [])))) events.push(event)
  return { progress, events, items, timings }
}

describe('agent loop', () => {
  it('runs model, tools, model: the events of both reach the run, the state of the agent reaches its reader', async () => {
    const { progress, events, items, timings } = await run(new ScriptedModel([addItem('milk'), new AIMessageChunk({ content: 'Milk is on the list.' })]))

    expect(events).toEqual([
      { event: 'item', data: { name: 'milk' } },
      { event: 'token', data: { text: 'Milk is on the list.' } },
    ])
    expect(items).toEqual(['milk'])
    expect(progress.streamedText).toBe('Milk is on the list.')
    expect(progress.streamedTokenCount).toBe(1)
    expect(progress.messages.map((message: BaseMessage) => message.getType())).toEqual(['ai', 'tool', 'ai'])
    expect(lastModelText(progress.messages)).toBe('Milk is on the list.')
    expect(timings.roundMs).toHaveLength(2)
  })

  it('asks a model that ended a round without words or a tool call once more, with the agent’s own nudge', async () => {
    const model = new ScriptedModel([new AIMessageChunk({ content: '' }), new AIMessageChunk({ content: 'Here is the answer.' })])
    const { progress } = await run(model)

    expect(progress.streamedText).toBe('Here is the answer.')
    expect(model.seen).toHaveLength(2)
    expect(model.seen[1]).toContain(NUDGE)
    expect(model.seen[0]).not.toContain(NUDGE)
  })

  it('ends after the last tool round even when the model asks for another tool', async () => {
    const model = new ScriptedModel([addItem('milk', 'a'), addItem('bread', 'b'), addItem('eggs', 'c')])
    const { items, progress } = await run(model, { maxToolRounds: 2 })

    expect(items).toEqual(['milk', 'bread'])
    // The third request for a tool is not served: the turn ends with it.
    expect(progress.messages.map((message: BaseMessage) => message.getType())).toEqual(['ai', 'tool', 'ai', 'tool', 'ai'])
  })

  it('runs no tool when `beforeTools` refuses: the turn ends with its error', async () => {
    const refused = run(new ScriptedModel([addItem('milk')]), { beforeTools: () => Promise.reject(new Error('refused')) })
    await expect(refused).rejects.toThrow('refused')
  })

  it('puts the thoughts of a later round into a new paragraph', async () => {
    const thinking = (thought: string, rest: Partial<ConstructorParameters<typeof AIMessageChunk>[0] & object>): AIMessageChunk =>
      new AIMessageChunk({ content: '', additional_kwargs: { reasoning_content: thought }, ...rest })
    const { progress, events } = await run(
      new ScriptedModel([
        thinking('First I add it.', { tool_call_chunks: [{ name: 'add_item', args: JSON.stringify({ name: 'milk' }), id: 'call-1', index: 0 }] }),
        thinking('Now I say so.', { content: 'Done.' }),
      ]),
    )

    expect(progress.reasoning).toBe('First I add it.\n\nNow I say so.')
    expect(events.filter((event) => event.event === 'reasoning')).toEqual([
      { event: 'reasoning', data: { text: 'First I add it.' } },
      { event: 'reasoning', data: { text: '\n\nNow I say so.' } },
    ])
  })

  it('sums the token counts of all rounds and reports none where no provider counted', () => {
    // The counts sit on the message the way a provider's SDK attaches them; the constructor's type does not name the field.
    const counted = (input: number, output: number, cached: number): AIMessage =>
      Object.assign(new AIMessage('x'), { usage_metadata: { input_tokens: input, output_tokens: output, total_tokens: input + output, input_token_details: { cache_read: cached } } })

    expect(sumUsage([counted(100, 10, 80), new HumanMessage('q'), counted(50, 5, 0)])).toEqual({ inputTokens: 150, outputTokens: 15, cachedInputTokens: 80, cacheWriteInputTokens: 0 })
    expect(sumUsage([new AIMessage('x')])).toBeUndefined()
  })
})

describe('openTurnBudget', () => {
  it('keeps the reserve for the answer inside the budget, and half of a budget shorter than twice the reserve', () => {
    const before = Date.now()
    const long = openTurnBudget(60_000)
    const short = openTurnBudget(30_000)

    expect(long.answerBy - before).toBeGreaterThanOrEqual(60_000 - ANSWER_RESERVE_MS)
    expect(long.answerBy - before).toBeLessThan(60_000 - ANSWER_RESERVE_MS + 1_000)
    expect(short.answerBy - before).toBeGreaterThanOrEqual(15_000)
    expect(short.answerBy - before).toBeLessThan(16_000)
    expect(long.abortReason()).toBeNull()
  })

  it('tells a client that left from a budget that ran out', async () => {
    const client = new AbortController()
    const left = openTurnBudget(60_000, client.signal)
    client.abort()
    expect(left.signal.aborted).toBe(true)
    expect(left.abortReason()).toBe('client')

    const spent = openTurnBudget(1)
    await new Promise<void>((resolve) => spent.signal.addEventListener('abort', () => resolve(), { once: true }))
    expect(spent.abortReason()).toBe('timeout')
  })
})
