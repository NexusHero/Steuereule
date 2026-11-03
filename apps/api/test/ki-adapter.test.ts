import { describe, expect, it } from 'vitest'
import { pruefePiiFreiheit, RagKiAdapter, validiereKiVorschlag } from '../src/ki/ki.adapter.js'

describe('RagKiAdapter & PII-Schranke (ADR-048 / ADR-0051)', () => {
  it('blockt Payloads mit 11-stelliger Steuer-ID, IBAN oder Personen-Schlüsseln', () => {
    expect(() => pruefePiiFreiheit({ text: 'ID 12345678901' })).toThrow(/Steuer-ID/)
    expect(() => pruefePiiFreiheit({ text: 'DE89370400440532013000' })).toThrow(/IBAN/)
    expect(() => pruefePiiFreiheit({ vorname: 'Erika', betrag: 100 })).toThrow(/vorname/)
    expect(() => pruefePiiFreiheit({ steuerjahr: 2025, homeofficeTage: 45 })).not.toThrow()
    expect(() => pruefePiiFreiheit({ steuerjahr: 2025, partner: { steuerId: null } })).toThrow(/steuerId/)
  })

  it('validiert strukturierte KiVorschlag-Outputs strikt gegen das Schema (ADR-048 § 2)', () => {
    const valid = validiereKiVorschlag({
      id: 'v-1',
      einkunftsart: 'Nichtselbstständig',
      betrag: 450,
      belegId: 'b-1',
    })
    expect(valid).toEqual({
      id: 'v-1',
      einkunftsart: 'Nichtselbstständig',
      betrag: 450,
      belegId: 'b-1',
    })

    expect(() =>
      validiereKiVorschlag({
        id: 'v-2',
        einkunftsart: 'ErfundeneEinkunftsart',
        betrag: 100,
      }),
    ).toThrow(/unknown einkunftsart/)

    expect(() =>
      validiereKiVorschlag({
        id: 'v-3',
        einkunftsart: 'Nichtselbstständig',
        betrag: -50,
      }),
    ).toThrow(/non-negative integer/)
  })

  it('übersetzt Rechtsquellen deterministisch aus dem kuratierten Speicher (ADR-039)', async () => {
    const adapter = new RagKiAdapter()
    const homeoffice = await adapter.erklaereQuelle('estg-4-5-6c')
    expect(homeoffice).toContain('6 €')
    expect(homeoffice).toContain('1.260 €')
    expect(homeoffice).toContain('§ 4 Abs. 5 Satz 1 Nr. 6c EStG')

    expect(await adapter.erklaereQuelle('estg-10-1-5')).toContain('4.800 €')
    expect(await adapter.erklaereQuelle('estg-32')).toContain('9.600 €')
  })

  it('erfindet keine Quelle: eine unbekannte Id ist ein Fehler, kein Platzhaltertext', async () => {
    const adapter = new RagKiAdapter()
    await expect(adapter.erklaereQuelle('§ 10b')).rejects.toThrow(/Unbekannte Rechtsquelle/)
    await expect(adapter.erklaereQuelle('__proto__')).rejects.toThrow(/Unbekannte Rechtsquelle/)
  })
})
