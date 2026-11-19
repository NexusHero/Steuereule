import { describe, expect, it } from 'vitest'
import { recurringFactsOf, recurringItems, type RecurringSourceFacts } from './recurring-items'

// ADR-0099 §2 — „Kommt jedes Jahr wieder“: the items of the last two years as a checklist for the open
// year, last year's amount as a hint, never as a pre-filled value.

const empty: RecurringSourceFacts = { answers: {}, commute: null, children: [], churchTax: null, capitalIncome: null, rentalIncome: null, pensionAmount: null }

describe('recurringFactsOf', () => {
  it('reads the amounts of answers, masks and children', () => {
    const facts = recurringFactsOf({
      ...empty,
      answers: { spenden: 'Ja', 'spenden-betrag': '3135', 'haushalt-gate': 'Ja', 'haushalt-handwerker-betrag': '640', 'gesundheit-gate': 'Nein' },
      commute: { oneWayKm: 67, travelDays: 226, homeOfficeDays: 0, workEquipmentEur: null, accountFeesEur: 32, professionalBodiesEur: null },
      children: [{ childcareEur: 591, healthBasicEur: 964 }],
      churchTax: 410,
    })
    expect(facts).toEqual({
      spenden: { amount: 3135 },
      handwerker: { amount: 640 },
      arbeitsweg: { amount: null, km: 67, days: 226 },
      kontofuehrung: { amount: 32 },
      kinderbetreuung: { amount: 591 },
      'krankenkasse-kind': { amount: 964 },
      kirchensteuer: { amount: 410 },
    })
  })

  it('counts a „Ja“ without an amount as present, a „Nein“ not at all', () => {
    expect(recurringFactsOf({ ...empty, answers: { spenden: 'Ja', 'gesundheit-gate': 'Nein' } })).toEqual({ spenden: { amount: null } })
  })
})

describe('recurringItems', () => {
  const facts = new Map([
    [2024, { handwerker: { amount: 410 }, spenden: { amount: 2_800 } }],
    [2025, { kontofuehrung: { amount: 32 }, spenden: { amount: 3_135 }, kinderbetreuung: { amount: 591 }, arbeitsweg: { amount: null, km: 67, days: 226 } }],
    [2026, { kontofuehrung: { amount: 32 }, arbeitsweg: { amount: null, km: 67, days: 110 } }],
  ])

  it('lists what came up in either of the last two years, with the latest amount as a hint', () => {
    const list = recurringItems({ year: 2026, facts, receiptDrafts: [], cuts: [] })
    expect(list.items.map((i) => [i.id, i.lastYear, i.lastAmount, i.status])).toEqual([
      ['arbeitsweg', 2025, null, 'erledigt'],
      ['kontofuehrung', 2025, 32, 'erledigt'],
      ['spenden', 2025, 3_135, 'offen'],
      ['kinderbetreuung', 2025, 591, 'offen'],
      ['handwerker', 2024, 410, 'offen'],
    ])
    expect(list).toMatchObject({ year: 2026, done: 2, open: 3 })
    expect(list.items[0]).toMatchObject({ lastDetail: { km: 67, days: 226 }, currentDetail: { km: 67, days: 110 } })
  })

  it('never pre-fills: an item the open year lacks carries no amount of its own', () => {
    const list = recurringItems({ year: 2026, facts, receiptDrafts: [], cuts: [] })
    for (const item of list.items.filter((i) => i.status === 'offen')) {
      expect(item.currentAmount).toBeNull()
      expect(item.currentDetail).toBeNull()
    }
  })

  it('leaves out what is older than two years', () => {
    const list = recurringItems({ year: 2027, facts, receiptDrafts: [], cuts: [] })
    expect(list.items.map((i) => i.id)).not.toContain('handwerker')
  })

  it('shows what the open year’s receipts did for an item (ADR-0097)', () => {
    const list = recurringItems({
      year: 2026,
      facts,
      receiptDrafts: [
        { screen: 'interview', field: 'spenden-betrag', status: 'pending' },
        { screen: 'kind', field: 'childcareEur', status: 'applied' },
      ],
      cuts: [],
    })
    expect(list.items.find((i) => i.id === 'spenden')!.receipt).toBe('vorschlag')
    expect(list.items.find((i) => i.id === 'kinderbetreuung')!.receipt).toBe('uebernommen')
    expect(list.items.find((i) => i.id === 'handwerker')!.receipt).toBeNull()
  })

  it('marks an item whose Bescheid position was cut in earlier years', () => {
    const list = recurringItems({ year: 2026, facts, receiptDrafts: [], cuts: [{ type: 'sonderausgaben', year: 2023 }, { type: 'sonderausgaben', year: 2024 }] })
    expect(list.items.find((i) => i.id === 'spenden')!.cutInYears).toEqual([2023, 2024])
  })
})
