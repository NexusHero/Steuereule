// The pure steps the document parse strategies were split into, each without the services around them.
import { parseChSalaryCertificateText, parseLstbTextDeterministically, type CraftsmanInvoiceRead } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { assessmentDraftFields } from '../src/assessment-scan/assessment-notice.parse-strategy.js'
import { eInvoiceNotes } from '../src/business/business-receipt.parse-strategy.js'
import { certificateFieldDtos } from '../src/ch-certificate-scan/ch-certificate-scan.parse-strategy.js'
import { selfBorneDrafts } from '../src/ch-certificate-scan/ch-health-statement.parse-strategy.js'
import { lstbFieldDtos, lstbSummary, readLstbDeterministically, textFallbackOf } from '../src/lstb-scan/lstb-scan.parse-strategy.js'
import type { ParseReceiptDto, ParsedReceiptDataDto } from '../src/receipt/dto/parse-receipt.dto.js'
import {
  STAGE1_EXTRACTION_SCHEMA,
  applyCraftsmanInvoice,
  childcareSummary,
  extractDeterministically,
  extractEuroAmount,
  parseGermanOrIsoDate,
  repeatedDonationsNote,
  sanitizeExtractedTarget,
} from '../src/receipt/parse/auto-receipt-steps.js'

const dto = (rawText: string, overrides: Partial<ParseReceiptDto> = {}): ParseReceiptDto => ({ fileName: 'beleg.pdf', taxYear: 2025, rawText, ...overrides }) as ParseReceiptDto

describe('auto receipt: deterministic pre-extraction', () => {
  it('reads German and ISO dates', () => {
    expect(parseGermanOrIsoDate('Datum: 14.03.2025')).toBe('2025-03-14')
    expect(parseGermanOrIsoDate('2024-12-01 Quittung')).toBe('2024-12-01')
    expect(parseGermanOrIsoDate('ohne Datum')).toBeNull()
  })

  it('prefers the amount of the total line over single items', () => {
    expect(extractEuroAmount('Versand 4,90 EUR\nGesamtbetrag 1.700,00 EUR')).toBe(1700)
    expect(extractEuroAmount('640 EUR')).toBe(640)
    expect(extractEuroAmount('kein Betrag')).toBeNull()
  })

  it('proposes a donation amount for the Sonderausgaben', () => {
    const parsed = extractDeterministically(dto('Zuwendungsbestätigung DRK 15.05.2025 Betrag 150,00 EUR'))
    expect(parsed).toMatchObject({ vendorCategory: 'spende', suggestedScreen: 'interview', suggestedField: 'spenden-betrag', suggestedValue: '150', taxYear: 2025 })
  })

  it('files work tools under Arbeitsmittel, not training (ADR-0076)', () => {
    const parsed = extractDeterministically(dto('Rechnung Monitor 299,00 EUR'))
    expect(parsed).toMatchObject({ vendorCategory: 'arbeitsmittel', suggestedScreen: 'commute', suggestedField: 'workEquipmentEur', suggestedValue: '299' })
  })
})

describe('auto receipt: sanitising the model reading', () => {
  const raw = (fields: Record<string, unknown>) => STAGE1_EXTRACTION_SCHEMA.parse(fields)

  it('blocks a target that holds personal data', () => {
    const { parsed, securityBlocked } = sanitizeExtractedTarget(raw({ suggestedScreen: 'profil', suggestedField: 'iban', suggestedValue: 'DE00' }), [])
    expect(securityBlocked).toBe(true)
    expect(parsed.suggestedField).toBeNull()
    expect(parsed.summary).toContain('blockiert')
  })

  it('drops an unknown field but keeps a donation in its place', () => {
    const { parsed, securityBlocked } = sanitizeExtractedTarget(raw({ vendorCategory: 'spende', amountEur: 80.4, suggestedScreen: 'interview', suggestedField: 'spende-x' }), [])
    expect(securityBlocked).toBe(false)
    expect(parsed).toMatchObject({ suggestedScreen: 'interview', suggestedField: 'spenden-betrag', suggestedValue: '80', amountEur: 80 })
  })

  it('rounds a decimal value to whole euros and scrubs names from the summary', () => {
    const { parsed } = sanitizeExtractedTarget(raw({ suggestedScreen: 'interview', suggestedField: 'umzug-kosten', suggestedValue: '45678,90', summary: 'Umzug von Erika' }), ['Erika'])
    expect(parsed.suggestedValue).toBe('45679')
    expect(parsed.summary).not.toContain('Erika')
  })
})

describe('auto receipt: fixed rules', () => {
  const base: ParsedReceiptDataDto = { vendorCategory: 'sonstiges', receiptDate: null, amountEur: 10, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary: 'Beleg.', taxYear: 2025 }
  const invoice = (overrides: Partial<CraftsmanInvoiceRead>): CraftsmanInvoiceRead => ({
    labourEur: 400,
    invoiceTotalEur: 1000,
    source: 'stated',
    vatRate: 0.19,
    labourPositions: [],
    taxYear: 2024,
    subsidyHint: false,
    notAnInvoice: false,
    ...overrides,
  })

  it('proposes the labour share of a craftsman invoice', () => {
    expect(applyCraftsmanInvoice(base, invoice({}))).toMatchObject({ vendorCategory: 'handwerker', amountEur: 1000, suggestedField: 'haushalt-handwerker-betrag', suggestedValue: '400', taxYear: 2024 })
  })

  it('proposes nothing for an order confirmation', () => {
    const parsed = applyCraftsmanInvoice(base, invoice({ notAnInvoice: true }))
    expect(parsed.suggestedField).toBeNull()
    expect(parsed.summary).toContain('Auftragsbestätigung')
  })

  it('says which donations were counted already', () => {
    expect(repeatedDonationsNote(2, 0, false, 50)).toBe('')
    expect(repeatedDonationsNote(0, 1, true, 0)).toContain('Zweitschrift')
    expect(repeatedDonationsNote(0, 2, false, 0)).toContain('schon über eine andere Bestätigung gezählt')
    expect(repeatedDonationsNote(1, 2, false, 50)).toMatch(/^2 Spenden darauf sind .* nur 50/)
  })

  it('names the paid amount of a childcare statement only when it states one', () => {
    const period = { from: '2025-01-01', to: '2025-12-31' }
    expect(childcareSummary(period, 2025, null)).toContain('nennt nur den Monatsbeitrag')
    expect(childcareSummary(period, 2025, 2400)).toContain('80 %')
  })
})

const LSTB_TEXT = [
  'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025',
  '3. Bruttoarbeitslohn einschl. Sachbezüge ohne 9. und 10.   54.320,00',
  '4. Einbehaltene Lohnsteuer von 3.                         9.840,50',
].join('\n')

describe('LStB steps', () => {
  it('caps an OCR read to be checked; a PDF text layer stays as read', () => {
    const fromPdf = readLstbDeterministically(dto(LSTB_TEXT, { textSource: 'pdf_text' }))
    const fromOcr = readLstbDeterministically(dto(LSTB_TEXT, { textSource: 'ocr' }))
    expect(fromPdf).toEqual(parseLstbTextDeterministically(LSTB_TEXT))
    expect(fromOcr.fields.bruttoarbeitslohn.value).toBe(fromPdf.fields.bruttoarbeitslohn.value)
    expect(fromOcr.fields.bruttoarbeitslohn.status).toBe('pruefen')
  })

  it('maps the model reply onto the Core fallback input', () => {
    const fallback = textFallbackOf({ taxYear: null, line3BruttoEur: 1, line4LohnsteuerEur: 2, line23RvEur: 3, line23aRvEur: null, line23bRvEur: null, line25KvEur: 4, line26PvEur: 5, line27AlvEur: 6 })
    expect(fallback).toEqual({ line3Brutto: 1, line4Lohnsteuer: 2, svBreakdown: { line23: 3, line23a: null, line23b: null, line25: 4, line26: 5, line27: 6 } })
  })

  it('points the summary at the gross wage and carries every line', () => {
    const extraction = parseLstbTextDeterministically(LSTB_TEXT)
    expect(lstbSummary(extraction, 2024)).toMatchObject({ suggestedScreen: 'lstb', suggestedField: 'bruttoarbeitslohn', suggestedValue: String(extraction.fields.bruttoarbeitslohn.value), taxYear: 2025 })
    const dtos = lstbFieldDtos(extraction)
    expect(Object.keys(dtos.fields)).toEqual(['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung'])
    expect(Object.keys(dtos.lines)).toHaveLength(10)
  })
})

describe('Swiss certificate and statement steps', () => {
  it('gives no Ziffer as read when the text came from OCR', () => {
    const read = parseChSalaryCertificateText('Lohnausweis 2025\n1. Lohn 85 000\n8. Bruttolohn total 85 000')
    const fromOcr = certificateFieldDtos(read, true)
    expect(fromOcr.length).toBeGreaterThan(0)
    expect(fromOcr.every((f) => f.status === 'pruefen')).toBe(true)
  })

  it('drafts the self-borne costs in euros only when a rate exists', () => {
    const notes: string[] = []
    expect(selfBorneDrafts(300, [], { chosen: null, rate: null }, false, notes)).toEqual([])
    expect(notes[0]).toContain('sobald der Wechselkurs')
    const drafts = selfBorneDrafts(300, [], { chosen: 1, rate: 1 }, false, [])
    expect(drafts.map((d) => [d.field, d.value, d.status])).toEqual([
      ['gesundheit-gate', 'Ja', 'ok'],
      ['gesundheit-betrag', 300, 'ok'],
    ])
    expect(selfBorneDrafts(300, [], { chosen: null, rate: 1 }, false, [])[1]!.status).toBe('pruefen')
  })
})

describe('assessment and business steps', () => {
  it('drafts each read position, the date and the explanations', () => {
    const read = { taxYear: 2024, assessmentDate: '2025-06-01', positions: { erstattung: 812 }, explanations: ['x'] } as unknown as Parameters<typeof assessmentDraftFields>[0]
    const fields = assessmentDraftFields(read, ['erstattung'], { text: 'Erläuterung' }, 'pruefen')
    expect(fields.map((f) => [f.field, f.value, f.status])).toEqual([
      ['erstattung', 812, 'pruefen'],
      ['assessmentDate', '2025-06-01', 'pruefen'],
      ['erlaeuterungen', 'Erläuterung', 'pruefen'],
    ])
  })

  it('says nothing about an ordinary receipt that is no E-Rechnung', () => {
    expect(eInvoiceNotes('Quittung Bürobedarf 23,80 EUR')).toEqual([])
  })
})
