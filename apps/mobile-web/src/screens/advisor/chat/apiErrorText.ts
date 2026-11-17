/**
 * What the API said when it refused a request, in words the user can read. A domain error carries
 * a `message`; a validation error carries `fields`, of which only the chat message's own entry is
 * written for the user (German). Anything else has no words here: the caller says its own sentence,
 * never „HTTP 400“ (real-data run, finding 5).
 */
export function apiErrorText(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const { message, fields } = payload as { message?: unknown; fields?: unknown }
  if (typeof message === 'string' && message.trim() !== '') return message
  if (!Array.isArray(fields)) return null
  for (const entry of fields) {
    if (typeof entry !== 'object' || entry === null) continue
    const { field, message: text } = entry as { field?: unknown; message?: unknown }
    if (field === 'message' && typeof text === 'string' && text.trim() !== '') return text
  }
  return null
}
