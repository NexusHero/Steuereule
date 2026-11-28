import type { ResolvedAiSlotConfig } from './ai-runtime-config.service.js'

/**
 * Port for one isolated model call: a system prompt, one user message, plain text back.
 * No chat history, no tools, no streaming. The document parse strategies (receipt, LStB,
 * Swiss salary certificate) need exactly this and nothing more, so they depend on this port
 * and never on an LLM SDK. The LangChain adapter lives in `langchain-single-shot.adapter.ts`.
 */
export interface SingleShotModel {
  complete(prompt: SingleShotPrompt, options: SingleShotOptions): Promise<string>
}

export interface SingleShotPrompt {
  readonly system: string
  readonly user: string
}

export interface SingleShotOptions {
  /** Aborts the call (a timeout). The adapter must reject once it fires. */
  readonly signal: AbortSignal
}

/** Builds the model for a resolved AI slot; null when the slot has no usable model. */
export type SingleShotModelFactory = (config: ResolvedAiSlotConfig) => SingleShotModel | null

export const SINGLE_SHOT_MODEL_FACTORY = Symbol('SINGLE_SHOT_MODEL_FACTORY')

/** No model at all: the strategies then keep their deterministic read. The default outside Nest DI (unit tests). */
export const noSingleShotModel: SingleShotModelFactory = () => null
