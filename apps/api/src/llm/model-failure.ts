import type { AdvisorModelFailure, AdvisorModelFailureReason } from '@steuereule/core'

export const providerName = (provider: string): string => (provider === 'google-genai' ? 'Gemini' : provider === 'anthropic' ? 'Claude' : provider === 'openai' ? 'OpenAI' : provider)

/** The HTTP status of a provider error: its own field, or the `[429 Too Many Requests]` the Google SDK writes into the message. */
function statusOf(error: unknown, message: string): number | undefined {
  const own = (error as { status?: unknown; statusCode?: unknown } | null)?.status ?? (error as { statusCode?: unknown } | null)?.statusCode
  if (typeof own === 'number' && own >= 100 && own < 600) return own
  const match = /\[(\d{3})\b/.exec(message) ?? /\b(?:status|code)[ :=]+(\d{3})\b/i.exec(message)
  return match ? Number(match[1]) : undefined
}

/**
 * Sorts a failed model call into a reason the user can act on. Only the status and the provider
 * leave this function as `detail`; the message text of the provider stays in the log.
 */
export function classifyModelFailure(error: unknown, how: 'timeout' | 'error', provider: string): AdvisorModelFailure {
  const message = error instanceof Error ? error.message : String(error)
  const status = statusOf(error, message)
  const detail = `${providerName(provider)}${status !== undefined ? ` · HTTP ${status}` : ''}`
  const has = (pattern: RegExp) => pattern.test(message)
  const as = (reason: AdvisorModelFailureReason): AdvisorModelFailure => ({ reason, detail })

  if (how === 'timeout') return as('timeout')
  if (has(/safety|blocked|prohibited|content[_ ]filter|recitation/i) && status !== 429) return as('blocked')
  if (status === 429 || has(/quota|rate[ _-]?limit|resource[_ ]exhausted|insufficient_quota|too many requests/i)) return as('quota')
  if (status === 401 || status === 403 || status === 404 || has(/api key|api_key|permission[_ ]denied|invalid[_ ]x-api-key|unauthori[sz]ed|authentication|model .*not found|is not found/i)) return as('not-configured')
  if (status === 400 && has(/api key/i)) return as('not-configured')
  if (status !== undefined && status >= 500) return as('unavailable')
  if (has(/overloaded|unavailable|try again later|temporarily/i)) return as('unavailable')
  if (has(/timed? ?out|timeout|aborterror/i)) return as('timeout')
  if (has(/fetch failed|econn|enotfound|eai_again|socket|terminated|network|error reading from the stream|premature close/i)) return as('network')
  return as('unknown')
}
