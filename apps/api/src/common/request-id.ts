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

  const incomingReqId = headers['x-request-id']
  if (typeof incomingReqId === 'string' && incomingReqId.trim().length > 0) {
    return incomingReqId.trim()
  }

  return crypto.randomUUID()
}
