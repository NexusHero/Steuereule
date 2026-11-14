import { describe, expect, it } from 'vitest'
import { insuredMember, looksLikeChHealthStatement, parseChHealthStatement } from './ch-health-statement'
import { classifyDocumentKind } from './document-kind'

// Invented statements in the two layouts Swiss insurers print (ADR-0080), with OCR's lost umlauts.
const PER_PERSON = [
  'Helsana Versicherungen AG',
  'Auszug fur die Steuererklarung 2025',
  'Mia Beispiel, 01.02.1990, Versicherten Nr. 100 000 001',
  'Krankheits- und Unfallkosten Betrag',
  'Total selbstgetragene Krankheits- und Unfallkosten 120.50',
  'Versicherungszeitraum Versicherungspramien Betrag',
  '01.01.2025 - 30.06.2025 Pramie Grundversicherung (KVG) 2\'001.00',
  'Total Versicherungspramien 2\'001.00',
  'Total Krankheits- und Unfallkosten sowie Versicherungspramien CHF 2\'121.50',
].join('\n')

const FAMILY = [
  'SWICA GESUNDHEITSORGANISATION',
  'ZUSAMMENSTELLUNG FÜR IHRE STEUERERKLÄRUNG 2025',
  'FAMILIENÜBERSICHT DER KOSTENZUSAMMENSTELLUNG FÜR 2025',
  'Max Beispiel                0.00              1\'400.00',
  'Total ganze Familie         0.00              1\'750.00',
  'MAX BEISPIEL',
  'VERSICHERTEN-NR. 1000001',
  'KOSTENZUSAMMENSTELLUNG FÜR 2025',
  'Prämien Grundversicherung/Prämienverbilligung                    1\'400.00               0.00         1\'400.00',
  'Total Ihres Kostenanteils für 2025                                                                       0.00',
  'Prämientotal 2025                                                                                    1\'400.00',
  'LINA BEISPIEL',
  'VERSICHERTEN-NR. 1000002',
  'KOSTENZUSAMMENSTELLUNG FÜR 2025',
  'Prämien Grundversicherung/Prämienverbilligung                      350.00               0.00           350.00',
  'Total Ihres Kostenanteils für 2025                                                                      15.00',
  'Prämientotal 2025                                                                                      350.00',
].join('\n')

describe('parseChHealthStatement', () => {
  it('reads one person’s statement with period and own costs', () => {
    expect(looksLikeChHealthStatement(PER_PERSON)).toBe(true)
    expect(parseChHealthStatement(PER_PERSON)).toEqual({
      insurer: 'helsana',
      taxYear: 2025,
      insured: [{ name: 'Mia Beispiel', insuredNo: '100000001', premiumCents: 200100, selfBorneCents: 12050, period: '01.01.2025 - 30.06.2025' }],
    })
  })

  it('reads every person of a family statement', () => {
    const read = parseChHealthStatement(FAMILY)
    expect(read.insurer).toBe('swica')
    expect(read.insured.map((p) => [p.name, p.premiumCents, p.selfBorneCents])).toEqual([
      ['MAX BEISPIEL', 140000, 0],
      ['LINA BEISPIEL', 35000, 1500],
    ])
  })

  it('is not fooled by a premium letter of the employer', () => {
    expect(looksLikeChHealthStatement('Krankentaggeldversicherung Prämie 2025 Arbeitgeber 50 %')).toBe(false)
  })
})

describe('insuredMember', () => {
  const household = [
    { key: 'A', firstName: 'Max', lastName: 'Beispiel' },
    { key: 'B', firstName: 'Lina', lastName: 'Beispiel' },
    { key: 'child-1', firstName: 'Max Paul', lastName: 'Beispiel' },
  ]
  it('finds the person by first and last name, also in capitals and without umlauts', () => {
    expect(insuredMember('LINA BEISPIEL', household)).toBe('B')
    expect(insuredMember('Jürgen Muster', [{ key: 'A', firstName: 'Juergen', lastName: 'Muster' }])).toBe('A')
  })
  it('prefers the child who carries a parent’s first name as well', () => {
    expect(insuredMember('Max Paul Beispiel', household)).toBe('child-1')
    expect(insuredMember('Max Beispiel', household)).toBe('A')
  })
  it('leaves a stranger open', () => {
    expect(insuredMember('Eva Fremd', household)).toBeNull()
  })
  it('routes the statement to its reader', () => {
    expect(classifyDocumentKind(PER_PERSON)).toBe('chKrankenkasse')
    expect(classifyDocumentKind(FAMILY)).toBe('chKrankenkasse')
  })
})
