import { trace, type Tracer, type Span, SpanStatusCode } from '@opentelemetry/api'

export const TRACER_NAME = 'steuereule-api'

export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME)
}

/**
 * Executes a function within an active OpenTelemetry trace span.
 * Captures status and exceptions automatically, no-oping cleanly when no exporter is attached.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const tracer = getTracer()
  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      span.setAttributes(attributes)
    }
    try {
      const result = await fn(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      span.end()
    }
  })
}
