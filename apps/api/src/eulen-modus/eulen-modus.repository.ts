export interface EulenEinstellungRecord {
  userId: string
  aktiviert: boolean
  aktiviertAm: Date | null
}

export interface EulenKartenVerwurfRecord {
  id: string
  userId: string
  steuerjahr: number
  fingerprint: string
  createdAt: Date
}

export const EULEN_EINSTELLUNG_REPOSITORY = Symbol('EULEN_EINSTELLUNG_REPOSITORY')
export const EULEN_KARTEN_VERWURF_REPOSITORY = Symbol('EULEN_KARTEN_VERWURF_REPOSITORY')

export interface EulenEinstellungRepository {
  findByUserId(userId: string): Promise<EulenEinstellungRecord | null>
  setAktiviert(userId: string, aktiviert: boolean): Promise<EulenEinstellungRecord>
}

export interface EulenKartenVerwurfRepository {
  listForUserAndYear(userId: string, steuerjahr: number): Promise<string[]>
  verwerfe(userId: string, steuerjahr: number, fingerprint: string): Promise<void>
}
