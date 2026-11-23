// Every reader that takes user-supplied text must stay linear in its length (pentest 2026-11-23, ADR-0106 D1).
// Two unbounded regexes made a single 31 KB request block the API's event loop for 13.7 s: `\S*`-prefixed
// labour words in the craftsman-invoice reader, and the e-mail pattern of the PII scrubber. The receipt text
// is capped at 32,000 characters by the parse DTO, so this suite feeds that size.
//
// The check compares growth, not absolute time, so it holds on a slow CI runner: four times the input may
// cost about four times as much for a linear reader, sixteen times for a quadratic one. The broken readers
// grew 15–16× here before the fix.
import { describe, expect, it } from 'vitest'
import * as core from './index'

const SMALL = 8_000
const LARGE = 32_000
/** Linear is ~4×; allow noise up to 9×, well short of the 16× a quadratic reader shows. */
const MAX_GROWTH = 9
/** Below this a timing is noise; the slow readers took > 1 s at the large size. */
const FLOOR_MS = 15

const SHAPES: Record<string, string> = {
  dots: '1.',
  letters: 'a',
  hyphen: 'a-',
  spaceDigit: ' 1',
  comma: '1,',
  at: 'a@',
  amounts: '1.000,00 ',
  dates: '01.01.2025 ',
  newlines: 'a\n',
  street: 'Abcdefgh',
  mixed: 'Lohn 12,50 h Std. ',
  tabs: '\t1',
}

const fill = (unit: string, length: number): string => unit.repeat(Math.ceil(length / unit.length)).slice(0, length) + 'x'

/** The readers fed with text a user or a document supplies. Matched by name so a new reader joins by itself. */
const READER_NAME = /^(?:parse|read|classify|scrub|looksLike|extract|detect|select|recognise|recognize)/
const readers = Object.entries(core).filter(
  (entry): entry is [string, (text: string) => unknown] => typeof entry[1] === 'function' && READER_NAME.test(entry[0]),
)

function fastest(reader: (text: string) => unknown, text: string): number {
  let best = Number.POSITIVE_INFINITY
  for (let round = 0; round < 2; round += 1) {
    const started = performance.now()
    try {
      reader(text)
    } catch {
      // A reader may refuse the shape; only its running time matters here.
    }
    best = Math.min(best, performance.now() - started)
  }
  return best
}

describe('text readers stay linear in the length of their input (ADR-0106 D1)', () => {
  it('finds the readers it is meant to guard', () => {
    const names = readers.map(([name]) => name)
    expect(names).toEqual(expect.arrayContaining(['parseCraftsmanInvoice', 'scrubDocumentTextPii', 'scrubUserMessagePii', 'classifyDocumentKind']))
  })

  it.each(readers)('%s', (_name, reader) => {
    const quadratic: string[] = []
    for (const [shape, unit] of Object.entries(SHAPES)) {
      const small = fastest(reader, fill(unit, SMALL))
      const large = fastest(reader, fill(unit, LARGE))
      if (large > FLOOR_MS && large > MAX_GROWTH * Math.max(small, FLOOR_MS / MAX_GROWTH)) {
        quadratic.push(`${shape}: ${small.toFixed(1)} ms at ${SMALL} → ${large.toFixed(1)} ms at ${LARGE}`)
      }
    }
    expect(quadratic).toEqual([])
  })
})
