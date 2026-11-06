export interface ExportAccountSection {
  email: string
  name: string
  emailVerified: boolean
  createdAt: string
  authProviders: string[]
}

export interface ExportProfileSection {
  firstName: string
  lastName: string
  steuerId: string | null
  steuernummer: string | null
  createdAt: string
  updatedAt: string
}

export interface ExportAccessLogEntry {
  action: string
  resource: string
  source?: string | null
  createdAt: string
}

export type ExportTaxDataValue = string | number | boolean | null

/** One stored tax-data row: its area, tax year, and its fields with technical keys removed. */
export interface ExportTaxDataEntry {
  area: string
  taxYear: number | null
  fields: Record<string, ExportTaxDataValue>
}

export interface ExportDocument {
  schemaVersion: '1.0'
  exportedAt: string
  account: ExportAccountSection
  profile: ExportProfileSection | null
  taxData: ExportTaxDataEntry[]
  accessLog: ExportAccessLogEntry[]
}
