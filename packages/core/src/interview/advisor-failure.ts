/**
 * Why the language model did not answer (#487). The user is told the reason in plain words, so a
 * failed turn is no longer a silent switch to the built-in rules or a bare "broke off".
 */
export const ADVISOR_MODEL_FAILURE_REASONS = ['not-configured', 'quota', 'unavailable', 'timeout', 'network', 'blocked', 'unknown'] as const
export type AdvisorModelFailureReason = (typeof ADVISOR_MODEL_FAILURE_REASONS)[number]

export interface AdvisorModelFailure {
  readonly reason: AdvisorModelFailureReason
  /** Short and technical, for the curious and for support: provider and HTTP status. Never message text. */
  readonly detail?: string | undefined
}

export interface AdvisorModelFailureView {
  /** What happened, in a sentence the user can act on. */
  readonly text: string
  /** Whether asking again can help. A refused key does not get better by retrying. */
  readonly retryable: boolean
}

const VIEWS: Readonly<Record<AdvisorModelFailureReason, AdvisorModelFailureView>> = {
  'not-configured': {
    text: 'Die Verbindung zum Sprachmodell ist nicht richtig eingerichtet: Der Schlüssel oder das Modell wird abgelehnt. Das muss der Betreiber der App beheben.',
    retryable: false,
  },
  quota: {
    text: 'Das Kontingent beim Sprachmodell ist aufgebraucht oder wird gerade gedrosselt. In ein bis zwei Minuten geht es meist wieder.',
    retryable: true,
  },
  unavailable: { text: 'Das Sprachmodell ist gerade überlastet oder nicht erreichbar.', retryable: true },
  timeout: { text: 'Das Sprachmodell hat zu lange gebraucht.', retryable: true },
  network: { text: 'Die Verbindung zum Sprachmodell ist abgebrochen.', retryable: true },
  blocked: { text: 'Das Sprachmodell hat diese Frage aus Sicherheitsgründen nicht beantwortet. Formuliere sie etwas anders.', retryable: true },
  unknown: { text: 'Das Sprachmodell hat nicht geantwortet.', retryable: true },
}

export function describeModelFailure(reason: AdvisorModelFailureReason): AdvisorModelFailureView {
  return VIEWS[reason]
}

/** The sentence an answer from the built-in rules carries when the model failed (it never says "sorry" for nothing). */
export function fallbackNotice(failure: AdvisorModelFailure): string {
  return `${describeModelFailure(failure.reason).text} Diese Antwort kommt deshalb aus festen Regeln und kann ungenauer sein.`
}

/**
 * Whether the owl can reach its language model right now (#488). `connected`: it answered a check;
 * `degraded`: it answers, but the last turn failed a moment ago; `unavailable`: the check failed;
 * `rules-only`: no model is set up, the fixed rules answer.
 */
export type AdvisorConnectionState = 'connected' | 'degraded' | 'unavailable' | 'rules-only'

export interface AdvisorConnection {
  readonly state: AdvisorConnectionState
  /** Display name of the provider, e.g. "Gemini". Null for the fixed rules. */
  readonly provider: string | null
  readonly model: string | null
  /** Why it is not connected or only degraded. */
  readonly failure?: AdvisorModelFailure | undefined
  readonly checkedAt: string
}
