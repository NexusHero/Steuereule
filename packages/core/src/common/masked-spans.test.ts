import { describe, expect, it } from 'vitest'
import { maskedSegments, maskedSpans } from './masked-spans'
import { scrubUserMessagePii } from './pii-masking'

/** The ranges as the text they cover and what the model read instead. */
const changes = (original: string, sent: string): Array<[string, string]> => maskedSpans(original, sent).map((span) => [original.slice(span.start, span.end), span.as])

describe('where a message was changed before it went to the model', () => {
  it('is nowhere when nothing was changed', () => {
    expect(maskedSpans('Lohnt sich mein Arbeitsweg?', 'Lohnt sich mein Arbeitsweg?')).toEqual([])
    expect(maskedSpans('', '')).toEqual([])
  })

  it('finds an IBAN the masking took out, with what stands in its place', () => {
    const original = 'Meine IBAN ist DE89 3704 0044 0532 0130 00, bitte merken.'
    const sent = scrubUserMessagePii(original)
    expect(sent).not.toContain('DE89')
    expect(changes(original, sent)).toEqual([['DE89 3704 0044 0532 0130 00', '[IBAN-GESCHÜTZT]']])
  })

  it('keeps the punctuation and the label around a value out of the range', () => {
    expect(changes('IBAN:DE89370400440532013000, danke', 'IBAN:[IBAN-GESCHÜTZT], danke')).toEqual([['DE89370400440532013000', '[IBAN-GESCHÜTZT]']])
  })

  it('finds several changes in one message, each on its own', () => {
    const original = 'Ich bin Mila Sommer, meine Mail ist mila@beispiel.de und meine Steuer-ID 12 345 678 901.'
    const sent = scrubUserMessagePii(original, ['Mila', 'Sommer'])
    const found = changes(original, sent)
    expect(found.map(([was]) => was)).toEqual(expect.arrayContaining(['mila@beispiel.de', '12 345 678 901']))
    expect(found.some(([was]) => was.includes('Mila'))).toBe(true)
    // Nothing that was kept is inside a range.
    for (const [was] of found) expect(was).not.toMatch(/meine Mail ist|und meine Steuer-ID/)
  })

  it('names what a name was turned into when it is no stand-in', () => {
    expect(changes('Anna hat 30 Tage Homeoffice.', 'Person B hat 30 Tage Homeoffice.')).toEqual([['Anna', 'Person B']])
  })

  it('finds a change at the very start and at the very end', () => {
    expect(changes('DE89370400440532013000 ist meine IBAN', '[IBAN-GESCHÜTZT] ist meine IBAN')).toEqual([['DE89370400440532013000', '[IBAN-GESCHÜTZT]']])
    expect(changes('Meine Mail: mila@beispiel.de', 'Meine Mail: [KONTAKT-GESCHÜTZT]')).toEqual([['mila@beispiel.de', '[KONTAKT-GESCHÜTZT]']])
  })

  it('every range lies inside the original, in order and without overlap', () => {
    const original = 'Tel. 0221 1234567, Mail a@b.de, IBAN DE89 3704 0044 0532 0130 00, geboren am 03.05.1990 in Köln.'
    const spans = maskedSpans(original, scrubUserMessagePii(original))
    expect(spans.length).toBeGreaterThanOrEqual(3)
    let at = 0
    for (const span of spans) {
      expect(span.start).toBeGreaterThanOrEqual(at)
      expect(span.end).toBeGreaterThan(span.start)
      expect(span.end).toBeLessThanOrEqual(original.length)
      at = span.end
    }
  })

  it('takes a very long changed middle as one range instead of aligning it', () => {
    const original = `Anfang ${'wort '.repeat(2_100)}Ende`
    const sent = `Anfang ${'anders '.repeat(2_100)}Ende`
    const spans = maskedSpans(original, sent)
    expect(spans).toHaveLength(1)
    expect(original.slice(0, spans[0]!.start)).toBe('Anfang ')
    expect(original.slice(spans[0]!.end)).toBe(' Ende')
  })
})

describe('a message cut at its changed ranges', () => {
  it('gives the pieces in order, the changed ones with what the model read', () => {
    const text = 'Meine IBAN ist DE89, danke.'
    expect(maskedSegments(text, [{ start: 15, end: 19, as: '[IBAN-GESCHÜTZT]' }])).toEqual([{ text: 'Meine IBAN ist ' }, { text: 'DE89', as: '[IBAN-GESCHÜTZT]' }, { text: ', danke.' }])
  })

  it('is the whole text without ranges', () => {
    expect(maskedSegments('Hallo', [])).toEqual([{ text: 'Hallo' }])
    expect(maskedSegments('Hallo', undefined)).toEqual([{ text: 'Hallo' }])
    expect(maskedSegments('', null)).toEqual([])
  })

  it('leaves out a range that does not fit the text, so a stale one never garbles it', () => {
    const text = 'Kurzer Text'
    expect(maskedSegments(text, [{ start: 7, end: 99, as: 'x' }, { start: 3, end: 2, as: 'x' }, { start: 0.5, end: 2, as: 'x' }])).toEqual([{ text }])
    expect(maskedSegments(text, [{ start: 0, end: 6, as: 'a' }, { start: 4, end: 8, as: 'b' }]).map((segment) => segment.text).join('')).toBe(text)
  })
})
