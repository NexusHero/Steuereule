// The single assembled shape both representations (JSON, PDF) render from — one data
// path, two renderings (ADR-0013 §4/§7). Field names/nesting match the ADR-0013 frozen
// JSON contract exactly; the PDF template (export-report-template.ts) renders the
// identical object in human-readable German. Never add a field here that isn't in the
// frozen contract — secrets (password hash, session/verification tokens, any other
// user's data) must never reach this shape in the first place, so there is nothing to
// accidentally leak downstream in either renderer.
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
  steuerId: string
  steuernummer: string | null
  createdAt: string
  updatedAt: string
}

export interface ExportAccessLogEntry {
  action: string
  resource: string
  createdAt: string
}

export interface ExportDocument {
  schemaVersion: '1.0'
  exportedAt: string
  account: ExportAccountSection
  /** null — honest — when the caller has never saved a Profile (ADR-0013 §4). */
  profile: ExportProfileSection | null
  /** Honest empty set until a tax-year model exists (ADR-0013 §4) — never a silent omission. */
  taxData: []
  /** The caller's own TaxDataAccessLog rows, oldest first. */
  accessLog: ExportAccessLogEntry[]
}
