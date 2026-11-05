import { describe, expect, it } from 'vitest'
import { steuerschaetzungAngestellt, steuerschaetzungGrenzgaenger } from './steuerschaetzung'
import { incomeTax } from './tarif'

const ANGESTELLT = {
  jahr: 2025,
  bruttoarbeitslohn: 45000,
  lohnsteuer: 6100,
  sozialversicherung: 9200,
  pendlerpauschale: 0,
  weitereWerbungskosten: 0,
  spenden: 200,
  selbstGezahlteKvPv: 0,
}

describe('steuerschaetzungAngestellt', () => {
  it('estimates the refund as a range around the deductible share of the social security contributions', () => {
    const schaetzung = steuerschaetzungAngestellt(ANGESTELLT)

    expect(schaetzung.kind).toBe('spanne')
    if (schaetzung.kind !== 'spanne') return
    const zveBestFall = 45000 - 1230 - Math.round(9200 * 0.93) - 200
    const zveSchlechtFall = 45000 - 1230 - Math.round(9200 * 0.91) - 200
    expect(schaetzung.einkommensteuer).toEqual({ von: incomeTax(zveBestFall, 2025), bis: incomeTax(zveSchlechtFall, 2025) })
    expect(schaetzung.ergebnis).toEqual({ von: 6100 - incomeTax(zveSchlechtFall, 2025), bis: 6100 - incomeTax(zveBestFall, 2025) })
  })

  it('uses the Entfernungspauschale once it beats the Arbeitnehmer-Pauschbetrag', () => {
    const ohne = steuerschaetzungAngestellt(ANGESTELLT)
    const mit = steuerschaetzungAngestellt({ ...ANGESTELLT, pendlerpauschale: 2019 })

    if (ohne.kind !== 'spanne' || mit.kind !== 'spanne') throw new Error('expected a range')
    expect(mit.ergebnis.von).toBeGreaterThan(ohne.ergebnis.von)
    expect(mit.werbungskosten).toBe(2019)
    expect(ohne.werbungskosten).toBe(1230)
  })

  it('counts at least the Sonderausgaben-Pauschbetrag of 36 €', () => {
    const schaetzung = steuerschaetzungAngestellt({ ...ANGESTELLT, spenden: 0 })

    if (schaetzung.kind !== 'spanne') throw new Error('expected a range')
    expect(schaetzung.sonderausgaben).toBe(36)
  })

  it('never goes below zero taxable income', () => {
    const schaetzung = steuerschaetzungAngestellt({ ...ANGESTELLT, bruttoarbeitslohn: 9000, lohnsteuer: 0, sozialversicherung: 1900 })

    if (schaetzung.kind !== 'spanne') throw new Error('expected a range')
    expect(schaetzung.einkommensteuer).toEqual({ von: 0, bis: 0 })
  })

  it('declines years without a tariff instead of guessing', () => {
    const schaetzung = steuerschaetzungAngestellt({ ...ANGESTELLT, jahr: 2019 })

    expect(schaetzung).toEqual({ kind: 'nicht-moeglich', grund: 'jahr-ohne-tarif' })
  })
})

const GRENZGAENGER = {
  jahr: 2025,
  arbeitslohnEur: 96300,
  quellensteuerEur: 4334,
  altersvorsorgeEur: 9678,
  sonstigeVorsorgeEur: 1782,
  krankenversicherungEur: 0,
  pendlerpauschale: 0,
  spenden: 0,
}

describe('steuerschaetzungGrenzgaenger', () => {
  it('compares the German tax with the creditable Swiss withholding tax', () => {
    const schaetzung = steuerschaetzungGrenzgaenger(GRENZGAENGER)

    if (schaetzung.kind !== 'spanne') throw new Error('expected a range')
    expect(schaetzung.anrechnung).toBe(4334)
    expect(schaetzung.ergebnis.bis).toBeLessThan(0)
    expect(schaetzung.ergebnis.von).toBeLessThanOrEqual(schaetzung.ergebnis.bis)
  })

  it('deducts Altersvorsorge in full and sonstige Vorsorge only up to the Höchstbetrag (Anlage N-Gre Z. 82/85)', () => {
    const schaetzung = steuerschaetzungGrenzgaenger({ ...GRENZGAENGER, sonstigeVorsorgeEur: 5000 })

    if (schaetzung.kind !== 'spanne') throw new Error('expected a range')
    expect(schaetzung.vorsorge).toEqual({ von: 9678, bis: 9678 + 2800 })
  })

  it('always deducts the basic health insurance, even above the Höchstbetrag', () => {
    const schaetzung = steuerschaetzungGrenzgaenger({ ...GRENZGAENGER, krankenversicherungEur: 4000 })

    if (schaetzung.kind !== 'spanne') throw new Error('expected a range')
    expect(schaetzung.vorsorge).toEqual({ von: 9678 + 4000, bis: 9678 + 4000 })
  })
})
