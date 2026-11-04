export interface JahresuebernahmeRecord {
  id: string
  userId: string
  steuerjahr: number
  vorjahr: number
  createdAt: Date
}

export const JAHRESUEBERNAHME_REPOSITORY = Symbol('JahresuebernahmeRepository')

/** The persistence seam recording which tax year was taken over from which previous year. */
export interface JahresuebernahmeRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<JahresuebernahmeRecord | null>
  record(userId: string, steuerjahr: number, vorjahr: number): Promise<JahresuebernahmeRecord>
  deleteForUser(userId: string): Promise<number>
  listForUser(userId: string): Promise<JahresuebernahmeRecord[]>
}
