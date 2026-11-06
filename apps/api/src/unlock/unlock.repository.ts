export const UNLOCK_REPOSITORY = Symbol('UNLOCK_REPOSITORY')

export interface UnlockRepository {
  createOpenOnes(userId: string, taxYear: number, sessionId: string): Promise<void>
  markPaid(sessionId: string, amountCents: number | null, am: Date): Promise<void>
  isPaid(userId: string, taxYear: number): Promise<boolean>
}
