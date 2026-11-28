/**
 * Where a text was changed before it left for a language model: the range in the text as the user wrote
 * it, and what the model read in its place. Carries no personal data itself, only positions and the
 * stand-in, so it can be stored next to the message and shown to the user.
 */
export interface MaskedSpan {
  /** First character of the range in the original text. */
  readonly start: number
  /** One past its last character. */
  readonly end: number
  /** What the model read instead, e.g. `[IBAN-GESCHÜTZT]`, `Person B` or a rough age. */
  readonly as: string
}

/** A piece of the original text: as written, or changed on its way to the model. */
export interface MaskedSegment {
  readonly text: string
  /** Present when the model did not read `text` but this. */
  readonly as?: string
}

interface Token {
  readonly text: string
  readonly start: number
}

/** Words and the blanks between them, each with its place in the text. */
function tokensOf(text: string): Token[] {
  const tokens: Token[] = []
  for (const match of text.matchAll(/\s+|\S+/g)) tokens.push({ text: match[0], start: match.index })
  return tokens
}

/** Above this many words on either side the middle is taken as one changed range instead of being aligned. */
const ALIGN_LIMIT = 2_000

/** For each kept pair the indices in both token lists, in order (longest common subsequence). */
function keptPairs(a: readonly Token[], b: readonly Token[]): Array<readonly [number, number]> {
  const rows = a.length + 1
  const columns = b.length + 1
  const length = new Uint16Array(rows * columns)
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      length[i * columns + j] = a[i]!.text === b[j]!.text ? length[(i + 1) * columns + j + 1]! + 1 : Math.max(length[(i + 1) * columns + j]!, length[i * columns + j + 1]!)
    }
  }
  const pairs: Array<readonly [number, number]> = []
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i]!.text === b[j]!.text) pairs.push([i++, j++])
    else if (length[(i + 1) * columns + j]! >= length[i * columns + j + 1]!) i += 1
    else j += 1
  }
  return pairs
}

/** The changed range without what both sides share at its edges ("IBAN:DE89…," keeps "IBAN:" and ","). */
function tightened(original: string, sent: string, start: number, end: number): MaskedSpan | null {
  const was = original.slice(start, end)
  let head = 0
  while (head < was.length && head < sent.length && was[head] === sent[head]) head += 1
  let tail = 0
  while (tail < was.length - head && tail < sent.length - head && was[was.length - 1 - tail] === sent[sent.length - 1 - tail]) tail += 1
  const as = sent.slice(head, sent.length - tail).trim()
  const from = start + head
  const to = end - tail
  // Blanks at the edges belong to the text around the range, not to what was changed.
  const inner = original.slice(from, to)
  const lead = inner.length - inner.trimStart().length
  const trail = inner.length - inner.trimEnd().length
  if (from + lead >= to - trail) return null
  return { start: from + lead, end: to - trail, as }
}

/**
 * The ranges of `original` that `sent` does not carry as written. `sent` is `original` after the masking
 * (`scrubUserMessagePii`), so the two differ only where something was replaced; both are aligned word by
 * word and each stretch between two kept words becomes one range.
 */
export function maskedSpans(original: string, sent: string): MaskedSpan[] {
  if (original === sent) return []
  const a = tokensOf(original)
  const b = tokensOf(sent)
  let head = 0
  while (head < a.length && head < b.length && a[head]!.text === b[head]!.text) head += 1
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail]!.text === b[b.length - 1 - tail]!.text) tail += 1
  const middleA = a.slice(head, a.length - tail)
  const middleB = b.slice(head, b.length - tail)
  const pairs = middleA.length > ALIGN_LIMIT || middleB.length > ALIGN_LIMIT ? [] : keptPairs(middleA, middleB)

  const spans: MaskedSpan[] = []
  const endOf = (tokens: readonly Token[], index: number, text: string): number => (index < tokens.length ? tokens[index]!.start : text.length)
  const startA = (index: number): number => endOf(a, head + index, original)
  const startB = (index: number): number => endOf(b, head + index, sent)
  let atA = 0
  let atB = 0
  for (const [i, j] of [...pairs, [middleA.length, middleB.length] as const]) {
    if (i > atA || j > atB) {
      const from = startA(atA)
      const to = i > atA ? startA(i) : from
      const span = i > atA ? tightened(original, sent.slice(startB(atB), startB(j)), from, to) : null
      if (span) spans.push(span)
    }
    atA = i + 1
    atB = j + 1
  }
  return spans
}

/** `text` cut at `spans`, for showing the changed ranges where they stand. Ranges that do not fit the text are left out. */
export function maskedSegments(text: string, spans: readonly MaskedSpan[] | null | undefined): MaskedSegment[] {
  const segments: MaskedSegment[] = []
  let at = 0
  for (const span of [...(spans ?? [])].sort((x, y) => x.start - y.start)) {
    if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < at || span.end <= span.start || span.end > text.length) continue
    if (span.start > at) segments.push({ text: text.slice(at, span.start) })
    segments.push({ text: text.slice(span.start, span.end), as: span.as })
    at = span.end
  }
  if (at < text.length) segments.push({ text: text.slice(at) })
  return segments
}
