import type { DeleteAccountResult } from './account-deletion.repository.js'
import type { EmailSender } from '../auth/email-sender.js'

export const LIFECYCLE_SWEEP_REPOSITORY = Symbol('LIFECYCLE_SWEEP_REPOSITORY')

/** The persistence seam of the lifecycle sweeps (P7); the sweeps themselves are in lifecycle-sweeps.prisma.ts. */
export interface LifecycleSweepRepository {
  sweepEndedLegalHolds(erase: (userId: string, now: Date) => Promise<DeleteAccountResult>, now: Date): Promise<{ released: number; erasedFor: number }>
  sweepUnverifiedAccounts(deps: UnverifiedSweepDeps, now: Date): Promise<UnverifiedSweepResult>
  sweepEndedLoginRecords(now: Date): Promise<number>
  sweepOldAuditRows(now: Date): Promise<number>
}

export interface UnverifiedSweepDeps {
  readonly email: Pick<EmailSender, 'sendUnverifiedAccountWarning'>
  /** ADR-0030 activation gate: false while mail only reaches a log (`LoggingEmailSender`) — then nothing is deleted. */
  readonly mailIsDelivered: boolean
  readonly signInUrl: string
  readonly eraseUnverified: (userId: string) => Promise<DeleteAccountResult | null>
}

export interface UnverifiedSweepResult {
  readonly warned: number
  readonly finalWarned: number
  readonly deleted: number
}

