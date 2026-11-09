export type DomainErrorKind =
  | 'invalid-input'
  | 'not-found'
  | 'conflict'
  | 'forbidden'
  | 'unauthenticated'
  | 'unavailable'
  | 'rate-limited'

/** A failure of the application core, free of any transport concern; the HTTP mapping lives in DomainErrorFilter. */
export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind

  constructor(
    readonly code: string,
    message: string,
    /** Machine-readable context the client needs to recover, e.g. the current value behind a stale conflict. */
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class InvalidInputError extends DomainError {
  readonly kind = 'invalid-input'
}

export class NotFoundError extends DomainError {
  readonly kind = 'not-found'
}

export class ConflictError extends DomainError {
  readonly kind = 'conflict'
}

export class ForbiddenError extends DomainError {
  readonly kind = 'forbidden'
}

export class UnauthenticatedError extends DomainError {
  readonly kind = 'unauthenticated'
}

export class UnavailableError extends DomainError {
  readonly kind = 'unavailable'
}

export class TooManyRequestsError extends DomainError {
  readonly kind = 'rate-limited'
}

