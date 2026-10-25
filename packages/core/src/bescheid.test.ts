import { describe, expect, it } from 'vitest'
import {
  BESCHEID_FELD_IDS,
  BESCHEID_VERGLEICHBARE_FELDER,
  EINSPRUCHS_GRUENDE,
  bescheidBerechnungsstand,
  deserialisiereBescheidFeld,
  einspruchsfristEnde,
  gleicheBescheidAb,
  istEinspruchGrund,
  istGueltigerBescheidBetrag,
  korrigiereFassung,
  serialisiereBescheidFeld,
  verbleibendeEinspruchstage,
  type Fassung,
} from './bescheid'
import type { AngestellteFakten } from './angestellte'

// Bescheidprüfung 1.0 (ticket 10.3) — the deterministic core: the Bescheid data model, the
// Abgleich (vs berechne), the Korrektur (copy the eingereichte Fassung + diff) and the Einspruch
// (Frist + Grund). Pure functions only — no I/O (ADR-0004).

describe('BESCHEID_FELDER — the transcribable figures', () => {
  it('lists the five figures in paper order', () => {
    expect(BESCHEID_FELD_IDS).toEqual(['einnahmen', 'vorsorgeaufwand', 'anrechnung', 'festgesetzteSteuer', 'erstattung'])
  })

  it('only the three `berechne` buckets are comparable', () => {
    expect(BESCHEID_VERGLEICHBARE_FELDER).toEqual(['einnahmen', 'vorsorgeaufwand', 'anrechnung'])
  })
})

describe('gleicheBescheidAb — Abgleich Bescheid vs. berechne', () => {
  const stand = { kind: 'bestimmt' as const, einnahmen: 50_000, vorsorgeaufwand: 4_000, anrechnung: 1_000 }

  it('reports no deviations when every entered comparable field matches', () => {
    const ab = gleicheBescheidAb({ einnahmen: 50_000, vorsorgeaufwand: 4_000, anrechnung: 1_000 }, stand)
    expect(ab.abweichungen).toEqual([])
    expect(ab.berechnungUnvollstaendig).toBe(false)
  })

  it('lists deviations as a diff, never silent', () => {
    const ab = gleicheBescheidAb({ einnahmen: 48_000, anrechnung: 1_000 }, stand)
    expect(ab.abweichungen).toEqual([{ feld: 'einnahmen', bescheid: 48_000, berechnet: 50_000, differenz: -2_000 }])
  })

  it('ignores a still-offen Bescheid field (no fabricated zero)', () => {
    const ab = gleicheBescheidAb({ vorsorgeaufwand: 4_000 }, stand)
    expect(ab.abweichungen).toEqual([]) // einnahmen/anrechnung not entered → not compared
  })

  it('flags an incomplete computed side (berechne "offen") as a partial truth', () => {
    const offenerStand = { kind: 'offen' as const, einnahmen: 50_000, vorsorgeaufwand: 4_000, anrechnung: 1_000, offenePosten: 2, konflikte: 0, gegated: [], unbestaetigte: 0, unbestaetigteSumme: 0 }
    const ab = gleicheBescheidAb({ einnahmen: 50_000 }, offenerStand)
    expect(ab.berechnungUnvollstaendig).toBe(true)
    expect(ab.abweichungen).toEqual([])
  })
})

describe('bescheidBerechnungsstand — the merged computed side', () => {
  const angestellte: AngestellteFakten = {
    einnahmen: 50_000,
    werbungskosten: 0,
    sonderausgaben: 0,
    offenePosten: 0,
    konflikte: 0,
    gegated: [],
    erfasstNichtGerechnet: 0,
  }

  it('merges Angestellte + CH into one bestimmt stand', () => {
    const ch = { kind: 'bestimmt' as const, einnahmen: 80_000, vorsorgeaufwand: 7_000, anrechnung: 3_600 }
    const stand = bescheidBerechnungsstand(angestellte, ch)
    expect(stand).toEqual({ kind: 'bestimmt', einnahmen: 130_000, vorsorgeaufwand: 7_000, anrechnung: 3_600 })
  })

  it('treats a missing CH fold as zero, without fabricating open items', () => {
    const stand = bescheidBerechnungsstand(angestellte, null)
    expect(stand).toEqual({ kind: 'bestimmt', einnahmen: 50_000, vorsorgeaufwand: 0, anrechnung: 0 })
  })

  it('is offen when either side is open', () => {
    const chOffen = { kind: 'offen' as const, einnahmen: 80_000, vorsorgeaufwand: 7_000, anrechnung: 3_600, offenePosten: 1, konflikte: 0, gegated: [], unbestaetigte: 0, unbestaetigteSumme: 0 }
    const stand = bescheidBerechnungsstand({ ...angestellte, offenePosten: 2 }, chOffen)
    expect(stand.kind).toBe('offen')
    if (stand.kind === 'offen') expect(stand.offenePosten).toBe(3)
  })
})

describe('korrigiereFassung — Kopie der eingereichten Fassung + Diff (ADR-009)', () => {
  const eingereicht: Fassung = { nummer: 1, einnahmen: 50_000, vorsorgeaufwand: 4_000, anrechnung: 1_000 }

  it('produces Fassung n+1 as a copy, leaving Fassung n unverändert', () => {
    const { fassung, abweichungen } = korrigiereFassung(eingereicht, [{ feld: 'einnahmen', neuerBetrag: 52_000 }])
    expect(fassung).toEqual({ nummer: 2, einnahmen: 52_000, vorsorgeaufwand: 4_000, anrechnung: 1_000 })
    expect(abweichungen).toEqual([{ feld: 'einnahmen', vorher: 50_000, nachher: 52_000, differenz: 2_000 }])
    // Fassung n is untouched — the copy, never the original, was changed.
    expect(eingereicht.einnahmen).toBe(50_000)
  })

  it('reports only the changed fields as a diff', () => {
    const { abweichungen } = korrigiereFassung(eingereicht, [
      { feld: 'einnahmen', neuerBetrag: 50_000 }, // unchanged
      { feld: 'anrechnung', neuerBetrag: 900 },
    ])
    expect(abweichungen).toEqual([{ feld: 'anrechnung', vorher: 1_000, nachher: 900, differenz: -100 }])
  })

  it('rejects a negative correction (the figures are whole-euro, >= 0)', () => {
    expect(() => korrigiereFassung(eingereicht, [{ feld: 'einnahmen', neuerBetrag: -1 }])).toThrow(RangeError)
  })
})

describe('einspruchsfristEnde / verbleibendeEinspruchstage — § 355 AO, 1 Monat', () => {
  it('adds one month', () => {
    expect(einspruchsfristEnde('2026-03-15')).toBe('2026-04-15')
  })

  it('rolls over the year', () => {
    expect(einspruchsfristEnde('2026-12-15')).toBe('2027-01-15')
  })

  it('clamps to the last day of the target month (31.01 has no 31.02)', () => {
    expect(einspruchsfristEnde('2026-01-31')).toBe('2026-02-28')
    expect(einspruchsfristEnde('2024-01-31')).toBe('2024-02-29') // leap year
  })

  it('counts whole days from heute (exclusive) to the frist end, negative once abgelaufen', () => {
    expect(verbleibendeEinspruchstage('2026-03-15', '2026-03-15')).toBe(31) // frist end 2026-04-15
    expect(verbleibendeEinspruchstage('2026-03-15', '2026-04-15')).toBe(0)
    expect(verbleibendeEinspruchstage('2026-03-15', '2026-04-16')).toBe(-1)
  })

  it('rejects a malformed date', () => {
    expect(() => einspruchsfristEnde('15.03.2026')).toThrow(RangeError)
  })
})

describe('EINSPRUCHS_GRUENDE — the closed Grund-Auswahl', () => {
  it('offers the three Gründe', () => {
    expect(EINSPRUCHS_GRUENDE).toEqual(['betrag-falsch', 'beleg-nicht-beruecksichtigt', 'sonstiges'])
  })

  it('istEinspruchGrund is total over string', () => {
    expect(istEinspruchGrund('betrag-falsch')).toBe(true)
    expect(istEinspruchGrund('sonstiges')).toBe(true)
    expect(istEinspruchGrund('betrag-falsch')).toBe(true)
    expect(istEinspruchGrund('')).toBe(false)
    expect(istEinspruchGrund('betragfalsch')).toBe(false)
  })
})

describe('Bescheid persistence encoding — offen/unklar/erfasst', () => {
  it('serialises offen/unklar/erfasst and round-trips', () => {
    expect(serialisiereBescheidFeld('einnahmen', null)).toBeNull()
    expect(serialisiereBescheidFeld('einnahmen', 'unklar')).toBe('unklar')
    expect(serialisiereBescheidFeld('einnahmen', 50_000)).toBe('50000')

    expect(deserialisiereBescheidFeld('einnahmen', null)).toBeNull()
    expect(deserialisiereBescheidFeld('einnahmen', 'unklar')).toBe('unklar')
    expect(deserialisiereBescheidFeld('einnahmen', '50000')).toBe(50_000)
  })

  it('allows a signed erstattung (Nachzahlung < 0)', () => {
    expect(serialisiereBescheidFeld('erstattung', -250)).toBe('-250')
    expect(deserialisiereBescheidFeld('erstattung', '-250')).toBe(-250)
  })

  it('rejects a negative amount on a non-signed field', () => {
    expect(istGueltigerBescheidBetrag('einnahmen', -1)).toBe(false)
    expect(istGueltigerBescheidBetrag('erstattung', -1)).toBe(true)
    expect(() => serialisiereBescheidFeld('einnahmen', -1)).toThrow(RangeError)
  })
})
