import { describe, expect, it } from 'vitest'
import { MAX_SPOKEN_CHUNK, speechChunks, speechText } from './speechText'

describe('an answer as text for a voice', () => {
  it('drops the Markdown markers and ends every line with a pause', () => {
    const answer = ['## Kurz gesagt', '', 'Die App schätzt **856 €** bis *986 €*.', '', '- Homeoffice: 210 Tage', '1. Spenden prüfen', '', '---'].join('\n')
    expect(speechText(answer, 'de')).toBe('Kurz gesagt. Die App schätzt 856 € bis 986 €. Homeoffice: 210 Tage. 1. Spenden prüfen.')
  })

  it('says a citation as its paragraph, once, with the abbreviations as words', () => {
    expect(speechText('Das zählt (§ 9 Abs. 1 EStG [estg-9-1]).', 'de')).toBe('Das zählt (Paragraf 9 Absatz 1 Einkommensteuergesetz).')
    expect(speechText('Siehe [estg-4-5-6c], z. B. 6 € × 210 Tage.', 'de')).toBe('Siehe Paragraf 4 Absatz 5 Nummer 6c Einkommensteuergesetz, zum Beispiel 6 € mal 210 Tage.')
    expect(speechText('Einspruch nach [ao-355].', 'de')).toBe('Einspruch nach Paragraf 355 Absatz 1 Abgabenordnung.')
  })

  it('leaves code blocks out, keeps a link by its label and a table by its cells', () => {
    const answer = ['Schau hier: [BMF](https://www.bundesfinanzministerium.de/x) und https://example.org/y', '```', 'const x = 1', '```', '| Posten | Betrag |', '| --- | --- |', '| Spenden | 300 € |'].join('\n')
    expect(speechText(answer, 'de')).toBe('Schau hier: BMF und. Posten, Betrag. Spenden, 300 €.')
  })

  it('does not turn German abbreviations into words for another language', () => {
    expect(speechText('See § 9 Abs. 1 EStG.', 'en')).toBe('See § 9 Abs. 1 EStG.')
  })

  it('cuts the text into pieces a voice takes whole, losing nothing', () => {
    const sentence = 'Das ist ein Satz mit einigen Wörtern darin. '
    const text = sentence.repeat(12).trim()
    const chunks = speechChunks(text)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= MAX_SPOKEN_CHUNK)).toBe(true)
    expect(chunks.join(' ')).toBe(text)
    const long = 'wort '.repeat(100).trim()
    expect(speechChunks(long).every((chunk) => chunk.length <= MAX_SPOKEN_CHUNK)).toBe(true)
    expect(speechChunks(long).join(' ')).toBe(long)
    expect(speechChunks('')).toEqual([])
  })
})
