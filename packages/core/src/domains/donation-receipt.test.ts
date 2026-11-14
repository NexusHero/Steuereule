import { describe, expect, it } from 'vitest'
import { looksLikeDonationReceipt, parseDonationReceipt, uncountedDonations } from './donation-receipt'

// Invented receipts in the shapes real charities print (ADR-0080).
const HEAD = ['Aussteller: Beispielhilfe e.V., Musterweg 1, 50000 Köln', 'Sammelbestätigung über Geldzuwendungen', 'im Sinne des § 10b des Einkommensteuergesetzes']

const JOINT = [
  ...HEAD,
  'Spender-Nr.: 111                Datum: 16.07.2025',
  'Gesamtbetrag der Zuwendung in Ziffern / in Buchstaben / Zeitraum der Sammelbestätigung:',
  'EUR 1.380,00*/*eins*drei*acht*null*/01.01.2024 bis 31.12.2024',
  'Anlage zur Sammelbestätigung',
  'D000000000001      05.02.2024   Geldzuwendung   nein                 EUR 1.000,00',
  'D000000000002      05.06.2024   Geldzuwendung   nein                 EUR 120,00',
  'D000000000003      30.09.2024   Geldzuwendung   nein                 EUR 260,00',
  'Gesamtsumme                                                          EUR 1.380,00',
].join('\n')

const OWN = [
  ...HEAD,
  'Spender-Nr.: 222                Datum: 06.06.2025',
  'EUR 120,00*/*eins*zwei*null*/01.01.2024 bis 31.12.2024',
  'D000000000002      05.06.2024   Geldzuwendung   nein                 EUR 120,00',
  'Gesamtsumme                                                          EUR 120,00',
].join('\n')

const COPY = [
  'Aussteller: Beispielhilfe e.V., Musterweg 1, 50000 Köln',
  'Sammelbestätigung (Doppel) über Geldzuwendungen',
  'im Sinne des § 10b des Einkommensteuergesetzes',
  'Gesamtbetrag der Zuwendung in Ziffern / in Buchstaben / Zeitraum der Sammelbestätigung:',
  'EUR 120.00 *eins*zwei*null* 01.01.2024 bis 31.12.2024',
  'Gesamtsumme                                                          EUR 120.00',
].join('\n')

describe('parseDonationReceipt', () => {
  it('reads total, year and each booking of a Sammelbestätigung', () => {
    const read = parseDonationReceipt(JOINT)
    expect(read).toMatchObject({ totalEur: 1380, taxYear: 2024, isCopy: false })
    expect(read.items.map((i) => i.ref)).toEqual(['D000000000001', 'D000000000002', 'D000000000003'])
  })

  it('takes the year of the donations, not the date the receipt was printed', () => {
    expect(parseDonationReceipt(OWN).taxYear).toBe(2024)
  })

  it('knows a copy and reads its total with a decimal point', () => {
    expect(parseDonationReceipt(COPY)).toMatchObject({ totalEur: 120, isCopy: true, items: [{ ref: null, amountCents: 12000 }] })
  })

  it('reads a single Zuwendungsbestätigung without a booking list', () => {
    const single = ['Bestätigung über Geldzuwendungen im Sinne des § 10b EStG', 'Name: Verein Beispiel e.V.', 'Betrag der Zuwendung - in Ziffern -', '50,00 €', 'Tag der Zuwendung: 03.03.2025'].join('\n')
    expect(parseDonationReceipt(single)).toMatchObject({ totalEur: 50, taxYear: 2025, items: [{ ref: null, amountCents: 5000 }] })
  })

  it('knows a donation receipt', () => {
    expect(looksLikeDonationReceipt(JOINT)).toBe(true)
    expect(looksLikeDonationReceipt('Rechnung Nr. 1 Arbeitszeit 3 Std.')).toBe(false)
  })
})

describe('uncountedDonations', () => {
  it('counts a booking repeated on a partner’s own receipt only once', () => {
    const joint = parseDonationReceipt(JOINT).items
    const { fresh, repeated } = uncountedDonations(parseDonationReceipt(OWN).items, joint)
    expect(fresh).toHaveLength(0)
    expect(repeated).toHaveLength(1)
  })

  it('counts a copy without booking numbers once, in either order', () => {
    const copy = parseDonationReceipt(COPY).items
    expect(uncountedDonations(copy, parseDonationReceipt(JOINT).items).fresh).toHaveLength(0)
    const afterCopy = uncountedDonations(parseDonationReceipt(JOINT).items, copy).fresh
    expect(afterCopy.reduce((s, i) => s + i.amountCents, 0)).toBe(126000)
  })

  it('adds donations to another charity', () => {
    const other = parseDonationReceipt(COPY.replace(/Beispielhilfe/g, 'Andere Hilfe').replace('(Doppel) ', '')).items
    expect(uncountedDonations(other, parseDonationReceipt(JOINT).items).fresh).toHaveLength(1)
  })
})
