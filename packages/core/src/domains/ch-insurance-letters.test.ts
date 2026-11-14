import { describe, expect, it } from 'vitest'
import {
  classifyChInsuranceLetter,
  parseChPensionStatement,
  parseChPremiumLetter,
  selectChInsuranceLetterAmountLines,
} from './ch-insurance-letters'

// Invented letters in the two layouts Swiss pension funds use, and the employers' premium letters.

/** Rows with an employee and an employer column; the mandatory part as "davon" rows. */
const ROWS_LAYOUT = [
  'Pensionskasse Beispiel                                      Musterweg 1, CH-8000 Zürich',
  'Nachweis obligatorischer und überobligatorischer Beiträge                    ausgestellt am 10.02.2026',
  'Versicherungs-Nr.                          123456',
  'AHV-Nummer                     756’1234’5678’97                  Herr',
  'Geburtsdatum                           01.02.1990                Kemal Muster',
  'Wunschgemäss bestätigen wir Ihnen folgende Arbeitgeber- und Arbeitnehmerbeiträge für das Jahr 2025.',
  'Beiträge                                                                           Arbeitnehmer       Arbeitgeber',
  'Sparbeitrag                                                                         6\'000.00          6\'000.00',
  'Risikobeitrag                                                                         500.00            500.00',
  'Davon Beiträge BVG',
  'Sparbeitrag BVG (obligatorischer Anteil)                                           2\'000.00          2\'000.00',
  'Risikobeitrag BVG (obligatorischer Anteil)                                            600.00            600.00',
  'alle Beträge in CHF',
].join('\n')

/** A table: mandatory, supplementary and total rows, for the employee and then the employer. */
const TABLE_LAYOUT = [
  'Pension Fund Beispiel',
  'Frau',
  'Anna Muster',
  'Übersicht über die obligatorischen und überobligatorischen Beiträge zur 2. Säule der',
  'schweizerischen Altersvorsorge 2025',
  'Sparbeitrag | _Risikobeitrag TOTAL',
  'ArbeitnehmerAN | ||',
  "Obligatorisch | -2'200.00 | 600.00 2'800.00",
  "Uberobligatorisch 1'800.00 200.00 2'000.00",
  "TOTAL AN 4'000.00 800.00 4'800.00",
  'ArbeitgeberAG | «iSO SCS',
  "Obligatorisch | 2'200.00 | 600.00 2'800.00",
  "Uberobligatorisch 4'300.00| 200.00 | 4°500.00",
  "TOTAL AG 6'500.00 800.00 7'300.00",
  "TOTAL AG+AN 10°500.00 | 1600.00 | 12'100.00",
  'Im Jahr 2024 betrug der Arbeitgeberbeitragssatz 9.00 % des versicherten Lohnes.',
].join('\n')

const PREMIUM_LETTER = [
  'Beispiel AG - Postfach - CH-8000 Zürich',
  'Kemal Muster',
  'Bestätigung Krankentaggeld- und Nichtberufsunfallversicherung 2025',
  'Wir bestätigen Ihnen hiermit, dass die Firma folgende Prämien zur Krankentaggeld- und',
  'Nichtberufsunfallversicherung im Jahr 2025 für Sie geleistet hat:',
  'Krankentaggeld:                      412,35 CHF',
  'Nichtberufsunfall:                   498,15 CHF',
].join('\n')

const FULL_PREMIUM_LETTER = [
  'Bescheinigung für das Steuerjahr 2025 über die übernommenen Beiträge der',
  'Kollektiv-Krankentaggeld-Versicherung und Nichtbetriebsunfall',
  'Die vollen Prämien für das Jahr 2025 betrugen:',
  "Krankentaggeldversicherung:                            CHF 5'124.10",
  'Nichtbetriebsunfallversicherung                        CHF 452.60',
  '   •   Die Beispiel AG zahlt die volle Prämie und verrechnet keinen Anteil an den Mitarbeitenden',
  '       weiter.',
].join('\n')

describe('parseChPensionStatement', () => {
  it('reads the rows layout: totals and the mandatory "davon" rows, employee and employer', () => {
    expect(parseChPensionStatement(ROWS_LAYOUT)).toMatchObject({
      taxYear: 2025,
      employee: { total: 6500, mandatory: 2600 },
      employer: { total: 6500, mandatory: 2600 },
      checks: { split: 'unknown' },
    })
  })

  it('reads the table layout and checks mandatory + supplementary = total', () => {
    expect(parseChPensionStatement(TABLE_LAYOUT)).toMatchObject({
      taxYear: 2025,
      employee: { total: 4800, mandatory: 2800, supplementary: 2000 },
      employer: { total: 7300, mandatory: 2800, supplementary: 4500 },
      checks: { split: 'ok' },
    })
  })

  it('leaves a total open when OCR lost a row, instead of adding up what is left', () => {
    const read = parseChPensionStatement(ROWS_LAYOUT.replace(/^Sparbeitrag {2,}.*$/m, ''))
    expect(read.employee.total).toBeNull()
    expect(read.employer.total).toBeNull()
    expect(read.employee.mandatory).toBe(2600)
  })

  it('flags a table whose rows do not add up', () => {
    expect(parseChPensionStatement(TABLE_LAYOUT.replace("TOTAL AG 6'500.00 800.00 7'300.00", "TOTAL AG 6'500.00 800.00 7'900.00")).checks.split).toBe('conflict')
  })
})

describe('parseChPremiumLetter', () => {
  it('reads what the employer paid for sickness pay and non-occupational accident insurance', () => {
    expect(parseChPremiumLetter(PREMIUM_LETTER)).toEqual({ taxYear: 2025, sicknessPayChf: 412.35, accidentChf: 498.15, employerPaysFull: false })
  })

  it('knows when the employer pays the full premium', () => {
    expect(parseChPremiumLetter(FULL_PREMIUM_LETTER)).toEqual({ taxYear: 2025, sicknessPayChf: 5124.1, accidentChf: 452.6, employerPaysFull: true })
  })
})

describe('classifyChInsuranceLetter', () => {
  it('tells the two letters apart and leaves other documents alone', () => {
    expect(classifyChInsuranceLetter(ROWS_LAYOUT)).toBe('chPensionskasse')
    expect(classifyChInsuranceLetter(TABLE_LAYOUT)).toBe('chPensionskasse')
    expect(classifyChInsuranceLetter(PREMIUM_LETTER)).toBe('chPraemien')
    expect(classifyChInsuranceLetter(FULL_PREMIUM_LETTER)).toBe('chPraemien')
    expect(classifyChInsuranceLetter('Rechnung Physiotherapie 120 CHF')).toBeNull()
  })
})

describe('selectChInsuranceLetterAmountLines', () => {
  it('keeps the amount rows and never the name, AHV number, birth date or address', () => {
    for (const text of [ROWS_LAYOUT, TABLE_LAYOUT, PREMIUM_LETTER]) {
      const kept = selectChInsuranceLetterAmountLines(text)
      for (const secret of ['Kemal', 'Anna', 'Muster', '756’1234', '01.02.1990', 'Musterweg', '123456']) expect(kept).not.toContain(secret)
    }
    expect(selectChInsuranceLetterAmountLines(TABLE_LAYOUT)).toContain("TOTAL AG 6'500.00 800.00 7'300.00")
  })
})
