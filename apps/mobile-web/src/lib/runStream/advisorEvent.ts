// Turns what the stream delivers into the events the chat acts on. A frame is only JSON of unknown
// shape until it has been checked here, so the code that follows an answer never casts.
import { ADVISOR_PLAN_STEP_STATUSES, SCREENS, type AdvisorChatMessageView, type AdvisorPlanStepStatus, type AdvisorStreamEvent, type Screen } from '@steuereule/core'
import type { RunFrame } from './runStream'

/**
 * What the client acts on, as far as the wire type `AdvisorStreamEvent` is not tolerant enough: the
 * server sends every field, but an older or partial run may leave one out and the answer must still
 * go on. `choices`, `action` and `twoPaths` are not followed here (the stored message carries them).
 */
export type AdvisorRunEvent =
  | Extract<AdvisorStreamEvent, { readonly event: 'status' | 'reasoning' | 'tool' | 'tool_result' | 'token' | 'plan' }>
  | { readonly event: 'start'; readonly data: { readonly runId?: string; readonly userMessage?: AdvisorChatMessageView } }
  | { readonly event: 'ui_command'; readonly data: { readonly openMask: Screen; readonly focus?: string } }
  /** The payload as sent: its message may also sit in `fields`, which `apiErrorText` knows. */
  | { readonly event: 'error'; readonly data: object }
  | { readonly event: 'done'; readonly data: AdvisorRunDone }

/** The part of the finished answer the client reads. */
export interface AdvisorRunDone {
  readonly mode?: string
  readonly userMessage?: AdvisorChatMessageView
  readonly assistantMessage?: AdvisorChatMessageView
}

type Payload = Readonly<Record<string, unknown>>

function isPayload(data: unknown): data is Payload {
  return typeof data === 'object' && data !== null
}

/** Only that it is an object is checked: the message is shown by the chat, which reads what it needs. */
function isMessageView(value: unknown): value is AdvisorChatMessageView {
  return isPayload(value)
}

function isPlanStatus(value: unknown): value is AdvisorPlanStepStatus {
  return ADVISOR_PLAN_STEP_STATUSES.some((status) => status === value)
}

function isScreen(value: unknown): value is Screen {
  return SCREENS.some((screen) => screen === value)
}

function planSteps(steps: unknown): Extract<AdvisorRunEvent, { readonly event: 'plan' }>['data']['steps'] | null {
  if (!Array.isArray(steps)) return null
  return steps.flatMap((step: unknown) => {
    if (!isPayload(step)) return []
    const { text, status } = step
    return typeof text === 'string' && isPlanStatus(status) ? [{ text, status }] : []
  })
}

/** The event a frame carries, or null when it is not one the client follows or does not fit its shape. */
export function decodeAdvisorEvent({ event, data }: RunFrame): AdvisorRunEvent | null {
  if (!isPayload(data)) return null
  switch (event) {
    case 'start': {
      const { runId, userMessage } = data
      return {
        event,
        data: { ...(typeof runId === 'string' ? { runId } : {}), ...(isMessageView(userMessage) ? { userMessage } : {}) },
      }
    }
    case 'status':
    case 'reasoning':
    case 'token':
      return 'text' in data ? { event, data: { text: String(data.text) } } : null
    case 'tool':
      return 'label' in data ? { event, data: { name: String(data.name ?? ''), label: String(data.label) } } : null
    case 'tool_result':
      return 'result' in data ? { event, data: { name: String(data.name ?? ''), ok: data.ok === true, result: String(data.result) } } : null
    case 'plan': {
      const steps = 'steps' in data ? planSteps(data.steps) : null
      return steps === null ? null : { event, data: { steps } }
    }
    case 'ui_command': {
      const { openMask, focus } = data
      return isScreen(openMask) ? { event, data: { openMask, ...(typeof focus === 'string' ? { focus } : {}) } } : null
    }
    case 'error':
      return { event, data }
    case 'done': {
      const { mode, userMessage, assistantMessage } = data
      return {
        event,
        data: {
          ...(typeof mode === 'string' ? { mode } : {}),
          ...(isMessageView(userMessage) ? { userMessage } : {}),
          ...(isMessageView(assistantMessage) ? { assistantMessage } : {}),
        },
      }
    }
    default:
      return null
  }
}
