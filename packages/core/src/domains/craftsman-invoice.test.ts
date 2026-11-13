import { describe, expect, it } from 'vitest'
import { looksLikeCraftsmanInvoice, parseCraftsmanInvoice } from './craftsman-invoice'

// Invented invoices in the patterns real craftsmen use (§ 35a Abs. 3 EStG: only the labour share,
// machine and travel costs, with VAT, count — never material).

const STATED = [
  'Zimmerei Beispiel GmbH',
  'Rechnung Nr. 4711 vom 12.08.2024',
  'Position Menge ME Bezeichnung Einzel- Gesamt',
  '1 3,00 Std. Arbeitszeit Facharbeiter 58,00 174,00',
  '2 1,00 Kleineisenteile und Befestigungsmaterial 20,00 20,00',
  'Nettosumme in EUR 194,00',
  'Endsumme in EUR : 230,86',
  'Im oben aufgeführten Rechnungsbetrag von 230,86 € sind 207,06 € inkl. 19 % MwSt. Lohnkosten enthalten.',
].join('\n')

const HOURS = [
  'Beispiel Elektro GmbH',
  'Rechnung 2024-118, Datum 03.09.2024',
  'Pos Menge Einh. Bezeichnung E-Preis/EUR Gesamt/EUR',
  '1 10,50 Std. 2 x An- und Abfahrt, sowie Teilmontage und Wiedermontage 70,00 735,00',
  '2 1,00 Stck. Kabel und Installationsmaterial 90,00 90,00',
  'Gesamtbetrag EUR 825,00',
  'Mehrwertsteuer 19,00% EUR 156,75',
  'Gesamtbetrag inkl. Steuer EUR 981,75',
].join('\n')

const PV = [
  'Solar Beispiel GmbH Rechnung Nr. 99 vom 20.11.2024',
  '1.001 18 Stk Solarmodul 440 Wp 120,00 2.160,00',
  '1.004 9,800 kWp DC-Montage Pro 3.500,00 3.500,00',
  '2.002 1 psl. AC-Montage und Inbetriebnahme 1.200,00 1.200,00',
  'Netto-Summe € 6.860,00',
  '0,00 % USt. von 6.860,00 € 0,00',
  'Gesamt-Betrag € 6.860,00',
].join('\n')

describe('parseCraftsmanInvoice', () => {
  it('takes the labour share the invoice states', () => {
    expect(parseCraftsmanInvoice(STATED)).toMatchObject({ labourEur: 207, invoiceTotalEur: 231, source: 'stated', taxYear: 2024 })
  })

  it('adds up labour positions (hours, assembly, travel) with the invoice’s VAT, never material', () => {
    const read = parseCraftsmanInvoice(HOURS)
    expect(read).toMatchObject({ labourEur: 875, invoiceTotalEur: 982, source: 'positions', vatRate: 0.19 })
    expect(read.labourPositions).toHaveLength(1)
  })

  it('uses 0 % where the invoice charges none (photovoltaics)', () => {
    expect(parseCraftsmanInvoice(PV)).toMatchObject({ labourEur: 4700, invoiceTotalEur: 6860, vatRate: 0 })
  })

  it('warns about public subsidies and order confirmations', () => {
    expect(parseCraftsmanInvoice(`${HOURS}\nGefördert durch die BAFA (Bundesförderung effiziente Gebäude)`).subsidyHint).toBe(true)
    expect(parseCraftsmanInvoice(HOURS.replace('Rechnung 2024-118', 'Auftragsbestätigung AB-118')).notAnInvoice).toBe(true)
  })

  it('finds nothing in a receipt without labour', () => {
    expect(parseCraftsmanInvoice('Baumarkt Kassenbon\nSchrauben 4,99\nSumme 4,99').labourEur).toBeNull()
  })
})

describe('looksLikeCraftsmanInvoice', () => {
  it('knows a craftsman’s invoice by labour words and a total', () => {
    expect(looksLikeCraftsmanInvoice(STATED)).toBe(true)
    expect(looksLikeCraftsmanInvoice(HOURS)).toBe(true)
    expect(looksLikeCraftsmanInvoice('Spendenbestätigung über 50 €')).toBe(false)
  })
})
