// ADR-014/048 — the KI boundary as a PORT. The deterministic core (berechnung.ts) never
// calls the KI; it depends on this interface only as a TYPE, so it is fully testable with
// no KI injected (ADR-048 §1). The KI SUGGESTS, never computes: a `KiVorschlag` is a
// distinct type from a `Posten`, and only `nehmeVorschlagAn` turns one into the other,
// with Herkunft "ki-vorschlag" (ADR-014's "Beleg + KI-Vorschlag, bestätigt"). LangChain
// lives BEHIND this port (ADR-048 §3) — that wiring is api-side and a later slice; this
// file is the contract, not the implementation. Pure types + one pure function, no I/O.
import type { Posten, Quelle } from './berechnung.js'
import type { Einkunftsart } from './einkunftsarten.js'

/**
 * The schema the LLM must answer in (ADR-048 §2: no free-form fact, no un-belegte Zahl
 * can cross the boundary). A suggestion carries an Einkunftsart and an amount, optionally
 * the Beleg it was derived from. It is NOT a Posten until accepted.
 */
export interface KiVorschlag {
  readonly id: string
  readonly einkunftsart: Einkunftsart
  readonly betrag: number
  readonly belegId?: string
}

/**
 * The KI port in domain language (ADR-048 §3). Returned as `Promise`s — it is an async,
 * injected boundary — but the deterministic core's own functions never await it; they
 * only ever receive its OUTPUT (`KiVorschlag`) as already-materialized data.
 */
export interface KiPort {
  /** Suggest line items from a prepared Beleg (ADR-048 §2: only over our own prepared data). */
  schlageVorAusBeleg(belegId: string): Promise<readonly KiVorschlag[]>
  /** Explain a legal source (ADR-039, Eulen-Modus) — a later slice; declared, not built. */
  erklaereQuelle(quelleId: string): Promise<string>
}

/**
 * ADR-014 — a suggestion becomes a Posten ONLY by acceptance, never by the KI writing
 * directly. The resulting Quelle records the suggestion id and the Beleg it came from, so
 * "jede Zahl trägt Herkunft" survives the acceptance step.
 */
export function nehmeVorschlagAn(vorschlag: KiVorschlag, postenId: string): Posten {
  const quelle: Quelle =
    vorschlag.belegId !== undefined
      ? { art: 'ki-vorschlag', vorschlagId: vorschlag.id, belegId: vorschlag.belegId }
      : { art: 'ki-vorschlag', vorschlagId: vorschlag.id }
  return { id: postenId, einkunftsart: vorschlag.einkunftsart, betrag: vorschlag.betrag, quelle }
}
