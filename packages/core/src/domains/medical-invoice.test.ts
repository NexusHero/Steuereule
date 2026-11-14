import { describe, expect, it } from 'vitest'
import { looksLikeMedicalInvoice, parseMedicalInvoice } from './medical-invoice'

// Invented invoices (escalation case): a dentist's bill counts as Krankheitskosten (§ 33 EStG),
// a cosmetic operation without a medical reason never does.
const DENTIST = [
  'Zahnarztpraxis Dr. Beispiel',
  'Rechnung Nr. 2025-0815 vom 14.05.2025',
  'Patient: Max Muster',
  'Zahnärztliche Behandlung, Füllungstherapie und Implantat nach GOZ',
  'Material 85,00 EUR',
  'Rechnungsbetrag: 1.700,00 EUR',
].join('\n')

const COSMETIC = [
  'Klinik für Ästhetische Chirurgie Beispiel',
  'Rechnung vom 02.10.2025',
  'Schönheitsoperation (ästhetische Lidstraffung), keine medizinische Indikation',
  'Rechnungsbetrag: 3.800,00 EUR',
].join('\n')

describe('parseMedicalInvoice', () => {
  it('reads a dentist’s invoice: the total, the date and a key that recognises it again', () => {
    expect(looksLikeMedicalInvoice(DENTIST)).toBe(true)
    const read = parseMedicalInvoice(DENTIST)
    expect(read).toMatchObject({ cosmetic: false, totalEur: 1700, taxYear: 2025, invoiceDate: '14.05.2025' })
    expect(read.ref).toBe(parseMedicalInvoice(`${DENTIST}\n`).ref)
    expect(read.ref).not.toBe(parseMedicalInvoice(DENTIST.replace('2025-0815', '2025-0816')).ref)
  })

  it('takes the amount left after the insurer’s refund when the invoice prints one', () => {
    const refunded = `${DENTIST}\nErstattung der Krankenkasse: 400,00 EUR\nEigenanteil: 1.300,00 EUR`
    expect(parseMedicalInvoice(refunded).totalEur).toBe(1300)
  })

  it('recognises a cosmetic operation, which is no extraordinary burden', () => {
    expect(looksLikeMedicalInvoice(COSMETIC)).toBe(true)
    expect(parseMedicalInvoice(COSMETIC)).toMatchObject({ cosmetic: true })
    expect(parseMedicalInvoice('Praxis für Ästhetik\nBotox-Behandlung Stirn\nBetrag 450,00 EUR').cosmetic).toBe(true)
  })

  it('is not fooled by other receipts', () => {
    expect(looksLikeMedicalInvoice('Elektro Muster GmbH\nRechnung Handwerkerleistung 300,00 EUR')).toBe(false)
    expect(looksLikeMedicalInvoice('Bestätigung über Geldzuwendungen, Kinderhilfe e.V.')).toBe(false)
  })
})

describe('parseMedicalInvoice — edges', () => {
  it('takes the first euro amount when no line names the total, and reads amounts without cents', () => {
    expect(parseMedicalInvoice('Praxis Dr. Muster\nBehandlung 120 €').totalEur).toBe(120)
    expect(parseMedicalInvoice('Physiotherapie Beispiel\nRechnungsbetrag 2.050 EUR').totalEur).toBe(2050)
  })
  it('gives no amount, date or year when the invoice prints none', () => {
    expect(parseMedicalInvoice('Zahnarztpraxis Dr. Beispiel\nBehandlung nach GOZ')).toMatchObject({ totalEur: null, taxYear: null, invoiceDate: null, cosmetic: false })
    expect(parseMedicalInvoice('')).toMatchObject({ totalEur: null, taxYear: null })
  })
  it('falls back from a total line without an amount to the next amount, and to the date for the key', () => {
    const read = parseMedicalInvoice('Optiker Beispiel\nGesamtbetrag siehe unten\nBrillengläser 340,00 €\n01.03.2025')
    expect(read.totalEur).toBe(340)
    expect(read.ref).toContain('01.03.2025')
  })
  it('is not a medical invoice without a medical word, nor when empty', () => {
    expect(looksLikeMedicalInvoice('Rechnung Nr. 4711 über 99,00 EUR')).toBe(false)
    expect(looksLikeMedicalInvoice('')).toBe(false)
  })
})
