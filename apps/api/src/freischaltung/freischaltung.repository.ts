export const FREISCHALTUNG_REPOSITORY = Symbol('FREISCHALTUNG_REPOSITORY')

export interface FreischaltungRepository {
  legeOffeneAn(userId: string, steuerjahr: number, sitzungId: string): Promise<void>
  markiereBezahlt(sitzungId: string, betragCent: number | null, am: Date): Promise<void>
  istBezahlt(userId: string, steuerjahr: number): Promise<boolean>
}
