import crypto from 'node:crypto'

/**
 * Resolves or generates a request correlation trace ID.
 * Supports W3C Trace Context (traceparent) and standard x-request-id.
 */
export function resolveTraceId(headers: Record<string, string | string[] | undefined>): string {
  const traceparent = headers['traceparent']
  if (typeof traceparent === 'string') {
    // W3C traceparent format: version-trace_id-parent_id-trace_flags (e.g. 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01)
    const parts = traceparent.split('-')
    if (parts.length >= 4 && parts[1] && parts[1].length === 32) {
      return parts[1]
    }
  }

  // Accept a client-supplied id only if it is a short, safe token; otherwise generate one. This id is
  // reflected into the x-request-id response header and used as the log-correlation id, so an unbounded /
  // unsanitised client value would allow log forging and oversized reflected headers (ADR-0104 L3).
  const incomingReqId = headers['x-request-id']
  if (typeof incomingReqId === 'string') {
    const trimmed = incomingReqId.trim()
    if (/^[A-Za-z0-9._-]{1,128}$/.test(trimmed)) {
      return trimmed
    }
  }

  return crypto.randomUUID()
}
