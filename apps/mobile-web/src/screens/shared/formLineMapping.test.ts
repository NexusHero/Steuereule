import { describe, expect, it } from 'vitest'
import { formLineForField, maskTargetForAcroField } from './formLineMapping'

describe('formLineForField („Glas-Erklärung“)', () => {
  it('maps commute homeOfficeDays and oneWayKm to exact Anlage N lines', () => {
    expect(formLineForField('commute', 'homeOfficeDays')).toEqual({
      form: 'Anlage N',
      line: 'Zeile 45 (Kz 335)',
      label: 'Anlage N · Zeile 45 (Homeoffice)',
    })
    expect(formLineForField('commute', 'oneWayKm').label).toBe('Anlage N · Zeilen 31–39 (Arbeitsweg)')
    expect(formLineForField('commute', 'workEquipmentEur').label).toBe('Anlage N · Zeilen 42–43 (Arbeitsmittel)')
  })

  it('maps interview questions to their target annex and line', () => {
    expect(formLineForField('interview', 'spenden-betrag').label).toBe('Anlage Sonderausgaben · Zeile 5')
    expect(formLineForField('interview', 'fortbildung-kosten').label).toBe('Anlage N · Zeile 46 (Fortbildung)')
    expect(formLineForField('interview', 'umzug-kosten').label).toBe('Anlage N · Zeile 48 (Umzugskosten)')
    expect(formLineForField('interview', 'lohnersatz-betrag').label).toBe('Hauptvordruck ESt 1 A · Zeile 43')
    expect(formLineForField('interview', 'haushalt-handwerker-betrag').label).toBe(
      'Anlage Haushaltsnahe Aufwendungen · Zeilen 4–6',
    )
    expect(formLineForField('interview', 'gesundheit-betrag').label).toBe('Anlage Außerg. Belastungen · Zeile 13')
  })

  it('maps LStB, CH-Lohnausweis, Anlage V, Anlage Kind, Anlage KAP and Anlage R', () => {
    expect(formLineForField('lstb', 'bruttoarbeitslohn').label).toBe('Anlage N · Zeile 6 (Kz 110)')
    expect(formLineForField('lstb', 'sozialversicherung').label).toBe('Anlage Vorsorgeaufwand · Zeilen 12–28')
    expect(formLineForField('chLohnausweis', 'withholdingTaxChf').label).toBe(
      'Anlage N-Gre · Zeile 24 (Quellensteuer)',
    )
    expect(formLineForField('vermietung', 'mieteinnahmen').label).toBe('Anlage V · Zeile 9 (Kaltmiete)')
    expect(formLineForField('vermietung', 'anteilA').label).toBe('Anlage V · Zeile 86 (Miteigentumsanteil)')
    expect(formLineForField('kind', 'childcareEur').label).toBe('Anlage Kind · Zeile 67 (Kinderbetreuung)')
    expect(formLineForField('kapital', 'kapitalertraege').label).toBe('Anlage KAP · Zeilen 7–51')
    expect(formLineForField('rente', 'jahresbetrag').label).toBe('Anlage R · Zeilen 4–10')
  })

  it('reverse-maps AcroForm field IDs back to the exact input mask and field', () => {
    expect(maskTargetForAcroField('anlN.kz110')).toMatchObject({ screen: 'lstb', field: 'bruttoarbeitslohn' })
    expect(maskTargetForAcroField('anlN.kz111')).toMatchObject({ screen: 'commute', field: 'oneWayKm' })
    expect(maskTargetForAcroField('anlNGre.kz169')).toMatchObject({ screen: 'chLohnausweis', field: 'withholdingTaxChf' })
    expect(maskTargetForAcroField('anlNGre.z6Chf')).toMatchObject({ screen: 'chLohnausweis', field: 'grossWageChf' })
    expect(maskTargetForAcroField('anlKind.vorname#2')).toMatchObject({ screen: 'kind', field: 'firstName' })
    expect(maskTargetForAcroField('anlV.z13Miete')).toMatchObject({ screen: 'vermietung', field: 'mieteinnahmen' })
    expect(maskTargetForAcroField('est1a.ibanInland')).toMatchObject({ screen: 'stammdaten', field: 'iban' })
    expect(maskTargetForAcroField('est1a.vornameB')).toMatchObject({ screen: 'stammdaten', person: 'B' })
  })
})
