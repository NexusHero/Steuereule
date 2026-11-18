import { describe, expect, it } from 'vitest'
import { assessmentExplanations, looksLikeAssessmentNotice, parseAssessmentNotice } from './assessment-notice'
import { classifyDocumentKind } from './document-kind'

// A synthetic joint notice shaped like the mock's 2024 (ADR-0098 §4, §8); no real person's data.
const NOTICE_2024 = `Finanzamt Musterstadt                                     02.11.2026
Steuernummer 000/000/00000
Bescheid für 2024 über Einkommensteuer, Solidaritätszuschlag und Kirchensteuer
Festsetzung                       Einkommensteuer   Solidaritätszuschlag   Kirchensteuer
festgesetzt werden                12.170,00 €       0,00 €                 0,00 €
abzüglich einbehaltene Lohnsteuer 12.979,00 €
Erstattung                        809,00 €
Berechnung der Besteuerungsgrundlagen        Ehemann      Ehefrau
Einkünfte aus nichtselbständiger Arbeit
Bruttoarbeitslohn                            54.900       39.000
Entfernungspauschale                          1.320        1.050
Homeoffice-Pauschale                          1.080          720
Arbeitsmittel                                   260          160
Werbungskosten                                2.660        1.930
Vorsorgeaufwendungen                                      17.968
Sonderausgaben-Pauschbetrag                                   72
zu versteuerndes Einkommen                                71.271
Gegen diesen Bescheid ist der Einspruch zulässig.
Erläuterungen
Die Tätigkeit in der häuslichen Wohnung wurde an 180 statt 210 Tagen berücksichtigt.

Aufwendungen für das Mobiltelefon wurden wegen privater Mitbenutzung zu 50 % anerkannt.
`

describe('the tax notice as a document', () => {
  it('is told apart from the LStB whose rows it quotes', () => {
    expect(looksLikeAssessmentNotice(NOTICE_2024)).toBe(true)
    expect(classifyDocumentKind(NOTICE_2024)).toBe('steuerbescheid')
    expect(classifyDocumentKind('Ausdruck der elektronischen Lohnsteuerbescheinigung\n3. Bruttoarbeitslohn 54.900')).toBe('lstb')
  })
})

describe('parseAssessmentNotice', () => {
  const read = parseAssessmentNotice(NOTICE_2024)

  it('reads the year and the date the deadline runs from', () => {
    expect(read.taxYear).toBe(2024)
    expect(read.assessmentDate).toBe('2026-11-02')
  })

  it('reads both columns of a joint notice and the household figures', () => {
    expect(read.positions).toEqual({
      festgesetzteSteuer: 12_170,
      solidaritaetszuschlag: 0,
      kirchensteuer: 0,
      anrechnung: 12_979,
      erstattung: 809,
      bruttoarbeitslohnA: 54_900,
      bruttoarbeitslohnB: 39_000,
      fahrtwegA: 1_320,
      fahrtwegB: 1_050,
      homeofficeA: 1_080,
      homeofficeB: 720,
      arbeitsmittelA: 260,
      arbeitsmittelB: 160,
      werbungskostenA: 2_660,
      werbungskostenB: 1_930,
      vorsorgeaufwand: 17_968,
      sonderausgaben: 72,
      zuVersteuerndesEinkommen: 71_271,
    })
  })

  it('reads a back payment as negative', () => {
    expect(parseAssessmentNotice('Bescheid für 2023 über Einkommensteuer\nfestgesetzt werden 9.000,00\nNachzahlung 60,00 €').positions.erstattung).toBe(-60)
  })

  it('leaves what it cannot find out instead of reading 0', () => {
    const partial = parseAssessmentNotice('Bescheid für 2021 über Einkommensteuer\nfestgesetzt werden 6.410,00 €')
    expect(partial.positions).toEqual({ festgesetzteSteuer: 6_410 })
    expect(partial.explanations).toEqual([])
  })

  it('keeps the explanations, one per paragraph', () => {
    expect(read.explanations).toEqual([
      'Die Tätigkeit in der häuslichen Wohnung wurde an 180 statt 210 Tagen berücksichtigt.',
      'Aufwendungen für das Mobiltelefon wurden wegen privater Mitbenutzung zu 50 % anerkannt.',
    ])
  })
})

describe('assessmentExplanations', () => {
  it('ties each explanation to the position it talks about', () => {
    expect(assessmentExplanations(parseAssessmentNotice(NOTICE_2024).explanations.join('\n'))).toEqual([
      { position: 'homeofficeA', text: 'Die Tätigkeit in der häuslichen Wohnung wurde an 180 statt 210 Tagen berücksichtigt.' },
      { position: 'arbeitsmittelA', text: 'Aufwendungen für das Mobiltelefon wurden wegen privater Mitbenutzung zu 50 % anerkannt.' },
    ])
  })

  it('gives Person B what names the spouse, and nothing for no text', () => {
    expect(assessmentExplanations('Arbeitsmittel der Ehefrau wurden gekürzt.')[0]!.position).toBe('arbeitsmittelB')
    expect(assessmentExplanations(null)).toEqual([])
  })
})
