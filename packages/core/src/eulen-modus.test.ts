import { describe, expect, it } from 'vitest'
import {
  generateOwlCards,
  homeofficeTageAusInterview,
  RECHTSSTAND_DATUM,
  type OwlInputFacts,
} from './eulen-modus.js'

describe('eulen-modus', () => {
  it('triggers musterluecke for a Fortbildung, without inventing an amount', () => {
    const fakten: OwlInputFacts = { steuerjahr: 2025, hatFortbildung: true }
    const karten = generateOwlCards(fakten)
    expect(karten).toHaveLength(1)
    expect(karten[0]!.trigger).toBe('musterluecke')
    expect(karten[0]!.titel).toContain('Fahrtkosten zur Fortbildung')
    expect(karten[0]!.botschaft).toContain('Bist du geflogen?')
    expect(karten[0]!.rechtsstandDatum).toBe(RECHTSSTAND_DATUM)
    expect(karten[0]!.betragEur).toBeNull()
  })

  it('triggers vorjahresvergleich when previous year had donations but current year has none', () => {
    const fakten: OwlInputFacts = {
      steuerjahr: 2025,
      vorjahrFakten: { spendenEur: 350 },
    }
    const karten = generateOwlCards(fakten)
    expect(karten).toHaveLength(1)
    expect(karten[0]!.trigger).toBe('vorjahresvergleich')
    expect(karten[0]!.titel).toContain('Spenden wie im Vorjahr?')
  })

  it('triggers rechtsaenderung for homeoffice >= 50 EUR directly into Cockpit with safe vs risky path', () => {
    const fakten: OwlInputFacts = {
      steuerjahr: 2025,
      homeofficeTage: 50, // 50 * 6 = 300 € >= 50 €
    }
    const karten = generateOwlCards(fakten)
    expect(karten).toHaveLength(1)
    expect(karten[0]!.trigger).toBe('rechtsaenderung')
    expect(karten[0]!.kategorie).toBe('cockpit_proaktiv')
    expect(karten[0]!.betragEur).toBe(300)
    expect(karten[0]!.wege).toBeDefined()
    expect(karten[0]!.wege![0]!.risiko).toBe('sicher')
    expect(karten[0]!.wege![1]!.risiko).toBe('risiko')
    expect(karten[0]!.quelleUebersetzt).toContain('Nr. 6c')
  })

  it('caps the homeoffice amount at 210 days', () => {
    expect(generateOwlCards({ steuerjahr: 2025, homeofficeTage: 300 })[0]!.betragEur).toBe(1260)
  })

  it('triggers lebenslage_hinweis when the interview names children that are not recorded yet', () => {
    const karten = generateOwlCards({ steuerjahr: 2025, kinderLautInterview: true, hatKinderErfasst: false })
    expect(karten).toHaveLength(1)
    expect(karten[0]!.trigger).toBe('lebenslage_hinweis')
    expect(karten[0]!.begruendung).toContain('80 %')
    expect(generateOwlCards({ steuerjahr: 2025, kinderLautInterview: true, hatKinderErfasst: true })).toEqual([])
  })

  it('triggers archiv_einspruch for past year in appeal window (ADR-042)', () => {
    const fakten: OwlInputFacts = {
      steuerjahr: 2025,
      archivJahre: [
        {
          steuerjahr: 2024,
          bescheidDatum: '2025-09-01',
          einspruchMoeglichBis: '01.10.2025',
          homeofficeTage: 66,
        },
      ],
    }
    const karten = generateOwlCards(fakten)
    expect(karten).toHaveLength(1)
    expect(karten[0]!.kategorie).toBe('archiv_einspruch')
    expect(karten[0]!.einspruchFristBis).toBe('01.10.2025')
    expect(karten[0]!.betragEur).toBe(396)
    expect(karten[0]!.quelleId).toBe('ao-355')
  })

  it('suppresses dismissed cards by fingerprint (ADR-041)', () => {
    const fakten: OwlInputFacts = { steuerjahr: 2025, hatFortbildung: true }
    const erstKarten = generateOwlCards(fakten)
    expect(erstKarten).toHaveLength(1)

    const fp = erstKarten[0]!.fingerprint
    const nachVerwurf = generateOwlCards({
      ...fakten,
      verworfeneFingerprints: [fp],
    })
    expect(nachVerwurf).toHaveLength(0)
  })

  describe('homeofficeTageAusInterview', () => {
    it('reads the rhythm against the stated working days, capped at 210', () => {
      expect(homeofficeTageAusInterview({ homeoffice: '1–2 Tage pro Woche', tage: '200' })).toBe(60)
      expect(homeofficeTageAusInterview({ homeoffice: 'Fast immer', tage: '230' })).toBe(210)
      expect(homeofficeTageAusInterview({ homeoffice: 'Fast immer' })).toBe(210)
      expect(homeofficeTageAusInterview({ homeoffice: 'Nie' })).toBe(0)
    })

    it('is null when the question is unanswered or the value unknown', () => {
      expect(homeofficeTageAusInterview({})).toBeNull()
      expect(homeofficeTageAusInterview({ homeoffice: '3' })).toBeNull()
    })
  })
})
