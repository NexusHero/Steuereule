import { describe, expect, it } from 'vitest'
import { checkPiiFree, RagKiAdapter, validateAiProposal } from '../src/ki/ki.adapter.js'

describe('RagKiAdapter & PII-Schranke (ADR-048 / ADR-0051)', () => {
  it('blockt Payloads mit 11-stelliger Steuer-ID, IBAN oder Personen-Schlüsseln', () => {
    expect(() => checkPiiFree({ text: 'ID 12345678901' })).toThrow(/Steuer-ID/)
    expect(() => checkPiiFree({ text: 'DE89370400440532013000' })).toThrow(/IBAN/)
    expect(() => checkPiiFree({ vorname: 'Erika', betrag: 100 })).toThrow(/vorname/)
    expect(() => checkPiiFree({ steuerjahr: 2025, homeofficeTage: 45 })).not.toThrow()
    expect(() => checkPiiFree({ steuerjahr: 2025, partner: { steuerId: null } })).toThrow(/steuerId/)
    // the code's English names are personal data too
    expect(() => checkPiiFree({ taxYear: 2025, child: { taxId: null } })).toThrow(/taxId/)
    expect(() => checkPiiFree({ firstName: 'Erika' })).toThrow(/firstName/)
  })

  it('validiert strukturierte KiVorschlag-Outputs strikt gegen das Schema (ADR-048 § 2)', () => {
    const valid = validateAiProposal({
      id: 'v-1',
      einkunftsart: 'Nichtselbstständig',
      betrag: 450,
      belegId: 'b-1',
    })
    expect(valid).toEqual({
      id: 'v-1',
      incomeType: 'Nichtselbstständig',
      amount: 450,
      receiptId: 'b-1',
    })

    expect(() =>
      validateAiProposal({
        id: 'v-2',
        einkunftsart: 'ErfundeneEinkunftsart',
        betrag: 100,
      }),
    ).toThrow(/unknown einkunftsart/)

    expect(() =>
      validateAiProposal({
        id: 'v-3',
        einkunftsart: 'Nichtselbstständig',
        betrag: -50,
      }),
    ).toThrow(/non-negative integer/)
  })

  it('übersetzt Rechtsquellen deterministisch aus dem kuratierten Speicher (ADR-039)', async () => {
    const adapter = new RagKiAdapter()
    const homeOffice = await adapter.explainSource('estg-4-5-6c')
    expect(homeOffice).toContain('6 €')
    expect(homeOffice).toContain('1.260 €')
    expect(homeOffice).toContain('§ 4 Abs. 5 Satz 1 Nr. 6c EStG')

    expect(await adapter.explainSource('estg-10-1-5')).toContain('4.800 €')
    expect(await adapter.explainSource('estg-32')).toContain('9.600 €')
  })

  it('erfindet keine Quelle: eine unbekannte Id ist ein Fehler, kein Platzhaltertext', async () => {
    const adapter = new RagKiAdapter()
    await expect(adapter.explainSource('§ 10b')).rejects.toThrow(/Unbekannte Rechtsquelle/)
    await expect(adapter.explainSource('__proto__')).rejects.toThrow(/Unbekannte Rechtsquelle/)
  })
})

describe('checkPiiFree and record ids that look like an IBAN (#476)', () => {
  it('lets the fingerprint of an owl hint through, whatever its hex digits happen to be', () => {
    // The real fingerprint that stopped a customer's chat: two letters, two digits, twelve more.
    const digest = { openOwlHints: [{ id: 'eule-ml-fortbildung-2026', fingerprint: 'cc570711f2b86475', title: 'Fortbildung' }] }
    expect(() => checkPiiFree(digest)).not.toThrow()
  })

  it('still stops a real IBAN, in free text and even in a field called fingerprint', () => {
    expect(() => checkPiiFree({ message: 'Meine IBAN ist DE89 3704 0044 0532 0130 00' })).toThrow(/IBAN/)
    expect(() => checkPiiFree({ openOwlHints: [{ fingerprint: 'DE89370400440532013000' }] })).toThrow(/IBAN/)
  })
})
