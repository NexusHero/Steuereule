export interface ReasoningBlock {
  readonly kind: 'heading' | 'paragraph'
  readonly text: string
}

const HEADING = /^\*\*(.+?)\*\*$/

/**
 * The provider's reasoning summary as a few tidy blocks (#476). Gemini sends it as Markdown with a
 * bold line per thought and runs of blank lines; shown raw, the stars and the gaps took over the
 * line of thought. A bold-only line becomes a heading, every other run of lines a paragraph, and
 * leftover emphasis markers are dropped: the summary is plain prose, never a place for links.
 */
export function reasoningBlocks(text: string): ReasoningBlock[] {
  const blocks: ReasoningBlock[] = []
  let paragraph: string[] = []
  const flush = (): void => {
    const joined = paragraph.join(' ').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim()
    if (joined.length > 0) blocks.push({ kind: 'paragraph', text: joined })
    paragraph = []
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', text: heading[1]!.trim() })
    } else if (line.length === 0) {
      flush()
    } else {
      paragraph.push(line)
    }
  }
  flush()
  return blocks
}
