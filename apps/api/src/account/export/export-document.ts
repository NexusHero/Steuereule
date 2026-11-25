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

/** One original receipt file (Art. 20, H2-6). The JSON export carries the bytes; the PDF lists the file. */
export interface ExportReceiptFile {
  receiptId: string
  fileName: string
  mimeType: string
  byteLength: number
  uploadedAt: string
  /** Base64 of the original file: JSON export only; null in the PDF and when the file can no longer be decrypted. */
  contentBase64: string | null
}

export interface ExportDocument {
  schemaVersion: '1.0'
  exportedAt: string
  account: ExportAccountSection
  profile: ExportProfileSection | null
  taxData: ExportTaxDataEntry[]
  /** Sessions, second factor, passkeys, device logins, connected assistants and legal holds (API-17). */
  accountData: ExportTaxDataEntry[]
  receiptFiles: ExportReceiptFile[]
  accessLog: ExportAccessLogEntry[]
  /** Set only for the PDF: the log holds just the newest this-many entries (the JSON export is complete). */
  accessLogNewestOnly?: number
}
