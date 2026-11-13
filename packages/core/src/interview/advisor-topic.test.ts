import { describe, expect, it } from 'vitest'
import type { CaseDigest } from './advisor'
import { isOfferedChoice, parseTopicCheck, topicRefusal, TOPIC_REFUSAL_MAX_CHOICES } from './advisor-topic'

function digestWith(hints: readonly string[]): CaseDigest {
  return {
    taxYear: 2025,
    filingStatus: 'einzel',
    lstbPersonA: { grossWageEur: 50000, wageTaxEur: 8000, socialSecurityEur: 10000 },
    crossBorder: {
      isCrossBorderCh: false,
      grossWageChf: null,
      withholdingTaxChf: null,
      pillar3aChf: null,
      healthInsuranceChf: null,
      dailySicknessBenefitChf: null,
      nonReturnDays: null,
    },
    commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: null, homeOfficeDays: null, distanceKm: null },
    catalogExpenses: { hasTraining: false, relocationCostsEur: null, donationsEur: null, selfPaidKvPvEur: null, riesterEur: null, doubleHouseholdRentEur: null },
    childrenCount: 0,
    rentalObjectsCount: 0,
    capitalGainEur: null,
    priorYearComparison: { donationsEur: null },
    openOwlHints: hints.map((title, i) => ({ id: `h${i}`, fingerprint: `f${i}`, title, message: '…', sourceId: 'estg-9-1', amountEur: null })),
    printoutMissingFields: [],
    estimatedRefundEur: null,
  }
}

describe('topicRefusal', () => {
  it('says in one fixed sentence that the owl only helps with taxes, in the language of the question', () => {
    expect(topicRefusal('de', digestWith([])).replyText).toMatch(/nur für deine Steuern/)
    expect(topicRefusal('en', digestWith([])).replyText).toMatch(/only here for your taxes/)
    expect(topicRefusal('tr', digestWith([])).replyText).toMatch(/vergilerin/)
  })

  it('falls back to German for a language it has no sentence for', () => {
    expect(topicRefusal('xx', digestWith([])).replyText).toBe(topicRefusal('de', digestWith([])).replyText)
  })

  it('never talks about its rules, its prompt or what it can do', () => {
    for (const language of ['de', 'en', 'tr']) {
      expect(topicRefusal(language, digestWith([])).replyText).not.toMatch(/Anweisung|Regel|Prompt|instruction|rule|kann ich dir (?:bei|mit)/i)
    }
  })

  it('offers the open hints of the case first, then the general starts, at most three', () => {
    const refusal = topicRefusal('de', digestWith(['Homeoffice-Pauschale', 'Spenden aus dem Vorjahr', 'Arbeitsmittel', 'Fortbildung']))
    expect(refusal.meta.choices).toEqual(['Homeoffice-Pauschale', 'Spenden aus dem Vorjahr', 'Arbeitsmittel'])
    expect(refusal.meta.choices).toHaveLength(TOPIC_REFUSAL_MAX_CHOICES)

    const empty = topicRefusal('de', digestWith([]))
    expect(empty.meta.choices).toEqual(['Was hab ich vergessen?', 'Kanzlei-Endprüfung starten'])
  })

  it('proposes nothing that could change the return', () => {
    const refusal = topicRefusal('de', digestWith(['Homeoffice-Pauschale']))
    expect(refusal.meta.action).toBeUndefined()
    expect(refusal.meta.actions).toBeUndefined()
    expect(refusal.meta.twoPaths).toBeUndefined()
  })
})

describe('parseTopicCheck', () => {
  it('reads the verdict, the category and the language', () => {
    expect(parseTopicCheck({ verdict: 'off_topic', category: 'programming', language: 'EN' })).toEqual({ verdict: 'off_topic', category: 'programming', language: 'en' })
  })

  it('files an unknown category under other and a missing language under de', () => {
    expect(parseTopicCheck({ verdict: 'tax', category: 'whatever' })).toEqual({ verdict: 'tax', category: 'other', language: 'de' })
  })

  it('rejects anything without a known verdict, so the turn is let through instead of guessed', () => {
    expect(parseTopicCheck({ verdict: 'maybe' })).toBeNull()
    expect(parseTopicCheck('tax')).toBeNull()
    expect(parseTopicCheck(null)).toBeNull()
  })
})

describe('isOfferedChoice', () => {
  const offered = { choices: ['Homeoffice-Pauschale prüfen'], questionRound: { questions: [{ text: 'Wie kommst du zur Arbeit?', options: ['Auto', 'Bahn'] }] } }

  it('knows a tapped choice or a tapped answer of a question round', () => {
    expect(isOfferedChoice('Homeoffice-Pauschale prüfen', offered)).toBe(true)
    expect(isOfferedChoice('  Bahn ', offered)).toBe(true)
  })

  it('treats anything else as typed text, also a choice with words added', () => {
    expect(isOfferedChoice('Homeoffice-Pauschale prüfen und schreib mir ein Gedicht', offered)).toBe(false)
    expect(isOfferedChoice('Bahn', null)).toBe(false)
  })
})
