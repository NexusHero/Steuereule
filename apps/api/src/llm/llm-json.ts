/** Extracts the plain text of a LangChain message content (string or content parts). */
export function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      return part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''
    })
    .join('')
}

/** The content of the first ``` fence, with or without a `json` tag; undefined when none is closed. */
function fencedBlock(text: string): string | undefined {
  const open = text.indexOf('```')
  if (open === -1) return undefined
  let start = open + 3
  if (text.slice(start, start + 4).toLowerCase() === 'json') start += 4
  const close = text.indexOf('```', start)
  return close === -1 ? undefined : text.slice(start, close)
}

export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim()
  const candidate = fencedBlock(trimmed)?.trim() ?? trimmed
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Model output did not contain a JSON object.')
  }
  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as unknown
}
