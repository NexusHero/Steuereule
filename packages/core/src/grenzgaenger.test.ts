import { describe, expect, it } from 'vitest'
import { amtlicherMonatskurs } from './wechselkurs'
import {
  bruttolohnAlsKernposten,
  chPostenAlsKernposten,
  chPostenAusLohnausweis,
  deserialisiereLohnausweisFeld,
  grenzgaengerStand,
  grenzgaengerStatus,
  krankenkasseAbzug,
  LOHNAUSWEIS_FELDER,
  offeneLohnausweisFelder,
  saeule3aAbzug,
  serialisiereLohnausweisFeld,
  zulagenVerrechnen,
  type LohnausweisWerte,
} from './grenzgaenger'

// ADR-029/036/013 — the Grenzgänger-CH domain: the 45-Tage rule, the guided Lohnausweis
// mask, and the CH line items (CHF→EUR, provenance-carrying, no invented formula).

const KURS = amtlicherMonatskurs('2026-01', 0.9412)

describe('grenzgaengerStatus — ADR-013 45-Tage-Regel', () => {
  it('DE-Wohnsitz with ≤ 45 Nichtrückkehrtage is an echter Grenzgänger', () => {
    expect(grenzgaengerStatus('Deutschland', 0)).toBe('echter-grenzgaenger')
    expect(grenzgaengerStatus('Deutschland', 45)).toBe('echter-grenzgaenger')
  })

  it('more than 45 Nichtrückkehrtage ends Grenzgänger status', () => {
    expect(grenzgaengerStatus('Deutschland', 46)).toBe('kein-grenzgaenger')
  })

  it('a CH-Wohnsitz is never a Grenzgänger', () => {
    expect(grenzgaengerStatus('Schweiz', 0)).toBe('kein-grenzgaenger')
  })

  it('rejects a negative or non-integer day count', () => {
    expect(() => grenzgaengerStatus('Deutschland', -1)).toThrow(RangeError)
    expect(() => grenzgaengerStatus('Deutschland', 1.5)).toThrow(RangeError)
  })
})

describe('LOHNAUSWEIS_FELDER — ADR-036 the guided mask (Ziffern 1–15)', () => {
  it('lists 15 Ziffern in paper order', () => {
    expect(LOHNAUSWEIS_FELDER).toHaveLength(15)
    expect(LOHNAUSWEIS_FELDER[0]).toMatchObject({ ziffer: '1', id: 'lohn' })
    expect(LOHNAUSWEIS_FELDER[14]).toMatchObject({ ziffer: '15', id: 'bemerkungen', art: 'freitext' })
  })

  it('marks exactly the ADR-029-relevant fields as postenRelevant', () => {
    const relevant = LOHNAUSWEIS_FELDER.filter((f) => f.postenRelevant).map((f) => f.id)
    expect(relevant).toEqual(['bruttolohn-total', 'berufliche-vorsorge', 'quellensteuer'])
  })
})

describe('offeneLohnausweisFelder — the honest "offen" list', () => {
  it('an echter Grenzgänger needs Bruttolohn, PK and Quellensteuer', () => {
    expect(offeneLohnausweisFelder({}, 'echter-grenzgaenger')).toEqual([
      'bruttolohn-total',
      'berufliche-vorsorge',
      'quellensteuer',
    ])
  })

  it('a CH-Ansässiger needs Bruttolohn and PK but NOT Quellensteuer', () => {
    expect(offeneLohnausweisFelder({}, 'kein-grenzgaenger')).toEqual(['bruttolohn-total', 'berufliche-vorsorge'])
  })

  it('present fields drop out of the open list', () => {
    const werte: LohnausweisWerte = { 'bruttolohn-total': 84000, 'berufliche-vorsorge': 5000, quellensteuer: 3780 }
    expect(offeneLohnausweisFelder(werte, 'echter-grenzgaenger')).toEqual([])
  })
})

describe('chPostenAusLohnausweis — ADR-029 "Lohnausweis Ziffer n × Kurs"', () => {
  const werte: LohnausweisWerte = { 'bruttolohn-total': 84000, 'berufliche-vorsorge': 5000, quellensteuer: 3780 }

  it('maps the present postenRelevant fields to CHF→EUR line items with provenance, in Ziffer order', () => {
    const posten = chPostenAusLohnausweis(werte, KURS)
    expect(posten).toEqual([
      {
        id: 'ch-lohnausweis-bruttolohn-total',
        art: 'Bruttolohn',
        ziffer: '8',
        betragChf: 84000,
        wechselkurs: KURS,
        betragEur: 79060.8, // 84000 × 0.9412
      },
      {
        id: 'ch-lohnausweis-berufliche-vorsorge',
        art: 'Pensionskasse',
        ziffer: '10',
        betragChf: 5000,
        wechselkurs: KURS,
        betragEur: 4706,
      },
      {
        id: 'ch-lohnausweis-quellensteuer',
        art: 'Quellensteuer',
        ziffer: '12',
        betragChf: 3780,
        wechselkurs: KURS,
        betragEur: 3557.74, // 3780 × 0.9412 = 3557.736 → 3557.74
      },
    ])
  })

  it('a required-but-empty field is never fabricated into a zero Posten', () => {
    const posten = chPostenAusLohnausweis({ 'bruttolohn-total': 84000 }, KURS)
    expect(posten.map((p) => p.art)).toEqual(['Bruttolohn'])
  })
})

describe('saeule3aAbzug / krankenkasseAbzug — ADR-029 points 4–5', () => {
  it('Säule 3a is captured and converted, no limit invented here', () => {
    expect(saeule3aAbzug(7000, KURS)).toMatchObject({ id: 'ch-saeule-3a', art: 'Saeule3a', betragChf: 7000, betragEur: 6588.4 })
  })

  it('Krankenkasse is captured and converted', () => {
    expect(krankenkasseAbzug(3000, KURS)).toMatchObject({ id: 'ch-krankenkasse', art: 'Krankenkasse', betragChf: 3000, betragEur: 2823.6 })
  })
})

describe('zulagenVerrechnen — ADR-029 point 6 netting against Kindergeld', () => {
  it('a Zulage above Kindergeld nets to a positive surplus', () => {
    expect(zulagenVerrechnen(3000, 2500)).toBe(500)
  })

  it('a Zulage below Kindergeld nets negative', () => {
    expect(zulagenVerrechnen(2000, 2500)).toBe(-500)
  })

  it('equal amounts net to zero', () => {
    expect(zulagenVerrechnen(2500, 2500)).toBe(0)
  })

  it('rejects negative inputs', () => {
    expect(() => zulagenVerrechnen(-1, 100)).toThrow(RangeError)
  })
})

describe('bruttolohnAlsKernposten — the ONE line that maps onto the core income Posten', () => {
  it('Bruttolohn maps to a Grenzgänger Posten, whole euros', () => {
    const [bruttolohn] = chPostenAusLohnausweis({ 'bruttolohn-total': 84000 }, KURS)
    expect(bruttolohnAlsKernposten(bruttolohn!)).toEqual({
      id: 'ch-lohnausweis-bruttolohn-total',
      einkunftsart: 'Grenzgänger',
      rolle: 'einnahme',
      betrag: 79061, // 79060.8 rounded to whole euros
      quelle: { art: 'beleg', belegId: 'lohnausweis' },
    })
  })

  it('a non-income line (Quellensteuer/PK) returns null — not representable as an income Posten', () => {
    const posten = chPostenAusLohnausweis({ 'berufliche-vorsorge': 5000 }, KURS)
    expect(bruttolohnAlsKernposten(posten[0]!)).toBeNull()
  })
})

describe('chPostenAlsKernposten — ADR-029/0015-Lehre, Vorsorge + Anrechnung folding', () => {
  it('maps PK to a vorsorgeaufwand Posten, Quellensteuer to anrechnung, whole euros', () => {
    const [pk, qst] = chPostenAusLohnausweis({ 'berufliche-vorsorge': 5000, quellensteuer: 3780 }, KURS)
    expect(chPostenAlsKernposten(pk!)).toMatchObject({
      id: 'ch-lohnausweis-berufliche-vorsorge',
      einkunftsart: 'Grenzgänger',
      rolle: 'vorsorgeaufwand',
      betrag: 4706,
      quelle: { art: 'beleg', belegId: 'lohnausweis' },
    })
    expect(chPostenAlsKernposten(qst!)).toMatchObject({
      id: 'ch-lohnausweis-quellensteuer',
      einkunftsart: 'Grenzgänger',
      rolle: 'anrechnung',
      betrag: 3558, // 3557.74 rounded to whole euros
      quelle: { art: 'beleg', belegId: 'lohnausweis' },
    })
  })

  it('maps Säule 3a and Krankenkasse to vorsorgeaufwand with `eingabe` origin', () => {
    expect(chPostenAlsKernposten(saeule3aAbzug(7000, KURS))).toMatchObject({
      rolle: 'vorsorgeaufwand',
      betrag: 6588,
      quelle: { art: 'eingabe' },
    })
    expect(chPostenAlsKernposten(krankenkasseAbzug(3000, KURS))).toMatchObject({
      rolle: 'vorsorgeaufwand',
      betrag: 2824, // 2823.6 rounded
      quelle: { art: 'eingabe' },
    })
  })

  it('AHV (1. Säule) has no role yet — its DBA treatment is open', () => {
    const ahv: Parameters<typeof chPostenAlsKernposten>[0] = {
      id: 'ch-ahv',
      art: 'AHV',
      betragChf: 4000,
      wechselkurs: KURS,
      betragEur: 3764.8,
    }
    expect(chPostenAlsKernposten(ahv)).toBeNull()
  })
})

describe('grenzgaengerStand — ADR-029 fold through the deterministic core', () => {
  const werte: LohnausweisWerte = { 'bruttolohn-total': 84000, 'berufliche-vorsorge': 5000, quellensteuer: 3780 }

  it('folds Bruttolohn→einnahmen, PK→vorsorgeaufwand, Quellensteuer→anrechnung, 3a/KK into vorsorgeaufwand', () => {
    const stand = grenzgaengerStand({
      lohnausweis: werte,
      saeule3aChf: 7000,
      krankenkasseChf: 3000,
      status: 'echter-grenzgaenger',
      wechselkurs: KURS,
      gegated: [],
    })
    expect(stand).toEqual({
      kind: 'bestimmt',
      einnahmen: 79061,
      vorsorgeaufwand: 4706 + 6588 + 2824, // PK + 3a + KK
      anrechnung: 3558,
    })
  })

  it('a required-but-empty field is `offen`, never a fabricated zero (ADR-032 honesty)', () => {
    const stand = grenzgaengerStand({ lohnausweis: { 'bruttolohn-total': 84000 }, status: 'echter-grenzgaenger', wechselkurs: KURS, gegated: [] })
    expect(stand.kind).toBe('offen')
    if (stand.kind === 'offen') {
      expect(stand.offenePosten).toBe(2) // PK + Quellensteuer still open
      expect(stand.vorsorgeaufwand).toBe(0)
      expect(stand.anrechnung).toBe(0)
    }
  })

  it('an absent optional 3a/KK is not folded at all — no zero Posten', () => {
    const stand = grenzgaengerStand({ lohnausweis: werte, status: 'echter-grenzgaenger', wechselkurs: KURS, gegated: [] })
    expect(stand.kind).toBe('bestimmt')
    if (stand.kind === 'bestimmt') expect(stand.vorsorgeaufwand).toBe(4706)
  })

  it('passes gated Einkunftsarten through as an honest blocker', () => {
    const stand = grenzgaengerStand({ lohnausweis: werte, status: 'echter-grenzgaenger', wechselkurs: KURS, gegated: ['Kapital'] })
    expect(stand.kind).toBe('offen')
    if (stand.kind === 'offen') expect(stand.gegated).toEqual(['Kapital'])
  })
})

describe('Lohnausweis-mask persistence encoding — one truth (ADR-0033)', () => {
  it('round-trips offen / unklar / erfasst', () => {
    expect(serialisiereLohnausweisFeld(null)).toBeNull()
    expect(serialisiereLohnausweisFeld('unklar')).toBe('unklar')
    expect(serialisiereLohnausweisFeld(84000)).toBe('84000')
    expect(deserialisiereLohnausweisFeld(null)).toBeNull()
    expect(deserialisiereLohnausweisFeld('unklar')).toBe('unklar')
    expect(deserialisiereLohnausweisFeld('84000')).toBe(84000)
  })

  it('rejects an invalid amount and a corrupt stored value', () => {
    expect(() => serialisiereLohnausweisFeld(-1)).toThrow(RangeError)
    expect(() => serialisiereLohnausweisFeld(1.5)).toThrow(RangeError)
    expect(() => deserialisiereLohnausweisFeld('kaputt')).toThrow(Error)
  })
})
