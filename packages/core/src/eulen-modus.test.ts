import { describe, expect, it } from 'vitest'
import {
  generiereEulenKarten,
  RECHTSSTAND_DATUM,
  type EulenEingabeFakten,
} from './eulen-modus.js'

describe('eulen-modus', () => {
  it('triggers musterluecke when training costs exist without travel costs', () => {
    const fakten: EulenEingabeFakten = {
      steuerjahr: 2025,
      fortbildungskostenEur: 600,
      fahrtkostenEur: 0,
    }
    const karten = generiereEulenKarten(fakten)
    expect(karten).toHaveLength(1)
    expect(karten[0]!.trigger).toBe('musterluecke')
    expect(karten[0]!.titel).toContain('Fahrtkosten zur Fortbildung')
    expect(karten[0]!.botschaft).toContain('Bist du geflogen?')
    expect(karten[0]!.rechtsstandDatum).toBe(RECHTSSTAND_DATUM)
  })

  it('triggers vorjahresvergleich when previous year had donations but current year has none', () => {
    const fakten: EulenEingabeFakten = {
      steuerjahr: 2025,
      vorjahrFakten: { spendenEur: 350 },
    }
    const karten = generiereEulenKarten(fakten)
    expect(karten).toHaveLength(1)
    expect(karten[0]!.trigger).toBe('vorjahresvergleich')
    expect(karten[0]!.titel).toContain('Spenden wie im Vorjahr?')
  })

  it('triggers rechtsaenderung for homeoffice >= 50 EUR directly into Cockpit with safe vs risky path', () => {
    const fakten: EulenEingabeFakten = {
      steuerjahr: 2025,
      homeofficeTage: 50, // 50 * 6 = 300 € >= 50 €
    }
    const karten = generiereEulenKarten(fakten)
    expect(karten).toHaveLength(1)
    expect(karten[0]!.trigger).toBe('rechtsaenderung')
    expect(karten[0]!.kategorie).toBe('cockpit_proaktiv')
    expect(karten[0]!.betragEur).toBe(300)
    expect(karten[0]!.wege).toBeDefined()
    expect(karten[0]!.wege![0]!.risiko).toBe('sicher')
    expect(karten[0]!.wege![1]!.risiko).toBe('risiko')
  })

  it('triggers lebenslage_hinweis when receipt hints at missing life situation', () => {
    const fakten: EulenEingabeFakten = {
      steuerjahr: 2025,
      bekannteBelegeArten: ['kita_rechnung'],
      hatKinderErfasst: false,
    }
    const karten = generiereEulenKarten(fakten)
    expect(karten).toHaveLength(1)
    expect(karten[0]!.trigger).toBe('lebenslage_hinweis')
    expect(karten[0]!.titel).toContain('Kinderbetreuungskosten')
  })

  it('triggers archiv_einspruch for past year in appeal window (ADR-042)', () => {
    const fakten: EulenEingabeFakten = {
      steuerjahr: 2025,
      archivJahre: [
        {
          steuerjahr: 2024,
          bescheidDatum: '2025-09-01',
          einspruchMoeglichBis: '01.10.2025',
          hatHomeofficeOhnePauschale: true,
        },
      ],
    }
    const karten = generiereEulenKarten(fakten)
    expect(karten).toHaveLength(1)
    expect(karten[0]!.kategorie).toBe('archiv_einspruch')
    expect(karten[0]!.einspruchFristBis).toBe('01.10.2025')
  })

  it('suppresses dismissed cards by fingerprint (ADR-041)', () => {
    const fakten: EulenEingabeFakten = {
      steuerjahr: 2025,
      fortbildungskostenEur: 600,
      fahrtkostenEur: 0,
    }
    const erstKarten = generiereEulenKarten(fakten)
    expect(erstKarten).toHaveLength(1)

    const fp = erstKarten[0]!.fingerprint
    const nachVerwurf = generiereEulenKarten({
      ...fakten,
      verworfeneFingerprints: [fp],
    })
    expect(nachVerwurf).toHaveLength(0)
  })
})
