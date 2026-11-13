import { describe, expect, it } from 'vitest'
import {
  applyChCertificateTextFallback,
  certificateHolderPerson,
  parseChSalaryCertificateText,
  selectChCertificateRelevantLines,
} from './ch-salary-certificate-parser'

// The official Swiss form (Form 11) as a payroll system's PDF text layer gives it. Invented person,
// employer and figures, in the layout of a real certificate.
const PDF = [
  'A     X          Lohnausweis - Certificat de salaire - Certificato di salario',
  'B                Rentenbescheinigung - Attestation de rentes - Attestazione delle rendite',
  'C                                                                                                             F                Unentgeltiche Beförderung zwischen Wohn- und Arbeitsort',
  '      756.1234.5678.97                                 01.02.1990                                                              Transport gratuit entre le domicile et le lieu de travail',
  '    AHV-Nr. - No AVS - N. AVS                       Geburtsdatum - Date de naissance - Data do nascita                         Trasporto gratuito dal domicilio al luogo di lavoro',
  '                                                                                                                               Kantinenverpflegung / Lunch-Checks',
  'D     2025                          E      01.01.2025                 31.12.2025                              G        X       Repas à la cantine / chèques-repas',
  '    Jahr - Année - Anno                  von - du - dal             bis - au - al                                              Pasti alla mensa / buoni pasto',
  '',
  'H',
  '          - PERSÖNLICH -',
  '          Muster Anna',
  '          Beispielweg 3',
  '          79999 MUSTERDORF',
  '          DEUTSCHLAND',
  '',
  ' 1. Lohn soweit nicht unter Ziffer 2-7 aufzuführen                   / Rente                                                                                                               CHF',
  '    Salaire qui ne concerne pas les chiffres 2 à 7 ci-dessous        / Rente',
  '    Salario se non da indicare sotto cifre da 2 a 7 più sotto        / Rendita                                                                                                  100.000',
  ' 2. Gehaltsnebenleistungen            2.1 Verpflegung, Unterkunft - Pension, logement - Vitto, alloggio                                                      +',
  '    Prestations salariales accessoires',
  '    Prestazioni accessorie al salario 2.2 Privatanteil Geschäftswagen - P.privée voit. Serv. - Quota privata automobile di servizio                          +                      2.400',
  '                                            2.3 Andere - Autres - Altre                                                                                      +',
  '                                                 Art - Genre - Genere',
  '',
  ' 3. Unregelmässige Leistungen - Prestations non périodiques - Prestazioni aperiodiche                             Art - Genre - Genere',
  '',
  '     See Supplementary Sheet                                                                                                                                +                      1.500',
  ' 4. Kapitalleistungen - Prestations en capital - Prestazioni in capitale                                          Art - Genre - Genere           +',
  ' 5. Beteiligungrechte gemäss Beiblatt - Droits de participation selon annexe - Diritti di partecipazione secondo allegato                              +',
  ' 6. Verwaltungsratsentschädigungen - Indemnités des membres de l\'administration - Indennità dei membri di consigli d\'amministrazione                   +',
  ' 7. Andere Leistungen - Autres prestations - Altre prestazioni                                                  Art - Genre - Genere           +                        -100',
  '',
  ' 8 Bruttolohn total / Rente - Salaire brut total / Rente - Salario lordo totale / Rendita                                                             =                  103.800',
  ' 9. Beiträge AHV/IV/EO/ALV/NBUV - Cotisations AVS/AI/APG/AC/AANP - Contributi AVS/AI/IPG/AD/AINP                                                      -                      6.900',
  '10 Berufliche Vorsorge        2. Säule 10.1 Ordentliche Beiträge - Cotisations ordinaries - Contributi ordinari                                              -                      6.000',
  '   Prévoyance professionnelle 2epilier',
  '   Previdenza professionale 2 pilastro 10.2 Beiträge für den Einkauf - Cotisations pour le rachat - Contributi per il riscatto                               -                      1.000',
  '',
  '11. Nettolohn / Rente - Salaire net / Rente - Salario netto / Rendita                                                                                 =                   89.900',
  '    In die Steuererklärung übertragen - A reporter sur la déclaration d\'impôt - Da riportare nella dichiarazione d\'imposta',
  '',
  '12. Quellensteuerabzug - Retenue de I\'impôt à la source - Ritenuta d\'imposta alla fonte                                                                                             4.321',
  '13. Spesenvergütungen - Allocations pour frais - Indennità per spese',
  '    13.1 Effektive Spesen         13.1.1 Reise, Verpflegung, Übernachtung - Voyage, repas, nuitées - Viaggio, vitto, alloggio',
  '14. Weitere Gehaltsnebenleistungen            Art',
  '15. Bemerkungen         See Supplementary Sheet',
  '',
  'I   Ort und Datum - Lieu et date - Luogo e data                  Die Richtigkeit und Vollständigkeit bestätigt                           Beispiel AG',
  '     Zürich,, 05.01.2026                                         Certifié exact et complet                                               Musterstrasse 1',
].join('\n')

describe('parseChSalaryCertificateText', () => {
  it('reads the head and every Ziffer of a PDF text layer', () => {
    const read = parseChSalaryCertificateText(PDF)
    expect(read.taxYear).toBe(2025)
    expect(read.period).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    expect(read.canteen).toBe(true)
    expect(read.freeTransport).toBe(false)
    expect(read.holder).toBe('Muster Anna')
    expect(read.amounts).toEqual({
      lohn: 100000,
      gehaltsnebenleistungen: 2400,
      'unregelmaessige-leistungen': 1500,
      'andere-leistungen': -100,
      'bruttolohn-total': 103800,
      'ahv-beitraege': 6900,
      'berufliche-vorsorge': 7000,
      nettolohn: 89900,
      quellensteuer: 4321,
    })
    expect(read.pension).toEqual({ ordinary: 6000, buyIn: 1000 })
  })

  it('checks itself: Ziffer 8 is 1 to 7, Ziffer 11 is 8 less 9 and 10', () => {
    const read = parseChSalaryCertificateText(PDF)
    expect(read.checks).toEqual({ gross: 'ok', net: 'ok' })
    expect(read.fields['bruttolohn-total']).toMatchObject({ value: 103800, status: 'ok' })
  })

  it('marks the figures of a sum that does not add up for checking', () => {
    const read = parseChSalaryCertificateText(PDF.replace('6.900', '6.090'))
    expect(read.checks.net).toBe('conflict')
    for (const id of ['bruttolohn-total', 'ahv-beitraege', 'berufliche-vorsorge', 'nettolohn'] as const) {
      expect(read.fields[id]?.status).toBe('pruefen')
    }
    expect(read.fields.lohn?.status).toBe('ok')
  })

  it('never offers a negative figure as done: the mask holds none', () => {
    const read = parseChSalaryCertificateText(PDF)
    expect(read.fields['andere-leistungen']).toMatchObject({ value: -100, status: 'pruefen', reason: 'negative' })
  })

  it('reads amounts with an apostrophe and amounts OCR moved to the next line', () => {
    const ocr = [
      'D 2024 E 01.11.2024 31.12.2024',
      '1. Lohn soweit nicht unter Ziffer 2-7 aufzufuhren',
      "19'900",
      "8 Bruttolohn total / Rente = 19'900",
      '9. Beitrage AHV/IV/EO/ALV/NBUV - 1.347',
      '10 Berufliche Vorsorge 2. Saule 10.1 Ordentliche Beitrage - 1.181',
      '11. Nettolohn / Rente = 17.372',
      '12. Quellensteuerabzug -896',
    ].join('\n')
    const read = parseChSalaryCertificateText(ocr)
    expect(read.taxYear).toBe(2024)
    // The withholding tax is a deduction: its "-" is no negative figure (the adviser files 896).
    expect(read.amounts).toMatchObject({ lohn: 19900, 'bruttolohn-total': 19900, 'ahv-beitraege': 1347, 'berufliche-vorsorge': 1181, nettolohn: 17372, quellensteuer: 896 })
    expect(read.checks).toEqual({ gross: 'ok', net: 'ok' })
  })

  it('reads a noisy scan: noise above the form, a lost "D", "41." for "1.", a torn figure', () => {
    const scan = [
      '5 oe a 2 SE Soo',
      '| a xX Lohnausweis - Certificat de salaire - Certificato di salario',
      'p 2025 E 01.01.2025 31.12.2025 c X Repas a la cantine / chéques-repas',
      'H',
      'Frau',
      'Muster Anna',
      'Beispielweg 3',
      '41. Lohn _ soweit nicht unter Ziffer 2-7 aufzufthren / Rente Unicamente importi interi',
      'Salario se non da indicare sotto cifre da 2 a 7 pit sotto / Rendita 1 0 0 500',
      '2. Gehaltsnebenleistungen 2.1 Verpflegung, Unterkunft - Pension, logement - Vitto, alloggio +',
      '3. Unregelmassige Leistungen - Prestations non périodiques - Prestazioni aperiodiche Art - Genre - Genere',
      'siehe Zusatzblatt + 3000',
      '5. Beteiligungrechte gemdss Beiblatt - Droits de participation selon annexe *',
      '7. Andere Leistungen - Autres prestations - Altre prestazioni sjehe Zusatzblatt + 500',
      '8. Bruttolohn total / Rente - Salaire brut total / Rente = 104000',
      '9. Beitrage AHV/IV/EO/ALV/NBUV - Cotisations AVS/Al/APG/AC/AANP - 6500',
      '10. Berufliche Vorsorge 2,Saule — 10.1 Ordentliche Beitrage - 4500',
      'Previdenza professionale 2 pilastro 40.2 Beitrage fiir den Einkauf - Cotisations pour le rachat .',
      '11. Nettolohn / Rente - Salaire net /Rente => = 93000',
      '12. Quellensteuerabzug - Retenue de I\'impét a la source 4800',
      '13. Spesenvergiitungen - Allocations pour frais - Indennita per spese',
      '13.1 Effektive Spesen 43.4.4 Reise, Verpflegung, Ubernachtung x',
      '14, Weitere Gehaltsnebenleistungen Art',
      '15.Bemerkungen siehe Zusatzblatt',
    ].join('\n')
    const read = parseChSalaryCertificateText(scan)
    expect(read.taxYear).toBe(2025)
    expect(read.canteen).toBe(true)
    expect(read.holder).toBe('Muster Anna')
    expect(read.amounts).toEqual({
      lohn: 100500,
      'unregelmaessige-leistungen': 3000,
      'andere-leistungen': 500,
      'bruttolohn-total': 104000,
      'ahv-beitraege': 6500,
      'berufliche-vorsorge': 4500,
      nettolohn: 93000,
      quellensteuer: 4800,
    })
    expect(read.checks).toEqual({ gross: 'ok', net: 'ok' })
  })

  it('repairs a torn figure only when the form’s sum asks for exactly its digits', () => {
    const torn = PDF.replace('100.000', '1 0 0 000')
    expect(parseChSalaryCertificateText(torn).amounts.lohn).toBe(100000)
    const wrong = PDF.replace('100.000', '1 0 7 000')
    const read = parseChSalaryCertificateText(wrong)
    expect(read.amounts.lohn).toBe(0)
    expect(read.checks.gross).toBe('conflict')
  })

  it('leaves a Ziffer it cannot read empty instead of guessing', () => {
    const read = parseChSalaryCertificateText(PDF.replace(/^12\..*$/m, '12. Quellensteuerabzug'))
    expect(read.amounts.quellensteuer).toBeUndefined()
    expect(read.missing).toContain('quellensteuer')
  })
})

describe('selectChCertificateRelevantLines', () => {
  it('keeps the Ziffer rows and never the name, address, AHV number or employer', () => {
    const kept = selectChCertificateRelevantLines(PDF)
    expect(kept).toContain('Bruttolohn total')
    expect(kept).toContain('103.800')
    for (const secret of ['Muster Anna', 'Beispielweg', '756.1234', '01.02.1990', 'Beispiel AG', 'Musterstrasse']) {
      expect(kept).not.toContain(secret)
    }
  })
})

describe('applyChCertificateTextFallback', () => {
  it('fills only empty Ziffern, only with amounts printed in the text it saw, never as done', () => {
    const read = parseChSalaryCertificateText(PDF.replace(/^12\..*$/m, '12. Quellensteuerabzug'))
    const grounding = `${selectChCertificateRelevantLines(PDF)}`
    const merged = applyChCertificateTextFallback(read, { quellensteuer: 4321, lohn: 1, nettolohn: 99999 }, grounding)
    expect(merged.fields.quellensteuer).toMatchObject({ value: 4321, status: 'pruefen', reason: 'llm_suggested' })
    expect(merged.fields.lohn).toMatchObject({ value: 100000 })
    expect(merged.amounts.nettolohn).toBe(89900)
  })
})

describe('certificateHolderPerson', () => {
  const people = { A: { firstName: 'Kemal', lastName: 'Muster' }, B: { firstName: 'Anna', lastName: 'Muster' } }

  it('finds whose certificate it is by first and last name', () => {
    expect(certificateHolderPerson('Muster Anna', people)).toBe('B')
    expect(certificateHolderPerson('MUSTER KEMAL', people)).toBe('A')
  })

  it('matches names written without umlauts', () => {
    expect(certificateHolderPerson('Mueller Juergen', { A: { firstName: 'Kemal', lastName: 'Müller' }, B: { firstName: 'Jürgen', lastName: 'Müller' } })).toBe('B')
  })

  it('asks rather than guesses when the name fits nobody or both', () => {
    expect(certificateHolderPerson('Muster', people)).toBeNull()
    expect(certificateHolderPerson('Someone Else', people)).toBeNull()
    expect(certificateHolderPerson(null, people)).toBeNull()
  })
})
