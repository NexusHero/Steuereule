export interface OwlSettingRecord {
  userId: string
  enabled: boolean
  enabledAt: Date | null
}

export interface OwlCardDismissalRecord {
  id: string
  userId: string
  taxYear: number
  fingerprint: string
  createdAt: Date
}

export const OWL_SETTING_REPOSITORY = Symbol('OWL_SETTING_REPOSITORY')
export const OWL_CARD_DISMISSAL_REPOSITORY = Symbol('OWL_CARD_DISMISSAL_REPOSITORY')

export interface OwlSettingRepository {
  findByUserId(userId: string): Promise<OwlSettingRecord | null>
  setEnabled(userId: string, enabled: boolean): Promise<OwlSettingRecord>
}

export interface OwlCardDismissalRepository {
  listForUserAndYear(userId: string, taxYear: number): Promise<string[]>
  dismiss(userId: string, taxYear: number, fingerprint: string): Promise<void>
}
