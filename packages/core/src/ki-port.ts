import type { Posten, Quelle } from './berechnung.js'
import type { IncomeType } from './einkunftsarten.js'

/** The schema the LLM must answer. */
export interface KiVorschlag {
  readonly id: string
  readonly einkunftsart: IncomeType
  readonly betrag: number
  readonly belegId?: string
}

/** The KI port in domain language. */
export interface KiPort {
  schlageVorAusBeleg(belegId: string): Promise<readonly KiVorschlag[]>
  erklaereQuelle(quelleId: string): Promise<string>
}

export function nehmeVorschlagAn(vorschlag: KiVorschlag, postenId: string): Posten {
  const quelle: Quelle =
    vorschlag.belegId !== undefined
      ? { art: 'ki-vorschlag', vorschlagId: vorschlag.id, belegId: vorschlag.belegId }
      : { art: 'ki-vorschlag', vorschlagId: vorschlag.id }
  return { id: postenId, einkunftsart: vorschlag.einkunftsart, betrag: vorschlag.betrag, quelle }
}
