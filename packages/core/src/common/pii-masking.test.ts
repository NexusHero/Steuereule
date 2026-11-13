import { describe, expect, it } from 'vitest'
import {
  maskTaxId,
  maskIban,
  maskStreet,
  maskHouseNumber,
  maskName,
  maskEmployer,
  maskPhone,
  scrubUserMessagePii,
  replaceNamesWith,
  scrubDocumentTextPii,
} from './pii-masking'

describe('PII Masking (ADR-0052 §8 — Personenbezogene Daten: schreiben ja, lesen maskiert)', () => {
  describe('maskTaxId', () => {
    it('returns null for null or undefined', () => {
      expect(maskTaxId(null)).toBeNull()
      expect(maskTaxId(undefined)).toBeNull()
    })

    it('masks 11-digit Steuer-ID keeping first 2 and last 2 characters', () => {
      expect(maskTaxId('12345678901')).toBe('12*******01')
      expect(maskTaxId('12 345 678 901')).toBe('12*******01')
    })

    it('masks short or irregular tax IDs', () => {
      expect(maskTaxId('12345')).toBe('1***5')
      expect(maskTaxId('12')).toBe('**')
    })
  })

  describe('maskIban', () => {
    it('returns null for null or undefined', () => {
      expect(maskIban(null)).toBeNull()
      expect(maskIban(undefined)).toBeNull()
    })

    it('masks IBAN preserving country code and last 2 digits', () => {
      expect(maskIban('DE89370400440532013000')).toBe('DE** **** **** **** **** 00')
      expect(maskIban('DE89 3704 0044 0532 0130 00')).toBe('DE** **** **** **** **** 00')
      expect(maskIban('CH9300762011623852957')).toBe('CH** **** **** **** ***5 7')
    })
  })

  describe('maskStreet', () => {
    it('returns null for null or undefined', () => {
      expect(maskStreet(null)).toBeNull()
      expect(maskStreet(undefined)).toBeNull()
    })

    it('masks street name keeping first letter and common suffix if present', () => {
      expect(maskStreet('Hauptstrasse')).toBe('H***')
      expect(maskStreet('Grenzacherstrasse')).toBe('G***')
    })
  })

  describe('maskHouseNumber', () => {
    it('masks house number', () => {
      expect(maskHouseNumber('100')).toBe('***')
      expect(maskHouseNumber('42a')).toBe('***')
      expect(maskHouseNumber(null)).toBeNull()
    })
  })

  describe('maskName', () => {
    it('returns null for null or undefined', () => {
      expect(maskName(null)).toBeNull()
      expect(maskName(undefined)).toBeNull()
    })

    it('masks first and last names into initial + asterisks', () => {
      expect(maskName('Markus Brenner')).toBe('M*** B***')
      expect(maskName('Lena Hoffmann')).toBe('L*** H***')
      expect(maskName('Sabine')).toBe('S***')
    })
  })

  describe('maskEmployer', () => {
    it('returns null for null or undefined', () => {
      expect(maskEmployer(null)).toBeNull()
      expect(maskEmployer(undefined)).toBeNull()
    })

    it('masks employer company name', () => {
      expect(maskEmployer('Rheinpharma AG')).toBe('R*** AG')
      expect(maskEmployer('Novartis Pharma GmbH')).toBe('N*** GmbH')
      expect(maskEmployer('Google Germany GmbH')).toBe('G*** GmbH')
      expect(maskEmployer('Acme Corp')).toBe('A*** Corp')
    })
  })

  describe('maskPhone', () => {
    it('masks telephone number', () => {
      expect(maskPhone('07621 123456')).toBe('07621 ***')
      expect(maskPhone('+49 170 1234567')).toBe('+49 ***')
      expect(maskPhone(null)).toBeNull()
    })
  })

  describe('scrubUserMessagePii', () => {
    it('replaces known profile names, tax IDs, IBANs, tax numbers, emails, and phones while preserving euro amounts', () => {
      const input =
        'Hallo, ich bin Markus Brenner (Steuer-ID 12 345 678 901, Steuernr 09/123/45678, IBAN DE89 3704 0044 0532 0130 00, Mail markus@example.com, Tel +49 170 1234567) und habe 1.250 € Fortbildung bezahlt.'
      const output = scrubUserMessagePii(input, ['Markus', 'Brenner', 'Lena'])
      expect(output).not.toContain('Markus')
      expect(output).not.toContain('Brenner')
      expect(output).not.toContain('12 345 678 901')
      expect(output).not.toContain('09/123/45678')
      expect(output).not.toContain('DE89 3704')
      expect(output).not.toContain('markus@example.com')
      expect(output).not.toContain('1234567')
      expect(output).toContain('[MANDANT]')
      expect(output).toContain('[STEUER-ID-GESCHÜTZT]')
      expect(output).toContain('[STEUERNR-GESCHÜTZT]')
      expect(output).toContain('[IBAN-GESCHÜTZT]')
      expect(output).toContain('[KONTAKT-GESCHÜTZT]')
      expect(output).toContain('1.250 € Fortbildung')
    })
  })

  describe('scrubDocumentTextPii', () => {
    it('returns empty string for empty input', () => {
      expect(scrubDocumentTextPii('')).toBe('')
    })

    it('removes eTIN, Transferticket, employer company names, addresses, birthdates, Steuerklasse, SV-Nr, and Steuer-ID while preserving LStB numeric tax lines', () => {
      const doc = [
        'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025',
        'Rheinpharma AG',
        'Arbeitgeber: Musterfirma GmbH',
        'Musterstraße 12a',
        '12345 Musterstadt',
        'Name, Vorname: Brenner, Markus',
        'Geburtsdatum: 14.03.1988',
        'eTIN: BRENNM19880314',
        'Identifikationsnummer: 12 345 678 901',
        'Transferticket: et2025011598765432',
        'Steuerklasse: I / 1,0',
        'Sozialversicherungsnummer: 12 140388 B 019',
        '3. Bruttoarbeitslohn einschl. Sachbezüge ohne 9. und 10.    54.320,00',
        '4. Einbehaltene Lohnsteuer von 3.                           9.810,00',
        '23a Arbeitnehmeranteil zur gesetzlichen Rentenversicherung   5.051,76',
        '25. Arbeitnehmerbeiträge zur gesetzlichen Krankenversicherung 4.182,64',
        '26. Arbeitnehmerbeiträge zur sozialen Pflegeversicherung       977,76',
        '27. Arbeitnehmerbeiträge zur Arbeitslosenversicherung          706,16',
      ].join('\n')

      const scrubbed = scrubDocumentTextPii(doc, ['Markus Brenner'])
      expect(scrubbed).not.toContain('Rheinpharma AG')
      expect(scrubbed).not.toContain('Musterfirma GmbH')
      expect(scrubbed).not.toContain('Musterstraße 12a')
      expect(scrubbed).not.toContain('12345 Musterstadt')
      expect(scrubbed).not.toContain('Brenner')
      expect(scrubbed).not.toContain('Markus')
      expect(scrubbed).not.toContain('14.03.1988')
      expect(scrubbed).not.toContain('BRENNM19880314')
      expect(scrubbed).not.toContain('12 345 678 901')
      expect(scrubbed).not.toContain('et2025011598765432')
      expect(scrubbed).not.toContain('Steuerklasse: I')
      expect(scrubbed).not.toContain('12 140388 B 019')

      // Preserves LStB year and numeric lines!
      expect(scrubbed).toContain('Lohnsteuerbescheinigung für 2025')
      expect(scrubbed).toContain('3. Bruttoarbeitslohn')
      expect(scrubbed).toContain('54.320,00')
      expect(scrubbed).toContain('4. Einbehaltene Lohnsteuer')
      expect(scrubbed).toContain('9.810,00')
      expect(scrubbed).toContain('23a Arbeitnehmeranteil')
      expect(scrubbed).toContain('5.051,76')
      expect(scrubbed).toContain('27. Arbeitnehmerbeiträge')
      expect(scrubbed).toContain('706,16')
    })

    it('preserves 5-digit euro amounts like 50000 Bruttoarbeitslohn (does not mistake for PLZ)', () => {
      const doc = '3. Bruttoarbeitslohn\n50000 Bruttoarbeitslohn EUR'
      const scrubbed = scrubDocumentTextPii(doc)
      expect(scrubbed).toContain('50000 Bruttoarbeitslohn')
    })
  })
})

describe('replaceNamesWith', () => {
  it('puts the handle in place of the spouse’s name, also with umlauts at the start', () => {
    expect(replaceNamesWith('Gülay fährt 24 km, Ümit nicht. Gülays Lohn', ['Gülay', 'Ümit Kaya'], 'Person B')).toBe('Person B fährt 24 km, Person B nicht. Person B Lohn')
  })
})

describe('names in the genitive (real-case test)', () => {
  it('replaces „Gülays Konto“ like „Gülay“, and leaves longer words alone', () => {
    expect(replaceNamesWith('Gülays Konto und Gülay’s Arbeitgeber', ['Gülay'], 'Person B')).toBe('Person B Konto und Person B Arbeitgeber')
    expect(replaceNamesWith('Gulaysse', ['Gulay'], 'X')).toBe('Gulaysse')
  })
})

