import { describe, expect, it } from 'vitest'
import {
  generateOwlCards,
  homeOfficeDaysFromInterview,
  LEGAL_STATUS_DATE,
  type OwlInputFacts,
} from './eulen-modus.js'

describe('eulen-modus', () => {
  it('triggers musterluecke for a Fortbildung, without inventing an amount', () => {
    const facts: OwlInputFacts = { taxYear: 2025, hasTraining: true }
    const cards = generateOwlCards(facts)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.trigger).toBe('musterluecke')
    expect(cards[0]!.title).toContain('Fahrtkosten zur Fortbildung')
    expect(cards[0]!.message).toContain('Bist du geflogen?')
    expect(cards[0]!.legalStatusDate).toBe(LEGAL_STATUS_DATE)
    expect(cards[0]!.amountEur).toBeNull()
  })

  it('triggers vorjahresvergleich when previous year had donations but current year has none', () => {
    const facts: OwlInputFacts = {
      taxYear: 2025,
      lastYearFacts: { donationsEur: 350 },
    }
    const cards = generateOwlCards(facts)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.trigger).toBe('vorjahresvergleich')
    expect(cards[0]!.title).toContain('Spenden wie im Vorjahr?')
  })

  it('triggers rechtsaenderung for homeoffice >= 50 EUR directly into Cockpit with safe vs risky path', () => {
    const facts: OwlInputFacts = {
      taxYear: 2025,
      homeOfficeDays: 50, // 50 * 6 = 300 € >= 50 €
    }
    const cards = generateOwlCards(facts)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.trigger).toBe('rechtsaenderung')
    expect(cards[0]!.category).toBe('cockpit_proaktiv')
    expect(cards[0]!.amountEur).toBe(300)
    expect(cards[0]!.paths).toBeDefined()
    expect(cards[0]!.paths![0]!.risk).toBe('sicher')
    expect(cards[0]!.paths![1]!.risk).toBe('risiko')
    expect(cards[0]!.sourceTranslated).toContain('Nr. 6c')
  })

  it('caps the homeoffice amount at 210 days', () => {
    expect(generateOwlCards({ taxYear: 2025, homeOfficeDays: 300 })[0]!.amountEur).toBe(1260)
  })

  it('triggers lebenslage_hinweis when the interview names children that are not recorded yet', () => {
    const cards = generateOwlCards({ taxYear: 2025, childrenPerInterview: true, hasChildrenRecorded: false })
    expect(cards).toHaveLength(1)
    expect(cards[0]!.trigger).toBe('lebenslage_hinweis')
    expect(cards[0]!.reason).toContain('80 %')
    expect(generateOwlCards({ taxYear: 2025, childrenPerInterview: true, hasChildrenRecorded: true })).toEqual([])
  })

  it('triggers archiv_einspruch for past year in appeal window (ADR-042)', () => {
    const facts: OwlInputFacts = {
      taxYear: 2025,
      archiveYears: [
        {
          taxYear: 2024,
          assessmentDate: '2025-09-01',
          appealPossibleUntil: '01.10.2025',
          homeOfficeDays: 66,
        },
      ],
    }
    const cards = generateOwlCards(facts)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.category).toBe('archiv_einspruch')
    expect(cards[0]!.appealDeadline).toBe('01.10.2025')
    expect(cards[0]!.amountEur).toBe(396)
    expect(cards[0]!.sourceId).toBe('ao-355')
  })

  it('suppresses dismissed cards by fingerprint (ADR-041)', () => {
    const facts: OwlInputFacts = { taxYear: 2025, hasTraining: true }
    const firstCards = generateOwlCards(facts)
    expect(firstCards).toHaveLength(1)

    const fp = firstCards[0]!.fingerprint
    const afterDismissal = generateOwlCards({
      ...facts,
      dismissedFingerprints: [fp],
    })
    expect(afterDismissal).toHaveLength(0)
  })

  describe('homeofficeTageAusInterview', () => {
    it('reads the rhythm against the stated working days, capped at 210', () => {
      expect(homeOfficeDaysFromInterview({ homeoffice: '1–2 Tage pro Woche', tage: '200' })).toBe(60)
      expect(homeOfficeDaysFromInterview({ homeoffice: 'Fast immer', tage: '230' })).toBe(210)
      expect(homeOfficeDaysFromInterview({ homeoffice: 'Fast immer' })).toBe(210)
      expect(homeOfficeDaysFromInterview({ homeoffice: 'Nie' })).toBe(0)
    })

    it('is null when the question is unanswered or the value unknown', () => {
      expect(homeOfficeDaysFromInterview({})).toBeNull()
      expect(homeOfficeDaysFromInterview({ homeoffice: '3' })).toBeNull()
    })
  })
})
