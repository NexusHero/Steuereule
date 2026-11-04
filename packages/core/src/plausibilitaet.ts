import type { LstbFeldId, LstbZustand } from './lstb.js'
import type { WerktageErgebnis } from './werktage.js'
import type { AngestelltenStand } from './angestellte.js'
import type { Einkunftsart } from './einkunftsarten.js'

export type Widerspruch =
  | { readonly art: 'lstb-offen'; readonly felder: readonly LstbFeldId[] }
  | { readonly art: 'lstb-unklar'; readonly felder: readonly LstbFeldId[] }
  | { readonly art: 'lstb-widerspruch' }
  | { readonly art: 'werktage-widerspruch' }
  | { readonly art: 'gated-einkunftsart'; readonly einkunftsart: Einkunftsart }

export type Hinweis =
  | { readonly art: 'erfasst-nicht-gerechnet'; readonly betrag: number }
  | { readonly art: 'werbungskosten-uebersteigt-einnahmen'; readonly werbungskosten: number; readonly einnahmen: number }

export interface PlausibilitaetsEingaben {
  readonly lstb: LstbZustand
  readonly werktage: WerktageErgebnis
  readonly stand: AngestelltenStand
  readonly erfasstNichtGerechnet: number
}

export type PlausibilitaetsErgebnis =
  | { readonly kind: 'einreichbar'; readonly hinweise: readonly Hinweis[] }
  | { readonly kind: 'nicht-einreichbar'; readonly widersprueche: readonly Widerspruch[]; readonly hinweise: readonly Hinweis[] }

export function pruefePlausibilitaet(eingaben: PlausibilitaetsEingaben): PlausibilitaetsErgebnis {
  const widersprueche: Widerspruch[] = []
  const hinweise: Hinweis[] = []

  if (eingaben.lstb.kind === 'unvollstaendig') {
    if (eingaben.lstb.offen.length > 0) widersprueche.push({ art: 'lstb-offen', felder: eingaben.lstb.offen })
    if (eingaben.lstb.unklar.length > 0) widersprueche.push({ art: 'lstb-unklar', felder: eingaben.lstb.unklar })
  } else if (eingaben.lstb.kind === 'widerspruch') {
    widersprueche.push({ art: 'lstb-widerspruch' })
  }

  if (eingaben.werktage.kind === 'widerspruch') {
    widersprueche.push({ art: 'werktage-widerspruch' })
  }

  if (eingaben.stand.kind === 'offen') {
    for (const einkunftsart of eingaben.stand.gegated) {
      widersprueche.push({ art: 'gated-einkunftsart', einkunftsart })
    }
  }

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
