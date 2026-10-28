export const FREISCHALTUNG_REPOSITORY = Symbol('FREISCHALTUNG_REPOSITORY')

export interface FreischaltungRepository {
  legeOffeneAn(userId: string, steuerjahr: number, sitzungId: string): Promise<void>
  /** Idempotent: a webhook redelivery for an already-paid session changes nothing. */
  markiereBezahlt(sitzungId: string, betragCent: number | null, am: Date): Promise<void>
  istBezahlt(userId: string, steuerjahr: number): Promise<boolean>
}
