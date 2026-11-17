import { describe, expect, it } from 'vitest'
import { classifyDocumentKind } from './document-kind'

describe('classifyDocumentKind', () => {
  it('routes a Lohnsteuerbescheinigung to the lstb strategy', () => {
    expect(classifyDocumentKind('Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025\n3. Bruttoarbeitslohn 48.000,00')).toBe('lstb')
  })

  it('still recognises it when OCR lost the title but two rows survived', () => {
    expect(classifyDocumentKind('3. Bruttoarbeitslohn 48.000,00\n4. Einbehaltene Lohnsteuer 7.600,00')).toBe('lstb')
  })

  it('keeps invoices, donation receipts and a bare mention of the word on the generic path', () => {
    expect(classifyDocumentKind('Rechnung Nr. 4711\nMonitor 349,00 EUR')).toBe('auto')
    expect(classifyDocumentKind('Zuwendungsbestätigung über 120 EUR')).toBe('auto')
    expect(classifyDocumentKind('Bitte Lohnsteuerbescheinigung nachreichen')).toBe('auto')
    expect(classifyDocumentKind('')).toBe('auto')
  })

  it('routes a Swiss salary certificate to its own reader, not a mention of one', () => {
    expect(classifyDocumentKind('Lohnausweis - Certificat de salaire - Certificato di salario\n8 Bruttolohn total / Rente = 100.000')).toBe('chLohnausweis')
    expect(classifyDocumentKind('Kopie Lohnausweis angefordert, Gebühr 20 CHF')).toBe('auto')
  })

  it('routes the Swiss pension statement and the premium letter to their readers', () => {
    expect(classifyDocumentKind("Pensionskasse Beispiel\nNachweis obligatorischer und überobligatorischer Beiträge\nSparbeitrag 1'000.00 1'000.00")).toBe('chPensionskasse')
    expect(classifyDocumentKind('Bestätigung Krankentaggeld- und Nichtberufsunfallversicherung 2025\nKrankentaggeld: 412,35 CHF\nPrämien')).toBe('chPraemien')
  })
  // Real-data run, step 3a: a scanned Lohnausweis whose text was complete was filed as „sonstiges“,
  // because OCR had misread one of the three markers the rule insisted on.
  describe('tolerant detection of Swiss documents', () => {
    it('recognises a Lohnausweis by any two of its titles and two of its rows, through OCR noise', () => {
      const scan = [
        'a xX Lohnauswels - Certificat de salaire - Certificato di salario',
        '| Rentenbescheinigung - Attestation de rentes - Attestazione delle rendite',
        '8. Brutto lohn total / Rente - Salaire brut total / Rente = 100000',
        '9. Beitrage AHV/IV/EO/ALV/NBUV - Cotisations AVS/Al/APG/AC/AANP 6000',
        '11. Nettolohn / Rente - Salaire net /Rente 90000',
      ].join('\n')
      expect(classifyDocumentKind(scan)).toBe('chLohnausweis')
      // The German title lost entirely: the French and Italian titles and the form number remain.
      expect(classifyDocumentKind('Certificat de salaire - Certificato di salario\n605.040.18 Form 11\n10 Berufliche Vorsorge 2. Säule 5000\n12. Quellensteuerabzug 4000')).toBe('chLohnausweis')
    })

    it('does not take a letter that quotes a few words of the form for one', () => {
      expect(classifyDocumentKind('Ihr Lohnausweis (Certificat de salaire) folgt im Januar. Der Nettolohn wird am 25. überwiesen.')).toBe('auto')
    })

    it('routes a pension fund certificate (Vorsorgeausweis, Leistungsausweis) to the pension reader', () => {
      expect(classifyDocumentKind("Pensionskasse Beispiel\nVorsorgeausweis per 01.04.2025\nSparbeitrag Arbeitnehmer 6.00 500.00 6'000.00")).toBe('chPensionskasse')
      expect(classifyDocumentKind("Leistungsausweis per 31. März 2025\nArbeitnehmerbeitrag (pro Jahr) 4'800.00\n- davon BVG-Freizligigkeitsleistung per Stichtag 20'000.00")).toBe('chPensionskasse')
    })

    it('recognises the premium letter with ss for ß, a hyphenated Kranken-Taggeld and NBUV', () => {
      expect(classifyDocumentKind('Bestaetigung Kranken-Taggeld und NBUV 2025\nKranken-Taggeld: 412,35 CHF\nNBUV: 498,15 CHF\nPraemien des Arbeitgebers')).toBe('chPraemien')
    })

    it('recognises a health insurer’s tax statement with KVG and VVG parts', () => {
      const text = ['Steuerbescheinigung 2025', 'Prämienübersicht für die Steuererklärung 2025', "Obligatorische Krankenpflegeversicherung KVG 3'600.00", "Zusatzversicherungen VVG 1'200.00"].join('\n')
      expect(classifyDocumentKind(text)).toBe('chKrankenkasse')
    })
  })
})
