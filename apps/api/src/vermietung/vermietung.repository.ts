import type { VermietungFeldId } from '@steuereule/core'

export interface VermietungsobjektRecord {
  id: string
  userId: string
  steuerjahr: number
  mieteinnahmen: string | null
  anschaffungskosten: string | null
  baujahr: string | null
  werbungskosten: string | null
  strasse?: string | null
  hausnummer?: string | null
  plz?: string | null
  ort?: string | null
  wohnflaeche?: string | null
  afaWieVorjahr?: boolean | null
}

export const VERMIETUNG_REPOSITORY = Symbol('VERMIETUNG_REPOSITORY')

/** The persistence seam for the Vermietung guided mask. */
export interface VermietungRepository {
  listForUserAndYear(userId: string, steuerjahr: number): Promise<VermietungsobjektRecord[]>
  create(userId: string, steuerjahr: number): Promise<VermietungsobjektRecord>
  setFeld(userId: string, steuerjahr: number, objektId: string, feld: VermietungFeldId, wert: string | null): Promise<VermietungsobjektRecord | null>
  setAdresse(
    userId: string,
    steuerjahr: number,
    objektId: string,
    adresse: { strasse?: string | null; hausnummer?: string | null; plz?: string | null; ort?: string | null; wohnflaeche?: string | null; afaWieVorjahr?: boolean | null },
  ): Promise<VermietungsobjektRecord | null>
}
