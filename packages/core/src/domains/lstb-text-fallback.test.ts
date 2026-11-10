import { describe, expect, it } from 'vitest'
import {
  applyLstbTextFallback,
  capOcrSourcedExtraction,
  parseLstbTextDeterministically,
  selectLstbRelevantLines,
} from './lstb-parser'

const NO_SV = { line23: null, line23a: null, line23b: null, line25: null, line26: null, line27: null }

const CERTIFICATE_WITH_PII = [
  'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025',
  'Herrn',
  'Erika Mustermann',
  'Am Hang 5',
  '50667 Köln',
  'Identifikationsnummer: 12 345 678 901',
  'eTIN: MSTRERKA80A01X',
  'Stadtwerke Musterstadt',
  'Steuerklasse/Faktor 1',
  '3. Bruttoarbeitslohn einschl. Sachbezüge ohne 9. und 10.   48.000,00',
  '4. Einbehaltene Lohnsteuer von 3.   7.600,00',
  '22a Arbeitgeberanteil zur gesetzlichen Rentenversicherung 4.464,00',
  '23a Arbeitnehmeranteil zur gesetzlichen Rentenversicherung',
  '4.464,00',
  '25. Arbeitnehmerbeiträge zur gesetzlichen Krankenversicherung 3.650,00',
].join('\n')

describe('selectLstbRelevantLines — allowlist for the text fallback (ADR-0058)', () => {
  it('keeps only rows 3, 4, 23–27 and a synthetic year header; drops unlabeled PII blocks', () => {
    const selected = selectLstbRelevantLines(CERTIFICATE_WITH_PII)

    expect(selected.split('\n')).toEqual([
      'Lohnsteuerbescheinigung 2025',
      '3. Bruttoarbeitslohn einschl. Sachbezüge ohne 9. und 10.   48.000,00',
      '4. Einbehaltene Lohnsteuer von 3.   7.600,00',
      '23a Arbeitnehmeranteil zur gesetzlichen Rentenversicherung',
      '4.464,00',
      '25. Arbeitnehmerbeiträge zur gesetzlichen Krankenversicherung 3.650,00',
    ])
    for (const pii of ['Erika', 'Mustermann', 'Am Hang', '50667', '12 345 678 901', 'MSTRERKA', 'Stadtwerke', 'Steuerklasse', '22a']) {
      expect(selected).not.toContain(pii)
    }
  })

  it('does not carry a wrapped non-amount continuation line (e.g. an employer name)', () => {
    const selected = selectLstbRelevantLines('25. Arbeitnehmerbeiträge zur gesetzlichen Krankenversicherung\nAcme Robotics GmbH')
    expect(selected).not.toContain('Acme')
  })
})

describe('applyLstbTextFallback — never a false green (AC 4)', () => {
  it('fills only empty fields, marks them llm_suggested and never overrides a deterministic value', () => {
    const stage1 = parseLstbTextDeterministically(
      ['Lohnsteuerbescheinigung für 2025', '3. Bruttoarbeitslohn 48.000,00', '4. Lohnsteuer unleserlich'].join('\n'),
    )
    expect(stage1.fields.bruttoarbeitslohn.status).toBe('ok')
    expect(stage1.fields.lohnsteuer.value).toBeNull()

    const merged = applyLstbTextFallback(
      stage1,
      { line3Brutto: 99_999, line4Lohnsteuer: 7600, svBreakdown: NO_SV },
      'Lohnsteuerbescheinigung 2025\n3. Bruttoarbeitslohn 48.000,00\n4. Lohnsteuer 7.600,00',
    )

    expect(merged.fields.bruttoarbeitslohn.value).toBe(48000)
    expect(merged.fields.bruttoarbeitslohn.status).toBe('ok')
    expect(merged.fields.lohnsteuer).toMatchObject({ value: 7600, status: 'pruefen', reason: 'llm_suggested' })
  })

  it('drops an amount the model invented (not printed in the text it saw)', () => {
    const stage1 = parseLstbTextDeterministically('Lohnsteuerbescheinigung für 2025\n3. Bruttoarbeitslohn 48.000,00')

    const merged = applyLstbTextFallback(
      stage1,
      { line3Brutto: null, line4Lohnsteuer: 7600, svBreakdown: { ...NO_SV, line25: 3650 } },
      'Lohnsteuerbescheinigung 2025\n3. Bruttoarbeitslohn 48.000,00',
    )

    expect(merged.fields.lohnsteuer.value).toBeNull()
    expect(merged.fields.sozialversicherung.value).toBeNull()
    expect(merged.unresolvedFields).toEqual(['lohnsteuer', 'sozialversicherung'])
  })

  it('downgrades a deterministic green value when the suggestion makes the certificate contradictory', () => {
    const stage1 = parseLstbTextDeterministically('Lohnsteuerbescheinigung für 2025\n3. Bruttoarbeitslohn 10.000,00')

    const merged = applyLstbTextFallback(
      stage1,
      { line3Brutto: null, line4Lohnsteuer: 12000, svBreakdown: NO_SV },
      '3. Bruttoarbeitslohn 10.000,00\n4. Einbehaltene Lohnsteuer 12.000,00',
    )

    expect(merged.fields.bruttoarbeitslohn.status).toBe('pruefen')
    expect(merged.fields.bruttoarbeitslohn.reason).toBe('plausibility_conflict')
    expect(merged.fields.lohnsteuer.status).toBe('pruefen')
  })

  it('never produces an ok field from the fallback, whatever the model returns', () => {
    const stage1 = parseLstbTextDeterministically('')
    const text = '3. Bruttoarbeitslohn 48.000,00\n4. Lohnsteuer 7.600,00\n23a RV 4.464,00\n25. KV 3.650,00'

    const merged = applyLstbTextFallback(
      stage1,
      { line3Brutto: 48000, line4Lohnsteuer: 7600, svBreakdown: { ...NO_SV, line23a: 4464, line25: 3650 } },
      text,
    )

    for (const field of Object.values(merged.fields)) {
      expect(field.status).toBe('pruefen')
      expect(field.reason).toBe('llm_suggested')
    }
    expect(merged.fields.sozialversicherung.value).toBe(4464 + 3650)
  })
})

describe('capOcrSourcedExtraction — OCR text is never green', () => {
  it('turns every ok field into pruefen/ocr_source and keeps values and other reasons', () => {
    const clean = parseLstbTextDeterministically(
      ['Lohnsteuerbescheinigung für 2025', '3. Bruttoarbeitslohn 48.000,00', '4. Lohnsteuer 7.600,00', '23a RV 4.464,00', '25. KV 3.650,00'].join('\n'),
    )
    expect(clean.unresolvedFields).toEqual([])

    const capped = capOcrSourcedExtraction(clean)

    expect(capped.fields.bruttoarbeitslohn).toMatchObject({ value: 48000, status: 'pruefen', reason: 'ocr_source' })
    expect(capped.unresolvedFields).toEqual(['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung'])
  })
})
