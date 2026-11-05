export interface OwlSettingRecord {
  userId: string
  aktiviert: boolean
  enabled?: boolean
  aktiviertAm: Date | null
  enabledAt?: Date | null
}
export type EulenEinstellungRecord = OwlSettingRecord

export interface OwlCardDismissalRecord {
  id: string
  userId: string
  steuerjahr: number
  taxYear?: number
  fingerprint: string
  createdAt: Date
}
export type EulenKartenVerwurfRecord = OwlCardDismissalRecord

export const OWL_SETTING_REPOSITORY = Symbol('OWL_SETTING_REPOSITORY')
export const EULEN_EINSTELLUNG_REPOSITORY = OWL_SETTING_REPOSITORY

export const OWL_CARD_DISMISSAL_REPOSITORY = Symbol('OWL_CARD_DISMISSAL_REPOSITORY')
export const EULEN_KARTEN_VERWURF_REPOSITORY = OWL_CARD_DISMISSAL_REPOSITORY

export interface OwlSettingRepository {
  findByUserId(userId: string): Promise<OwlSettingRecord | null>
  setEnabled?(userId: string, enabled: boolean): Promise<OwlSettingRecord>
  setAktiviert(userId: string, aktiviert: boolean): Promise<EulenEinstellungRecord>
}
export type EulenEinstellungRepository = OwlSettingRepository

export interface OwlCardDismissalRepository {
  listForUserAndYear(userId: string, steuerjahr: number): Promise<string[]>
  dismiss?(userId: string, taxYear: number, fingerprint: string): Promise<void>
  verwerfe(userId: string, steuerjahr: number, fingerprint: string): Promise<void>
}
export type EulenKartenVerwurfRepository = OwlCardDismissalRepository
