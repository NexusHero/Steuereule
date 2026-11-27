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
  [/\s*×\s*/g, ' mal '],
]

/** One Markdown line as it is said: no markers, a full stop where the line ended without one. */
function spokenLine(line: string): string {
  const text = line
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s*>\s?/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/(\*\*|__|~~)/g, '')
    .replace(/(^|[\s(])[*_](?=\S)/g, '$1')
    .replace(/(?<=\S)[*_](?=[\s.,;:!?)]|$)/g, '')
    .replace(/`/g, '')
    .replace(/\s*\|\s*/g, ', ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
  if (text === '' || /^[-:,\s]+$/.test(text)) return ''
  return /[.!?:…]$/.test(text) ? text : `${text}.`
}

/**
 * An answer of the owl as text for a voice: the Markdown markers gone, code blocks left out, a citation
 * said as its paragraph (once, where the sentence already names it), and for German the legal
 * abbreviations spoken as words.
 */
export function speechText(markdown: string, language: string): string {
  const withoutCode = markdown.replace(/(`{3,}|~{3,})[\s\S]*?\1/g, '\n')
  const cited = withoutCode
    .replace(CITATION, (whole, id: string) => ADVISOR_LEGAL_SOURCES[id as OwlSourceId]?.paragraph ?? whole)
    // „(§ 9 Abs. 1 EStG § 9 Abs. 1 EStG)“: the sentence and its chip name the same paragraph.
    .replace(/(§[^()[\]\n]*?\b(?:EStG|AO))\s+\1/g, '$1')
  const lines = cited.split('\n').map(spokenLine).filter((line) => line !== '')
  let text = lines.join(' ')
  if (language.toLowerCase().startsWith('de')) for (const [pattern, spoken] of GERMAN_SPOKEN) text = text.replace(pattern, spoken)
  return text.replace(/\s+([.,;:!?)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s{2,}/g, ' ').trim()
}

/** `text` in pieces a voice takes whole: sentences, joined while they fit, a long one cut at a space. */
export function speechChunks(text: string, max: number = MAX_SPOKEN_CHUNK): string[] {
  const sentences = text.match(/[^.!?:]+[.!?:]*\s*/g) ?? []
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
