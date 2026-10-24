import { describe, expect, it } from 'vitest'
import {
  pruefePlausibilitaet,
  type Hinweis,
  type PlausibilitaetsErgebnis,
  type PlausibilitaetsEingaben,
  type Widerspruch,
} from './plausibilitaet'
import { angestelltenStand, type AngestelltenStand } from './angestellte'
import { lstbZustand } from './lstb'
import { berechneWerktage, type WerktageErgebnis } from './werktage'

/** Narrows to the blocker list (empty when einreichbar — the guard, not a cast). */
function widersprueche(r: PlausibilitaetsErgebnis): readonly Widerspruch[] {
  return r.kind === 'nicht-einreichbar' ? r.widersprueche : []
}

/** Hinweise live on both variants, so this is a convenience, not a narrowing. */
function hinweise(r: PlausibilitaetsErgebnis): readonly Hinweis[] {
  return r.hinweise
}

function eingaben(over: {
  lstb?: ReturnType<typeof lstbZustand>
  werktage?: WerktageErgebnis
  stand?: AngestelltenStand
  erfasstNichtGerechnet?: number
} = {}): PlausibilitaetsEingaben {
  return {
    lstb:
      over.lstb ??
      lstbZustand({ bruttoarbeitslohn: { kind: 'erfasst', wert: 50000 }, lohnsteuer: { kind: 'erfasst', wert: 9000 }, sozialversicherung: { kind: 'erfasst', wert: 10000 } }),
    werktage: over.werktage ?? berechneWerktage({ jahr: 2026, werktage: [1, 2, 3, 4, 5], urlaubstage: 30, krankheitstage: 5, homeofficeTage: 40 }),
    stand:
      over.stand ??
      angestelltenStand({ einnahmen: 50000, werbungskosten: 1200, sonderausgaben: 3000, offenePosten: 0, konflikte: 0, gegated: [] }),
    erfasstNichtGerechnet: over.erfasstNichtGerechnet ?? 0,
  }
}

describe('pruefePlausibilitaet (M2)', () => {
  it('a complete, consistent case is einreichbar', () => {
    expect(pruefePlausibilitaet(eingaben())).toEqual({ kind: 'einreichbar', hinweise: [] })
  })

  it('an open LStB field blocks, naming the field', () => {
    const r = pruefePlausibilitaet(
      eingaben({ lstb: lstbZustand({ bruttoarbeitslohn: { kind: 'offen' }, lohnsteuer: { kind: 'offen' }, sozialversicherung: { kind: 'offen' } }) }),
    )
    expect(widersprueche(r)).toEqual([{ art: 'lstb-offen', felder: ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung'] }])
  })

  it('an unreadable ("unklar") LStB field blocks separately from merely-open', () => {
    const zustand = lstbZustand({ bruttoarbeitslohn: { kind: 'erfasst', wert: 50000 }, lohnsteuer: { kind: 'unklar' }, sozialversicherung: { kind: 'erfasst', wert: 10000 } })
    expect(widersprueche(pruefePlausibilitaet(eingaben({ lstb: zustand })))).toContainEqual({ art: 'lstb-unklar', felder: ['lohnsteuer'] })
  })

  it('an LStB contradiction blocks', () => {
    const zustand = lstbZustand({ bruttoarbeitslohn: { kind: 'erfasst', wert: 1000 }, lohnsteuer: { kind: 'erfasst', wert: 2000 }, sozialversicherung: { kind: 'erfasst', wert: 0 } })
    expect(widersprueche(pruefePlausibilitaet(eingaben({ lstb: zustand })))).toContainEqual({ art: 'lstb-widerspruch' })
  })

  it('a werktage contradiction blocks', () => {
    const arbeit = berechneWerktage({ jahr: 2026, werktage: [1], urlaubstage: 0, krankheitstage: 0, homeofficeTage: 99 })
    expect(widersprueche(pruefePlausibilitaet(eingaben({ werktage: arbeit })))).toContainEqual({ art: 'werktage-widerspruch' })
  })

  it('a gated Einkunftsart blocks, naming it', () => {
    const stand = angestelltenStand({ einnahmen: 0, werbungskosten: 0, sonderausgaben: 0, offenePosten: 0, konflikte: 0, gegated: ['Kapital'] })
    expect(widersprueche(pruefePlausibilitaet(eingaben({ stand })))).toContainEqual({ art: 'gated-einkunftsart', einkunftsart: 'Kapital' })
  })

  it('captured-but-not-computed amounts are a Hinweis, never a blocker', () => {
    expect(pruefePlausibilitaet(eingaben({ erfasstNichtGerechnet: 24650 }))).toEqual({
      kind: 'einreichbar',
      hinweise: [{ art: 'erfasst-nicht-gerechnet', betrag: 24650 }],
    })
  })

  it('Werbungskosten over Einnahmen is a Hinweis (possible Verlust, not a contradiction)', () => {
    const stand = angestelltenStand({ einnahmen: 1000, werbungskosten: 1500, sonderausgaben: 0, offenePosten: 0, konflikte: 0, gegated: [] })
    expect(hinweise(pruefePlausibilitaet(eingaben({ stand })))).toContainEqual({
      art: 'werbungskosten-uebersteigt-einnahmen',
      werbungskosten: 1500,
      einnahmen: 1000,
    })
  })
})
