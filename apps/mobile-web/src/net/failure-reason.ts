export type FailureReason =
  | 'unreachable'
  | 'refused'
  | 'unknown'

export type MaybeHttpStatus = number | null | undefined

export function classifyByStatus(status: MaybeHttpStatus): FailureReason {
  if (status === undefined || status === null || status === 0) return 'unreachable'
  if (status >= 100) return 'refused'
  return 'unknown'
}

export function classifyThrown(thrown: unknown): FailureReason {
  if (thrown instanceof TypeError) return 'unreachable'
  return 'unknown'
}

/** Carries FailureReason across a TanStack Query rejection, which only passes errors. */
export class RequestFailedError extends Error {
  readonly reason: FailureReason

  constructor(message: string, reason: FailureReason) {
    super(message)
    this.name = 'RequestFailedError'
    this.reason = reason
  }
}

export function reasonOf(error: unknown): FailureReason {
  return error instanceof RequestFailedError ? error.reason : 'unknown'
}
