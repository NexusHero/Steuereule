import { describe, expect, it } from 'vitest'
import { MAX_SPOKEN_CHUNK, sentencesOf, speechChunks, speechText } from './speechText'

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

  it('reads brackets that are no link as they stand, and gets through a line of nothing but brackets', () => {
    expect(speechText('Bild: ![Beleg](https://example.org/a.png), offen [a [BMF](https://example.org) und [ohne Ende', 'de')).toBe('Bild: Beleg, offen [a BMF und [ohne Ende.')
    const brackets = '['.repeat(20_000)
    expect(speechText(brackets, 'de')).toBe(`${brackets}.`)
    expect(speechText(`${brackets}BMF](https://example.org) ](x)`, 'de')).toBe(`${brackets.slice(1)}BMF ](x).`)
    expect(speechText(`${' '.repeat(20_000)}|${','.repeat(20_000)}`, 'de')).toBe('')
  })

  it('keeps a paragraph the sentence names for another reason next to a different citation', () => {
    expect(speechText('Erst § 9 Abs. 1 EStG, dann [estg-10b].', 'de')).toBe('Erst Paragraf 9 Absatz 1 Einkommensteuergesetz, dann Paragraf 10b Einkommensteuergesetz.')
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

describe('cutting text into sentences', () => {
  it('ends a sentence at a mark that is followed by a blank, and keeps the blank with it', () => {
    expect(sentencesOf('Eins. Zwei! Drei? Vier: fünf')).toEqual(['Eins. ', 'Zwei! ', 'Drei? ', 'Vier: ', 'fünf'])
  })

  it('keeps a figure and a date whole', () => {
    expect(sentencesOf('Das sind 3.030 Euro. Fällig am 3. Mai.')).toEqual(['Das sind 3.030 Euro. ', 'Fällig am 3. Mai.'])
  })

  it('is nothing for no text', () => {
    expect(sentencesOf('')).toEqual([])
  })
})
