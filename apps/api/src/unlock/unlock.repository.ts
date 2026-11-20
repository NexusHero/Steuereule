export const UNLOCK_REPOSITORY = Symbol('UNLOCK_REPOSITORY')

/**
 * The price paid (ADR-0101 §21): `standard` opens the printout; `selbststaendig`, the higher one, opens a
 * year with self-employment (fill-in help, exports) and everything `standard` opens.
 */
export type UnlockTier = 'standard' | 'selbststaendig'

export interface UnlockRepository {
  createOpenOnes(userId: string, taxYear: number, sessionId: string, tier?: UnlockTier): Promise<void>
  markPaid(sessionId: string, amountCents: number | null, am: Date): Promise<void>
  /** Paid for at least `tier` (default `standard`). */
  isPaid(userId: string, taxYear: number, tier?: UnlockTier): Promise<boolean>
}
