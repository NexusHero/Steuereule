import { describe, expect, it } from 'vitest'
import { classifyDocumentKind } from './document-kind'

describe('classifyDocumentKind', () => {
  it('routes a Lohnsteuerbescheinigung to the lstb strategy', () => {
    expect(classifyDocumentKind('Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025\n3. Bruttoarbeitslohn 48.000,00')).toBe('lstb')
  })

  it('still recognises it when OCR lost the title but two rows survived', () => {
    expect(classifyDocumentKind('3. Bruttoarbeitslohn 48.000,00\n4. Einbehaltene Lohnsteuer 7.600,00')).toBe('lstb')
  })

  it('keeps invoices, donation receipts and a bare mention of the word on the generic path', () => {
    expect(classifyDocumentKind('Rechnung Nr. 4711\nMonitor 349,00 EUR')).toBe('auto')
    expect(classifyDocumentKind('Zuwendungsbestätigung über 120 EUR')).toBe('auto')
    expect(classifyDocumentKind('Bitte Lohnsteuerbescheinigung nachreichen')).toBe('auto')
    expect(classifyDocumentKind('')).toBe('auto')
  })

  it('routes a Swiss salary certificate to its own reader, not a mention of one', () => {
    expect(classifyDocumentKind('Lohnausweis - Certificat de salaire - Certificato di salario\n8 Bruttolohn total / Rente = 100.000')).toBe('chLohnausweis')
    expect(classifyDocumentKind('Kopie Lohnausweis angefordert, Gebühr 20 CHF')).toBe('auto')
  })
})
