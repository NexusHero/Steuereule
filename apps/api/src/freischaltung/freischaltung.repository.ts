export const UNLOCK_REPOSITORY = Symbol('UNLOCK_REPOSITORY')

export interface UnlockRepository {
  createOpenOnes(userId: string, steuerjahr: number, sessionId: string): Promise<void>
  markPaid(sessionId: string, betragCent: number | null, am: Date): Promise<void>
  isPaid(userId: string, steuerjahr: number): Promise<boolean>
}
