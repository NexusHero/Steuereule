import { describe, expect, it } from 'vitest'
import { officialMonthlyRate } from './exchange-rate'
import {
  grossWageAsCoreItem,
  chItemsAsCoreItems,
  chItemsFromSalaryCertificate,
  deserializeSalaryCertificateField,
  crossBorderFold,
  crossBorderStatus,
  healthInsurerDeduction,
  SALARY_CERTIFICATE_FIELDS,
  openSalaryCertificateFields,
  pillar3aDeduction,
  serializeSalaryCertificateField,
  offsetAllowances,
  type SalaryCertificateValues,
} from './cross-border'

// ADR-029/036/013 — the Grenzgänger-CH domain: the 60-Tage rule (Art. 15a Abs. 2 DBA-CH), the guided Lohnausweis
// mask, and the CH line items (CHF→EUR, provenance-carrying, no invented formula).

const RATE = officialMonthlyRate('2026-01', 0.9412)

describe('grenzgaengerStatus — 60-Tage-Regel (Art. 15a Abs. 2 DBA-CH)', () => {
  it('DE-Wohnsitz with ≤ 60 Nichtrückkehrtage is an echter Grenzgänger — 46 to 60 included', () => {
    expect(crossBorderStatus('Deutschland', 0)).toBe('echter-grenzgaenger')
    expect(crossBorderStatus('Deutschland', 46)).toBe('echter-grenzgaenger')
    expect(crossBorderStatus('Deutschland', 60)).toBe('echter-grenzgaenger')
  })

  it('more than 60 Nichtrückkehrtage ends Grenzgänger status', () => {
    expect(crossBorderStatus('Deutschland', 61)).toBe('kein-grenzgaenger')
  })

  it('a CH-Wohnsitz is never a Grenzgänger', () => {
    expect(crossBorderStatus('Schweiz', 0)).toBe('kein-grenzgaenger')
  })

  it('rejects a negative or non-integer day count', () => {
    expect(() => crossBorderStatus('Deutschland', -1)).toThrow(RangeError)
    expect(() => crossBorderStatus('Deutschland', 1.5)).toThrow(RangeError)
  })
})

describe('LOHNAUSWEIS_FELDER — ADR-036 the guided mask (Ziffern 1–15)', () => {
  it('lists 15 Ziffern in paper order', () => {
    expect(SALARY_CERTIFICATE_FIELDS).toHaveLength(15)
    expect(SALARY_CERTIFICATE_FIELDS[0]).toMatchObject({ digit: '1', id: 'lohn' })
    expect(SALARY_CERTIFICATE_FIELDS[14]).toMatchObject({ digit: '15', id: 'bemerkungen', kind: 'freitext' })
  })

  it('marks exactly the ADR-029-relevant fields as postenRelevant', () => {
    const relevant = SALARY_CERTIFICATE_FIELDS.filter((f) => f.itemsRelevant).map((f) => f.id)
    expect(relevant).toEqual(['bruttolohn-total', 'berufliche-vorsorge', 'quellensteuer'])
  })
})

describe('offeneLohnausweisFelder — the honest "offen" list', () => {
  it('an echter Grenzgänger needs Bruttolohn, PK and Quellensteuer', () => {
    expect(openSalaryCertificateFields({}, 'echter-grenzgaenger')).toEqual([
      'bruttolohn-total',
      'berufliche-vorsorge',
      'quellensteuer',
    ])
  })

  it('a CH-Ansässiger needs Bruttolohn and PK but NOT Quellensteuer', () => {
    expect(openSalaryCertificateFields({}, 'kein-grenzgaenger')).toEqual(['bruttolohn-total', 'berufliche-vorsorge'])
  })

  it('present fields drop out of the open list', () => {
    const values: SalaryCertificateValues = { 'bruttolohn-total': 84000, 'berufliche-vorsorge': 5000, quellensteuer: 3780 }
    expect(openSalaryCertificateFields(values, 'echter-grenzgaenger')).toEqual([])
  })
})

describe('chPostenAusLohnausweis — ADR-029 "Lohnausweis Ziffer n × Kurs"', () => {
  const values: SalaryCertificateValues = { 'bruttolohn-total': 84000, 'berufliche-vorsorge': 5000, quellensteuer: 3780 }

  it('maps the present postenRelevant fields to CHF→EUR line items with provenance, in Ziffer order', () => {
    const items = chItemsFromSalaryCertificate(values, RATE)
    expect(items).toEqual([
      {
        id: 'ch-lohnausweis-bruttolohn-total',
        kind: 'Bruttolohn',
        digit: '8',
        amountChf: 84000,
        exchangeRate: RATE,
        amountEur: 79060.8, // 84000 × 0.9412
      },
      {
        id: 'ch-lohnausweis-berufliche-vorsorge',
        kind: 'Pensionskasse',
        digit: '10',
        amountChf: 5000,
        exchangeRate: RATE,
        amountEur: 4706,
      },
      {
        id: 'ch-lohnausweis-quellensteuer',
        kind: 'Quellensteuer',
        digit: '12',
        amountChf: 3780,
        exchangeRate: RATE,
        amountEur: 3557.74, // 3780 × 0.9412 = 3557.736 → 3557.74
      },
    ])
  })

  it('a required-but-empty field is never fabricated into a zero Posten', () => {
    const items = chItemsFromSalaryCertificate({ 'bruttolohn-total': 84000 }, RATE)
    expect(items.map((p) => p.kind)).toEqual(['Bruttolohn'])
  })
})

describe('saeule3aAbzug / krankenkasseAbzug — ADR-029 points 4–5', () => {
  it('Säule 3a is captured and converted, no limit invented here', () => {
    expect(pillar3aDeduction(7000, RATE)).toMatchObject({ id: 'ch-saeule-3a', kind: 'Saeule3a', amountChf: 7000, amountEur: 6588.4 })
  })

  it('Krankenkasse is captured and converted', () => {
    expect(healthInsurerDeduction(3000, RATE)).toMatchObject({ id: 'ch-krankenkasse', kind: 'Krankenkasse', amountChf: 3000, amountEur: 2823.6 })
  })
})

describe('zulagenVerrechnen — ADR-029 point 6 netting against Kindergeld', () => {
  it('a Zulage above Kindergeld nets to a positive surplus', () => {
    expect(offsetAllowances(3000, 2500)).toBe(500)
  })

  it('a Zulage below Kindergeld nets negative', () => {
    expect(offsetAllowances(2000, 2500)).toBe(-500)
  })

  it('equal amounts net to zero', () => {
    expect(offsetAllowances(2500, 2500)).toBe(0)
  })

  it('rejects negative inputs', () => {
    expect(() => offsetAllowances(-1, 100)).toThrow(RangeError)
  })
})

describe('bruttolohnAlsKernposten — the ONE line that maps onto the core income Posten', () => {
  it('Bruttolohn maps to a Grenzgänger Posten, whole euros', () => {
    const [grossWage] = chItemsFromSalaryCertificate({ 'bruttolohn-total': 84000 }, RATE)
    expect(grossWageAsCoreItem(grossWage!)).toEqual({
      id: 'ch-lohnausweis-bruttolohn-total',
      incomeType: 'Grenzgänger',
      role: 'einnahme',
      amount: 79061, // 79060.8 rounded to whole euros
      source: { kind: 'beleg', receiptId: 'lohnausweis' },
    })
  })

  it('a non-income line (Quellensteuer/PK) returns null — not representable as an income Posten', () => {
    const items = chItemsFromSalaryCertificate({ 'berufliche-vorsorge': 5000 }, RATE)
    expect(grossWageAsCoreItem(items[0]!)).toBeNull()
  })
})

describe('chPostenAlsKernposten — ADR-029/0015-Lehre, Vorsorge + Anrechnung folding', () => {
  it('maps PK to a vorsorgeaufwand Posten, Quellensteuer to anrechnung, whole euros', () => {
    const [pk, qst] = chItemsFromSalaryCertificate({ 'berufliche-vorsorge': 5000, quellensteuer: 3780 }, RATE)
    expect(chItemsAsCoreItems(pk!)).toMatchObject({
      id: 'ch-lohnausweis-berufliche-vorsorge',
      incomeType: 'Grenzgänger',
      role: 'vorsorgeaufwand',
      amount: 4706,
      source: { kind: 'beleg', receiptId: 'lohnausweis' },
    })
    expect(chItemsAsCoreItems(qst!)).toMatchObject({
      id: 'ch-lohnausweis-quellensteuer',
      incomeType: 'Grenzgänger',
      role: 'anrechnung',
      amount: 3558, // 3557.74 rounded to whole euros
      source: { kind: 'beleg', receiptId: 'lohnausweis' },
    })
  })

  it('maps Säule 3a and Krankenkasse to vorsorgeaufwand with `eingabe` origin', () => {
    expect(chItemsAsCoreItems(pillar3aDeduction(7000, RATE))).toMatchObject({
      role: 'vorsorgeaufwand',
      amount: 6588,
      source: { kind: 'eingabe' },
    })
    expect(chItemsAsCoreItems(healthInsurerDeduction(3000, RATE))).toMatchObject({
      role: 'vorsorgeaufwand',
      amount: 2824, // 2823.6 rounded
      source: { kind: 'eingabe' },
    })
  })

  it('AHV (1. Säule) has no role yet — its DBA treatment is open', () => {
    const ahv: Parameters<typeof chItemsAsCoreItems>[0] = {
      id: 'ch-ahv',
      kind: 'AHV',
      amountChf: 4000,
      exchangeRate: RATE,
      amountEur: 3764.8,
    }
    expect(chItemsAsCoreItems(ahv)).toBeNull()
  })
})

describe('grenzgaengerStand — ADR-029 fold through the deterministic core', () => {
  const values: SalaryCertificateValues = { 'bruttolohn-total': 84000, 'berufliche-vorsorge': 5000, quellensteuer: 3780 }

  it('folds Bruttolohn→einnahmen, PK→vorsorgeaufwand, Quellensteuer→anrechnung, 3a/KK into vorsorgeaufwand', () => {
    const status = crossBorderFold({
      salaryCertificate: values,
      saeule3aChf: 7000,
      krankenkasseChf: 3000,
      status: 'echter-grenzgaenger',
      exchangeRate: RATE,
      gated: [],
    })
    expect(status).toEqual({
      kind: 'bestimmt',
      einnahmen: 79061,
      vorsorgeaufwand: 4706 + 6588 + 2824, // PK + 3a + KK
      anrechnung: 3558,
    })
  })

  it('a required-but-empty field is `offen`, never a fabricated zero (ADR-032 honesty)', () => {
    const status = crossBorderFold({ salaryCertificate: { 'bruttolohn-total': 84000 }, status: 'echter-grenzgaenger', exchangeRate: RATE, gated: [] })
    expect(status.kind).toBe('offen')
    if (status.kind === 'offen') {
      expect(status.openItems).toBe(2) // PK + Quellensteuer still open
      expect(status.vorsorgeaufwand).toBe(0)
      expect(status.anrechnung).toBe(0)
    }
  })

  it('an absent optional 3a/KK is not folded at all — no zero Posten', () => {
    const status = crossBorderFold({ salaryCertificate: values, status: 'echter-grenzgaenger', exchangeRate: RATE, gated: [] })
    expect(status.kind).toBe('bestimmt')
    if (status.kind === 'bestimmt') expect(status.vorsorgeaufwand).toBe(4706)
  })

  it('passes gated Einkunftsarten through as an honest blocker', () => {
    const status = crossBorderFold({ salaryCertificate: values, status: 'echter-grenzgaenger', exchangeRate: RATE, gated: ['Kapital'] })
    expect(status.kind).toBe('offen')
    if (status.kind === 'offen') expect(status.gated).toEqual(['Kapital'])
  })
})

describe('Lohnausweis-mask persistence encoding — one truth (ADR-0033)', () => {
  it('round-trips offen / unklar / erfasst', () => {
    expect(serializeSalaryCertificateField(null)).toBeNull()
    expect(serializeSalaryCertificateField('unklar')).toBe('unklar')
    expect(serializeSalaryCertificateField(84000)).toBe('84000')
    expect(deserializeSalaryCertificateField(null)).toBeNull()
    expect(deserializeSalaryCertificateField('unklar')).toBe('unklar')
    expect(deserializeSalaryCertificateField('84000')).toBe(84000)
  })

  it('rejects an invalid amount and a corrupt stored value', () => {
    expect(() => serializeSalaryCertificateField(-1)).toThrow(RangeError)
    expect(() => serializeSalaryCertificateField(1.5)).toThrow(RangeError)
    expect(() => deserializeSalaryCertificateField('kaputt')).toThrow(Error)
  })
})
