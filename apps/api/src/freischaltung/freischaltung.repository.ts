export const UNLOCK_REPOSITORY = Symbol('UNLOCK_REPOSITORY')

export interface UnlockRepository {
  createPending?(userId: string, taxYear: number, sessionId: string): Promise<void>
  legeOffeneAn(userId: string, steuerjahr: number, sitzungId: string): Promise<void>
  markPaid?(sessionId: string, amountCent: number | null, at: Date): Promise<void>
  markiereBezahlt(sitzungId: string, betragCent: number | null, am: Date): Promise<void>
  isPaid?(userId: string, taxYear: number): Promise<boolean>
  istBezahlt(userId: string, steuerjahr: number): Promise<boolean>
}
