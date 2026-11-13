// The owl's line of thought as the chat shows it: what it did, step by step, and what each tool
// found. Server and app fold the same stream events with the same function, so the live block and
// the stored answer can never tell different stories.
import type { AdvisorMessageMeta } from './advisor'
import type { AdvisorStreamEvent } from './ki-port'

export const ADVISOR_THOUGHT_STEP_KINDS = ['status', 'tool'] as const
export type AdvisorThoughtStepKind = (typeof ADVISOR_THOUGHT_STEP_KINDS)[number]

export interface AdvisorThoughtStep {
  readonly kind: AdvisorThoughtStepKind
  /** What the owl is doing, in the user's language. */
  readonly label: string
  /** The tool's name, which picks the step's icon; only on tool steps. */
  readonly tool?: string | undefined
  /** What the tool found, in a few words and without personal data; absent while it runs. */
  readonly result?: string | undefined
  /** False when the tool refused (bad arguments, a field it may not write). */
  readonly ok?: boolean | undefined
}

/** Folds one stream event into the steps; returns the same array when the event is not a step. */
export function foldThoughtEvent(steps: readonly AdvisorThoughtStep[], ev: AdvisorStreamEvent): readonly AdvisorThoughtStep[] {
  if (ev.event === 'status') return [...steps, { kind: 'status', label: ev.data.text }]
  if (ev.event === 'tool') return [...steps, { kind: 'tool', tool: ev.data.name, label: ev.data.label }]
  if (ev.event !== 'tool_result') return steps
  let index = -1
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i]!
    if (step.kind === 'tool' && step.tool === ev.data.name && step.ok === undefined) {
      index = i
      break
    }
  }
  if (index < 0) return steps
  const next = [...steps]
  next[index] = { ...next[index]!, result: ev.data.result, ok: ev.data.ok }
  return next
}

/** The steps of a stored answer; answers from before the structured steps carry plain lines. */
export function thoughtStepsOf(meta: Pick<AdvisorMessageMeta, 'steps' | 'thoughtSteps'> | null | undefined): readonly AdvisorThoughtStep[] {
  if (!meta) return []
  if (meta.thoughtSteps && meta.thoughtSteps.length > 0) return meta.thoughtSteps
  return (meta.steps ?? []).map((label) => ({ kind: 'status', label }))
}
