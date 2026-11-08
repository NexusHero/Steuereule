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
})
