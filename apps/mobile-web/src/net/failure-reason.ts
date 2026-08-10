// One vocabulary for "why did that request not give us an answer" (#306, #308).
//
// The defect these exist to stop is a screen naming a cause it has not established — telling a
// user to check a connection that was demonstrably working, because the only thing the code
// kept was that *something* failed. `useDeviceQrCode` already carries a `reason` discriminator
// for exactly this; this is that idea in the one shape both it and better-auth's client can be
// classified into, so a second screen does not invent a third vocabulary.
//
// Three values, not two, and the third is load-bearing: `unknown` is what keeps the fix from
// becoming its own mirror. Asserting "the server refused you" when the request never left the
// device is the same defect as asserting "check your connection" when the server answered 403.

export type FailureReason =
  /** Nothing answered — no HTTP response reached us. Blaming the connection is honest here. */
  | 'unreachable'
  /** The server answered, and its answer was a refusal. The connection is fine; the request was not. */
  | 'refused'
  /** We genuinely cannot tell. Say so rather than guessing — see the module header. */
  | 'unknown'

/**
 * An HTTP status a failed call came back with, if any.
 *
 * `0`, `undefined` and `null` all mean "no response" in the shapes we consume: `fetch` rejects
 * outright, and better-auth's client surfaces a transport failure as an error object whose
 * status never became a real one.
 */
export type MaybeHttpStatus = number | null | undefined

/** Classify a failure we have a status for (or conspicuously do not). */
export function classifyByStatus(status: MaybeHttpStatus): FailureReason {
  if (status === undefined || status === null || status === 0) return 'unreachable'
  // Any real response — including 4xx and 5xx — means we reached the server. It answered, and
  // the answer was no. That is emphatically not a connection problem, which is the whole of #306.
  if (status >= 100) return 'refused'
  return 'unknown'
}

/**
 * Classify a thrown value from a `fetch`-based call.
 *
 * A `TypeError` is what browsers throw when the request never completed — DNS failure, refused
 * connection, offline, CORS preflight that never got a reply. Anything else reached further
 * than that, and we do not pretend to know how far.
 */
export function classifyThrown(thrown: unknown): FailureReason {
  if (thrown instanceof TypeError) return 'unreachable'
  return 'unknown'
}

/** Carries {@link FailureReason} across a TanStack Query rejection, which only passes errors. */
export class RequestFailedError extends Error {
  readonly reason: FailureReason

  constructor(message: string, reason: FailureReason) {
    super(message)
    this.name = 'RequestFailedError'
    this.reason = reason
  }
}

/** The reason behind a query error, or `'unknown'` for anything that did not carry one. */
export function reasonOf(error: unknown): FailureReason {
  return error instanceof RequestFailedError ? error.reason : 'unknown'
}
