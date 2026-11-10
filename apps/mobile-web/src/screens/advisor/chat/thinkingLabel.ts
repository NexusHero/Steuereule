/**
 * What the thinking indicator shows (#451 decision 4): a real server step wins while it is fresh;
 * in between, friendly owl phrases rotate. The phrase texts live in i18n under
 * `advisor.chat.thinkingPhrases.<index>`.
 */

export const THINKING_PHRASE_INTERVAL_MS = 2500
export const THINKING_PHRASE_COUNT = 12

export type ThinkingLabel = { readonly kind: 'step'; readonly text: string } | { readonly kind: 'phrase'; readonly index: number }

export interface ThinkingLabelInput {
  readonly steps: readonly string[]
  /** When the latest step arrived (ms), or null if none has. */
  readonly lastStepAt: number | null
  readonly startedAt: number
  readonly now: number
  readonly phraseCount: number
}

export function thinkingLabelAt(input: ThinkingLabelInput): ThinkingLabel {
  const latest = input.steps[input.steps.length - 1]
  if (latest !== undefined && input.lastStepAt !== null && input.now - input.lastStepAt < THINKING_PHRASE_INTERVAL_MS) {
    return { kind: 'step', text: latest }
  }
  const elapsed = Math.max(0, input.now - input.startedAt)
  return { kind: 'phrase', index: Math.floor(elapsed / THINKING_PHRASE_INTERVAL_MS) % Math.max(1, input.phraseCount) }
}
