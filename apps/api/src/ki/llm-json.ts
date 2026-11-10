/** Extracts the plain text of a LangChain message content (string or content parts). */
export function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) =>
      part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text
        : '',
    )
    .join('')
}

export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Model output did not contain a JSON object.')
  }
  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as unknown
}
