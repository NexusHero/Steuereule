// M2 — Plausibilitäts-Prüfung vor Abgabe (ticket 08). A deterministic gate between "the data is
// in" and "einreichbar": it names every WIDERSPRUCH (a blocker — the return cannot be submitted
// while it stands) and every HINWEIS (a warning — worth a look, does not block), over the same
// honest states the rest of the core already derived. Pure, deterministic, dependency-free
// (ADR-0004). It never invents a "frisst das Finanzamt"-style score — it reports facts the core
// already holds, in a shape a screen can render as a list (ADR-0032: nothing on screen promises
// more than the slice delivers).
import type { LstbFeldId, LstbZustand } from './lstb.js'
import type { WerktageErgebnis } from './werktage.js'
import type { AngestelltenStand } from './angestellte.js'
import type { Einkunftsart } from './einkunftsarten.js'

/** A blocker — submission is refused while any of these stand. */
export type Widerspruch =
  | { readonly art: 'lstb-offen'; readonly felder: readonly LstbFeldId[] }
  | { readonly art: 'lstb-unklar'; readonly felder: readonly LstbFeldId[] }
  | { readonly art: 'lstb-widerspruch' }
  | { readonly art: 'werktage-widerspruch' }
  | { readonly art: 'gated-einkunftsart'; readonly einkunftsart: Einkunftsart }

/** A warning — shown, never blocks. */
export type Hinweis =
  | { readonly art: 'erfasst-nicht-gerechnet'; readonly betrag: number }
  | { readonly art: 'werbungskosten-uebersteigt-einnahmen'; readonly werbungskosten: number; readonly einnahmen: number }

export interface PlausibilitaetsEingaben {
  readonly lstb: LstbZustand
  readonly werktage: WerktageErgebnis
  readonly stand: AngestelltenStand
  /** Captured-but-not-folded amounts (DHF-Miete + Abfindung + Lohnersatz), whole euros. */
  readonly erfasstNichtGerechnet: number
}

export type PlausibilitaetsErgebnis =
  | { readonly kind: 'einreichbar'; readonly hinweise: readonly Hinweis[] }
  | { readonly kind: 'nicht-einreichbar'; readonly widersprueche: readonly Widerspruch[]; readonly hinweise: readonly Hinweis[] }

/**
 * The one check. `einreichbar` iff there are zero Widersprüche — a Hinweis alone never blocks.
 * The Widerspruch set is derived from the same `lstbZustand`/`berechneWerktage`/
 * `angestelltenStand` results the Cockpit and the guided masks already show, so the Prüfung can
 * never contradict what the user saw on the way in (one truth, ADR-014/048).
 */
export function pruefePlausibilitaet(eingaben: PlausibilitaetsEingaben): PlausibilitaetsErgebnis {
  const widersprueche: Widerspruch[] = []
  const hinweise: Hinweis[] = []

  // LStB: an unreadable field ("unklar") or a structural contradiction blocks; a merely-not-yet-
  // filled field ("offen") blocks too — a return cannot be submitted with an empty LStB figure.
  if (eingaben.lstb.kind === 'unvollstaendig') {
    if (eingaben.lstb.offen.length > 0) widersprueche.push({ art: 'lstb-offen', felder: eingaben.lstb.offen })
    if (eingaben.lstb.unklar.length > 0) widersprueche.push({ art: 'lstb-unklar', felder: eingaben.lstb.unklar })
  } else if (eingaben.lstb.kind === 'widerspruch') {
    widersprueche.push({ art: 'lstb-widerspruch' })
  }

  if (eingaben.werktage.kind === 'widerspruch') {
    widersprueche.push({ art: 'werktage-widerspruch' })
  }

  // A declared-but-gated Einkunftsart (Gewerbe/Krypto/Verkauf-möbliert) blocks: 1.0 cannot compute
  // it, and ADR-032 refuses to ship half a return. Each gated art is named, not collapsed to a count.
  if (eingaben.stand.kind === 'offen') {
    for (const einkunftsart of eingaben.stand.gegated) {
      widersprueche.push({ art: 'gated-einkunftsart', einkunftsart })
    }
  }

  // Hinweise — never blocks.
  if (eingaben.erfasstNichtGerechnet > 0) {
    hinweise.push({ art: 'erfasst-nicht-gerechnet', betrag: eingaben.erfasstNichtGerechnet })
  }
  const { einnahmen, werbungskosten } = eingaben.stand
  if (werbungskosten > einnahmen) {
    hinweise.push({ art: 'werbungskosten-uebersteigt-einnahmen', werbungskosten, einnahmen })
  }

  if (widersprueche.length === 0) return { kind: 'einreichbar', hinweise }
  return { kind: 'nicht-einreichbar', widersprueche, hinweise }
}
