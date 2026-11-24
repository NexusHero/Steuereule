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
/**
 * Below this a timing is noise (JIT warm-up, GC, a busy runner). The quadratic readers took 190 ms to 13.7 s
 * at the large size; the linear ones take a few milliseconds.
 */
const FLOOR_MS = 50
/** One chat message of the maximum length may cost the scrubber this much; see the budget test below. */
const CHAT_SCRUB_BUDGET_MS = 250

const SHAPES: Record<string, string> = {
  dots: '1.',
  letters: 'a',
  hyphen: 'a-',
  capitalHyphen: 'A-',
  capitalDot: 'A.',
  capitalWords: 'Ab ',
  capitalAmpersand: "A&A'",
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
type Reader = (text: string) => unknown
const readers: [string, Reader][] = Object.entries(core as Record<string, unknown>)
  .filter(([name, value]) => typeof value === 'function' && READER_NAME.test(name))
  .map(([name, value]) => [name, value as Reader])

function run(reader: Reader, text: string): void {
  try {
    reader(text)
  } catch {
    // A reader may refuse the shape; only its running time matters here.
  }
}

/** The fastest of three runs after one warm-up run, so the JIT and a stray GC pause do not count. */
function fastest(reader: Reader, text: string): number {
  run(reader, text)
  let best = Number.POSITIVE_INFINITY
  for (let round = 0; round < 3; round += 1) {
    const started = performance.now()
    run(reader, text)
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

  // The growth check above cannot see a reader that is linear but slow. The employer pattern of the chat
  // scrubber took 1 ms per character on "A-A-A-…": 8 s for one message of the maximum length, twice per chat
  // turn, with the event loop blocked (review of ADR-0107 H2). So the chat scrubber also has an absolute
  // budget at the message limit; it needs a few milliseconds, the budget leaves room for a slow runner.
  it.each(Object.entries(SHAPES))('scrubUserMessagePii handles a full-length message of shape "%s" within its budget', (_shape, unit) => {
    const message = fill(unit, core.ADVISOR_MESSAGE_MAX_CHARS)
    expect(fastest(core.scrubUserMessagePii as Reader, message)).toBeLessThan(CHAT_SCRUB_BUDGET_MS)
  })
})
