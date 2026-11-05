export const UNLOCK_REPOSITORY = Symbol('UNLOCK_REPOSITORY')

export interface UnlockRepository {
  legeOffeneAn(userId: string, steuerjahr: number, sitzungId: string): Promise<void>
  markiereBezahlt(sitzungId: string, betragCent: number | null, am: Date): Promise<void>
  istBezahlt(userId: string, steuerjahr: number): Promise<boolean>
}
