// The contract of a model agent that answers in a run: what one turn is asked, which events its
// answer sends while it is written, and what it cost. Nothing here knows what the agent is about;
// the owl names its own request, events and result on top of it (interview/ki-port.ts).

export interface AgentHistoryEntry {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

/** What every turn carries, whatever the agent does with it. */
export interface AgentTurnInput {
  readonly message: string
  readonly history?: readonly AgentHistoryEntry[] | undefined
  /** Aborted when the client disconnects or the turn budget runs out; stops the paid model call. */
  readonly signal?: AbortSignal | undefined
}

/** Token counts of one turn, summed over all model rounds. */
export interface AgentTurnUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  /** Input tokens the provider served from its prompt cache. */
  readonly cachedInputTokens: number
  /**
   * Input tokens written to the prompt cache (Anthropic bills them above the normal input price).
   * Writes that are never read again cost more than no caching at all; this is what shows them.
   */
  readonly cacheWriteInputTokens: number
}

/**
 * Where the time of one turn went, in milliseconds. Kept beside the token counts so a slow turn can
 * be read (model, tools, guard or the app's own preparation) instead of guessed.
 */
export interface AgentTurnTimings {
  /** A guard that ran before or beside the model, from its call to its verdict; absent where none ran. */
  readonly guardMs?: number | undefined
  /** Each model round, from the request to its last chunk. */
  readonly roundMs: readonly number[]
  /** All tool rounds together. */
  readonly toolMs: number
  /** The app's own work before the engine was called; set by whoever prepares the turn. */
  readonly prepMs?: number | undefined
}

/** An event of an agent's own making, sent in the same stream as the run's events. */
export interface AgentOwnEvent {
  readonly event: string
  readonly data: unknown
}

/**
 * The events every run sends. `Message` is the stored message a client renders, `Failure` what the
 * agent tells about a model that failed.
 */
export type AgentRunEvent<Message = unknown, Failure = unknown> =
  /** First event of a run: the ids a client needs to render, stop and re-attach (#476). */
  | {
      readonly event: 'start'
      readonly data: { readonly runId: string; readonly userMessage: Message; readonly assistantMessageId: string }
    }
  | { readonly event: 'status'; readonly data: { readonly text: string } }
  /** A piece of the provider's reasoning summary; never the answer itself. */
  | { readonly event: 'reasoning'; readonly data: { readonly text: string } }
  | { readonly event: 'tool'; readonly data: { readonly name: string; readonly label: string } }
  /** What a tool found, after it ran: a few words without personal data, shown under its step. */
  | { readonly event: 'tool_result'; readonly data: { readonly name: string; readonly ok: boolean; readonly result: string } }
  | { readonly event: 'token'; readonly data: { readonly text: string } }
  | { readonly event: 'error'; readonly data: { readonly code: string; readonly message: string; readonly failure?: Failure } }
  | { readonly event: 'done'; readonly data: unknown }

/** The stream of one agent: the run's events and the agent's own (`Own`), told apart by `event`. */
export type AgentStreamEvent<Own extends AgentOwnEvent = never, Message = unknown, Failure = unknown> = AgentRunEvent<Message, Failure> | Own

/** An agent behind a port: one turn as a result, or as the stream of its events ending in `done`. */
export interface AgentEnginePort<Request extends AgentTurnInput, Result, Event extends AgentOwnEvent> {
  runTurn(input: Request): Promise<Result>
  streamTurn(input: Request): AsyncIterable<Event>
}
