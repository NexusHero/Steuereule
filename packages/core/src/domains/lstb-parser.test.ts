import { describe, expect, it } from 'vitest'
import {
  evaluateLstbExtraction,
  extractLstbTaxYear,
  parseGermanOcrAmount,
  parseLstbTextDeterministically,
} from './lstb-parser'

describe('parseGermanOcrAmount', () => {
  it('parses standard German, spaced thousands, and OCR dot-decimal amounts', () => {
    expect(parseGermanOcrAmount('54.320,00')).toBe(54320)
    expect(parseGermanOcrAmount('4.836,40 €')).toBe(4836.4)
    expect(parseGermanOcrAmount('48 000,50 EUR')).toBe(48000.5)
    expect(parseGermanOcrAmount('5.051.76')).toBe(5051.76)
    expect(parseGermanOcrAmount('48.000.00')).toBe(48000)
    expect(parseGermanOcrAmount('48.000')).toBe(48000)
    expect(parseGermanOcrAmount('1250')).toBe(1250)
    expect(parseGermanOcrAmount('0,00')).toBe(0)
  })

  it('rejects empty strings, percentages, dates, and gibberish', () => {
    expect(parseGermanOcrAmount('')).toBeNull()
    expect(parseGermanOcrAmount('14,6 %')).toBeNull()
    expect(parseGermanOcrAmount('01.01.2025')).toBeNull()
    expect(parseGermanOcrAmount('abc')).toBeNull()
  })
})

describe('extractLstbTaxYear', () => {
  it('prefers explicit LStB header/calendar year over print date and birthdate', () => {
    const text = [
      'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2024',
      'Geburtsdatum: 14.03.1988',
      'Druckdatum: 15.01.2026',
    ].join('\n')
    expect(extractLstbTaxYear(text)).toBe(2024)
  })

  it('extracts year from Bescheinigungszeitraum or fallback non-date lines', () => {
    expect(extractLstbTaxYear('Bescheinigungszeitraum 01.01.2025 - 31.12.2025')).toBe(2025)
    // A bare year (form version, print date) is not evidence of the certificate year.
    expect(extractLstbTaxYear('Abrechnung\n2025\nBrutto 40000')).toBeNull()
    expect(extractLstbTaxYear('Formularversion 2024\nBruttoarbeitslohn 40.000,00')).toBeNull()
    expect(extractLstbTaxYear('Geburtsdatum 01.01.2024\nohne Jahr')).toBeNull()
  })
})

describe('parseLstbTextDeterministically', () => {
  // #450 D3: tesseract read the decimal comma of a dimmed photo as a low quote with a space
  // ("5.051 ‚76"); the line was dropped and the SV sum came out 5.051 € short.
  it('reads an OCR decimal comma that came out as a quote or with a space before it', () => {
    const ocr = [
      'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025',
      '23a Arbeitnehmeranteil zur gesetzlichen Rentenversicherung 5.051 ‚76',
      "25. Arbeitnehmerbeiträge zur gesetzlichen Krankenversicherung 4.182 ,64",
      "26. Arbeitnehmerbeiträge zur sozialen Pflegeversicherung 977'76",
      '27. Arbeitnehmerbeiträge zur Arbeitslosenversicherung 706,16',
    ].join('\n')
    const res = parseLstbTextDeterministically(ocr)
    expect(res.fields.sozialversicherung.calculation).toEqual([
      { line: '23a', amount: 5051.76 },
      { line: '25', amount: 4182.64 },
      { line: '26', amount: 977.76 },
      { line: '27', amount: 706.16 },
    ])
    expect(res.fields.sozialversicherung.value).toBe(10918)
  })

  it('extracts a clean official German LStB deterministically without needing LLM fallback', () => {
    const cleanLstb = [
      'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025',
      'Arbeitgeber: Rheinpharma AG',
      'Steuerklasse: I',
      '3. Bruttoarbeitslohn einschl. Sachbezüge ohne 9. und 10.    54.320,00',
      '4. Einbehaltene Lohnsteuer von 3.                           9.810,00',
      '5. Einbehaltener Solidaritätszuschlag                         210,00',
      '22a Arbeitgeberanteil zur gesetzlichen Rentenversicherung   5.051,76',
      '23a Arbeitnehmeranteil zur gesetzlichen Rentenversicherung  5.051,76',
      '25. Arbeitnehmerbeiträge zur gesetzlichen Krankenversicherung 4.182,64',
      '26. Arbeitnehmerbeiträge zur sozialen Pflegeversicherung       977,76',
      '27. Arbeitnehmerbeiträge zur Arbeitslosenversicherung          706,16',
    ].join('\n')

    const res = parseLstbTextDeterministically(cleanLstb)
    expect(res.taxYear).toBe(2025)
    expect(res.unresolvedFields).toEqual([])
    expect(res.fields.bruttoarbeitslohn).toEqual({
      value: 54320,
      status: 'ok',
      sourceLines: ['3'],
      calculation: [{ line: '3', amount: 54320 }],
      reason: null,
    })
    expect(res.fields.lohnsteuer).toEqual({
      value: 9810,
      status: 'ok',
      sourceLines: ['4'],
      calculation: [{ line: '4', amount: 9810 }],
      reason: null,
    })
    // Sum: 5051.76 + 4182.64 + 977.76 + 706.16 = 10918.32 -> 10918 €
    // Does NOT add line 22a (employer share)!
    expect(res.fields.sozialversicherung.value).toBe(10918)
    expect(res.fields.sozialversicherung.status).toBe('ok')
    expect(res.fields.sozialversicherung.sourceLines).toEqual(['23a', '25', '26', '27'])
    expect(res.fields.sozialversicherung.reason).toBeNull()
    expect(res.fields.sozialversicherung.calculation).toEqual([
      { line: '23a', amount: 5051.76 },
      { line: '25', amount: 4182.64 },
      { line: '26', amount: 977.76 },
      { line: '27', amount: 706.16 },
    ])
    // Zero PII keys exist in result
    expect(JSON.stringify(res)).not.toContain('Rheinpharma')
    expect(JSON.stringify(res)).not.toContain('Steuerklasse')
  })

  it('handles wrapped multiline descriptions and line 23 + 24 AG exclusion', () => {
    const multiline = [
      'Lohnsteuerbescheinigung für das Kalenderjahr 2024',
      '3. Bruttoarbeitslohn einschl. Sachbezüge',
      'ohne 9. und 10.',
      '42.000,00 EUR',
      '4. Einbehaltene Lohnsteuer von 3.',
      '6.450,00 EUR',
      '23. Arbeitnehmeranteil zur Rentenversicherung',
      '3.906,00',
      '24a Steuerfreie Arbeitgeberzuschüsse zur Krankenversicherung 3.000,00',
      '25. Arbeitnehmerbeiträge zur gesetzlichen Krankenversicherung',
      '3.255,00',
    ].join('\n')

    const res = parseLstbTextDeterministically(multiline)
    expect(res.taxYear).toBe(2024)
    expect(res.unresolvedFields).toEqual([])
    expect(res.fields.bruttoarbeitslohn.value).toBe(42000)
    expect(res.fields.lohnsteuer.value).toBe(6450)
    expect(res.fields.sozialversicherung.value).toBe(7161) // 3906 + 3255, ignores line 24a!
    expect(res.fields.sozialversicherung.sourceLines).toEqual(['23', '25'])
  })

  it('flags plausibility conflict when Lohnsteuer > Brutto and requests LLM fallback', () => {
    const implausible = [
      'Lohnsteuerbescheinigung für 2025',
      '3. Bruttoarbeitslohn 12.000,00',
      '4. Einbehaltene Lohnsteuer 15.000,00',
      '23a Rentenversicherung 1.116,00',
      '25. Krankenversicherung 930,00',
    ].join('\n')

    const res = parseLstbTextDeterministically(implausible)
    expect(res.unresolvedFields.length).toBeGreaterThan(0)
    expect(res.fields.lohnsteuer.status).toBe('pruefen')
    expect(res.fields.lohnsteuer.reason).toBe('plausibility_conflict')
    expect(res.fields.bruttoarbeitslohn.status).toBe('pruefen')
    expect(res.fields.bruttoarbeitslohn.reason).toBe('plausibility_conflict')
  })

  it('marks single-line SV as partial_sv_lines (pruefen) and missing fields as missing', () => {
    const partial = [
      'Lohnsteuerbescheinigung für 2025',
      '3. Bruttoarbeitslohn 40.000,00',
      '23a Rentenversicherung 3.720,00',
    ].join('\n')

    const res = parseLstbTextDeterministically(partial)
    expect(res.unresolvedFields.length).toBeGreaterThan(0)
    expect(res.fields.bruttoarbeitslohn.status).toBe('ok')
    expect(res.fields.lohnsteuer).toEqual({
      value: null,
      status: 'pruefen',
      sourceLines: ['4'],
      calculation: [],
      reason: 'missing',
    })
    expect(res.fields.sozialversicherung.status).toBe('pruefen')
    expect(res.fields.sozialversicherung.reason).toBe('partial_sv_lines')
  })

  it('evaluateLstbExtraction marks unreadableFields and SV > Brutto as pruefen even on Stage 2 output', () => {
    const res = evaluateLstbExtraction({
      taxYear: 2025,
      line3Brutto: 10000,
      line4Lohnsteuer: 1200,
      svBreakdown: {
        line23: null,
        line23a: 8000,
        line23b: 500,
        line25: 3000,
        line26: null,
        line27: null,
      },
      unreadableFields: ['lohnsteuer'],
    })

    expect(res.unresolvedFields.length).toBeGreaterThan(0)
    expect(res.fields.lohnsteuer.status).toBe('pruefen')
    expect(res.fields.lohnsteuer.reason).toBe('unreadable')
    expect(res.fields.sozialversicherung.value).toBe(11500)
    expect(res.fields.sozialversicherung.status).toBe('pruefen')
    expect(res.fields.sozialversicherung.reason).toBe('plausibility_conflict')
  })

  it('handles keyword fallback rows, 23b, empty input, and unreadable null vs non-null fields', () => {
    expect(parseLstbTextDeterministically('').taxYear).toBeNull()
    expect(extractLstbTaxYear('')).toBeNull()

    const keywordsOnly = [
      'Lohnsteuerbescheinigung für 2025',
      'Bruttoarbeitslohn 36.000,00 EUR',
      'Einbehaltene Lohnsteuer 5.100,00',
      'Arbeitnehmeranteil Rentenversicherung 3.000,00',
      'berufsständische Arbeitnehmer 500,00',
      'Arbeitnehmerbeiträge zur gesetzlichen Krankenversicherung 2.600,00',
      'Arbeitnehmerbeiträge zur sozialen Pflegeversicherung 600,00',
      'Arbeitnehmerbeiträge zur Arbeitslosenversicherung 450,00',
      '22b Arbeitgeberzuschuss 400,00',
    ].join('\n')

    const parsed = parseLstbTextDeterministically(keywordsOnly)
    expect(parsed.unresolvedFields).toEqual([])
    expect(parsed.fields.bruttoarbeitslohn.value).toBe(36000)
    expect(parsed.fields.lohnsteuer.value).toBe(5100)
    expect(parsed.fields.sozialversicherung.value).toBe(7150)
    expect(parsed.fields.sozialversicherung.sourceLines).toEqual(['23a', '23b', '25', '26', '27'])

    const unreadableNonNull = evaluateLstbExtraction({
      taxYear: 2010,
      line3Brutto: 30000,
      line4Lohnsteuer: -5,
      svBreakdown: { line23: null, line23a: 1000, line23b: null, line25: 1000, line26: null, line27: null },
      unreadableFields: ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung'],
    })
    expect(unreadableNonNull.taxYear).toBeNull()
    expect(unreadableNonNull.fields.bruttoarbeitslohn.reason).toBe('unreadable')
    expect(unreadableNonNull.fields.lohnsteuer.reason).toBe('unreadable')
    expect(unreadableNonNull.fields.sozialversicherung.reason).toBe('unreadable')

    const missingUnreadable = evaluateLstbExtraction({
      taxYear: 2025,
      line3Brutto: null,
      line4Lohnsteuer: null,
      svBreakdown: { line23: null, line23a: null, line23b: null, line25: null, line26: null, line27: null },
      unreadableFields: ['bruttoarbeitslohn', 'sozialversicherung'],
    })
    expect(missingUnreadable.fields.bruttoarbeitslohn.reason).toBe('unreadable')
    expect(missingUnreadable.fields.sozialversicherung.reason).toBe('unreadable')
  })

  it('flags conflicting duplicate lines across all LStB rows and breaks lookahead on next row header', () => {
    const conflicts = [
      'Lohnsteuerbescheinigung für 2025',
      '3. Bruttoarbeitslohn',
      '4. Einbehaltene Lohnsteuer 4.000,00',
      '4. Einbehaltene Lohnsteuer 4.500,00',
      '3. Bruttoarbeitslohn 30.000,00',
      '3. Bruttoarbeitslohn 32.000,00',
      '23a Rentenversicherung 1.000,00',
      '23a Rentenversicherung 1.200,00',
      '23b Berufsständisch 200,00',
      '23b Berufsständisch 300,00',
      '23. Rentenversicherung 500,00',
      '23. Rentenversicherung 600,00',
      '25. Krankenversicherung 800,00',
      '25. Krankenversicherung 900,00',
      '26. Pflegeversicherung 200,00',
      '26. Pflegeversicherung 250,00',
      '27. Arbeitslosenversicherung 150,00',
      '27. Arbeitslosenversicherung 180,00',
    ].join('\n')

    const parsed = parseLstbTextDeterministically(conflicts)
    expect(parsed.fields.bruttoarbeitslohn.reason).toBe('unreadable')
    expect(parsed.fields.lohnsteuer.reason).toBe('unreadable')
    expect(parsed.fields.sozialversicherung.reason).toBe('unreadable')
  })
})
