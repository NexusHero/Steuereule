import { ADVISOR_LEGAL_SOURCES, type OwlSourceId } from '@steuereule/core'

/** The longest piece handed to the voice at once: some browsers stop a long utterance midway. */
export const MAX_SPOKEN_CHUNK = 220

const CITATION = /\[(estg-[a-z0-9-]+|ao-355)\](?!\()/g

/** What a German voice would otherwise spell out or skip. Order matters: „§§“ before „§“. */
const GERMAN_SPOKEN: ReadonlyArray<readonly [RegExp, string]> = [
  [/§§\s*/g, 'Paragrafen '],
  [/§\s*/g, 'Paragraf '],
  [/\bAbs\.\s*/g, 'Absatz '],
  [/\bNr\.\s*/g, 'Nummer '],
  [/\bS\.\s*(?=\d)/g, 'Satz '],
  [/\bz\.\s?B\.\s*/g, 'zum Beispiel '],
  [/\bggf\.\s*/g, 'gegebenenfalls '],
  [/\bbzw\.\s*/g, 'beziehungsweise '],
  [/\bca\.\s*/g, 'circa '],
  [/\bEStG\b/g, 'Einkommensteuergesetz'],
  [/\bAO\b/g, 'Abgabenordnung'],
  [/×/g, ' mal '],
]

/** `[label](address)` and `![label](address)` as their label. One pass: every character is looked at a fixed number of times. */
function linkLabels(text: string): string {
  let out = ''
  let at = 0
  for (;;) {
    const mid = text.indexOf('](', at)
    const close = mid === -1 ? -1 : text.indexOf(')', mid)
    // The label starts at the last opening bracket before „](“, so a bracket left open earlier stays as text.
    const open = close === -1 ? -1 : text.lastIndexOf('[', mid)
    if (close === -1) return out + text.slice(at)
    if (open < at) {
      // „](“ without a bracket that opens it: no link, keep it and look on behind it.
      out += text.slice(at, mid + 2)
      at = mid + 2
      continue
    }
    const start = open > at && text[open - 1] === '!' ? open - 1 : open
    out += text.slice(at, start) + text.slice(open + 1, mid)
    at = close + 1
  }
}

const EDGE = new Set([',', ' '])
/** `text` without the commas and spaces at its ends. */
function trimEdges(text: string): string {
  let from = 0
  let to = text.length
  while (from < to && EDGE.has(text[from] ?? '')) from += 1
  while (to > from && EDGE.has(text[to - 1] ?? '')) to -= 1
  return text.slice(from, to)
}

/** One Markdown line as it is said: no markers, a full stop where the line ended without one. */
function spokenLine(line: string): string {
  const marked = linkLabels(line.replace(/\s+/g, ' ').trim())
    .replace(/^#{1,6} /, '')
    .replace(/^> ?/, '')
    .replace(/^[-*+] /, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/(\*\*|__|~~)/g, '')
    .replace(/(^|[ (])[*_](?=\S)/g, '$1')
    .replace(/(?<=\S)[*_](?=[ .,;:!?)]|$)/g, '')
    .replace(/`/g, '')
  // A table row by its cells.
  const text = trimEdges(marked.split('|').map((cell) => cell.trim()).join(', '))
  if (text === '' || /^[-:, ]+$/.test(text)) return ''
  return /[.!?:…]$/.test(text) ? text : `${text}.`
}

/**
 * An answer of the owl as text for a voice: the Markdown markers gone, code blocks left out, a citation
 * said as its paragraph (once, where the sentence already names it), and for German the legal
 * abbreviations spoken as words.
 */
export function speechText(markdown: string, language: string): string {
  const withoutCode = markdown.replace(/(`{3,}|~{3,})[\s\S]*?\1/g, '\n')
  const cited = withoutCode.replace(CITATION, (whole, id: string, offset: number, all: string) => {
    const paragraph = ADVISOR_LEGAL_SOURCES[id as OwlSourceId]?.paragraph
    if (paragraph === undefined) return whole
    // „(§ 9 Abs. 1 EStG [estg-9-1])“: the sentence already names the paragraph its chip stands for.
    return all.slice(Math.max(0, offset - paragraph.length - 2), offset).trimEnd().endsWith(paragraph) ? '' : paragraph
  })
  const lines = cited.split('\n').map(spokenLine).filter((line) => line !== '')
  let text = lines.join(' ')
  if (language.toLowerCase().startsWith('de')) for (const [pattern, spoken] of GERMAN_SPOKEN) text = text.replace(pattern, spoken)
  return text.replace(/\s+/g, ' ').replace(/ ([.,;:!?)])/g, '$1').replace(/\( /g, '(').trim()
}

/**
 * `text` cut into sentences, each with the blanks after it. A sentence ends at `.`, `!`, `?` or `:` followed by
 * a blank; a dot after a digit ends none, so "3.030 Euro" and "am 3. Mai" stay in one piece.
 */
export function sentencesOf(text: string): string[] {
  const isBlank = (index: number): boolean => /\s/.test(text[index] ?? '')
  const endsSentence = (index: number): boolean => {
    const char = text[index]!
    if (!'.!?:'.includes(char) || !isBlank(index + 1)) return false
    return !(char === '.' && /\d/.test(text[index - 1] ?? ''))
  }
  const sentences: string[] = []
  let start = 0
  let at = 0
  while (at < text.length) {
    if (!endsSentence(at)) {
      at += 1
      continue
    }
    at += 1
    while (at < text.length && isBlank(at)) at += 1
    sentences.push(text.slice(start, at))
    start = at
  }
  if (start < text.length) sentences.push(text.slice(start))
  return sentences
}

/** `text` in pieces a voice takes whole: sentences, joined while they fit, a long one cut at a space. */
export function speechChunks(text: string, max: number = MAX_SPOKEN_CHUNK): string[] {
  const sentences = sentencesOf(text)
  const chunks: string[] = []
  let current = ''
  const flush = (): void => {
    if (current.trim() !== '') chunks.push(current.trim())
    current = ''
  }
  for (const sentence of sentences) {
    if ((current + sentence).length <= max) {
      current += sentence
      continue
    }
    flush()
    let rest = sentence
    while (rest.length > max) {
      const cut = rest.lastIndexOf(' ', max)
      const at = cut > 0 ? cut : max
      chunks.push(rest.slice(0, at).trim())
      rest = rest.slice(at)
    }
    current = rest
  }
  flush()
  return chunks
}
