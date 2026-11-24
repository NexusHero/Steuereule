/**
 * One JSON line per unexpected error, in the shape Google Cloud Error Reporting groups from Cloud Run logs
 * (a `ReportedErrorEvent` with the stack in `message`), so no extra processor is needed (ADR-0109).
 *
 * It carries what is needed to find the fault and nothing that identifies a person: the error's name and
 * message, its stack frames, the request id and the route *template*. Never the URL with its query, a body,
 * a header, a cookie or a token.
 *
 * `message` starts with "Unhandled error" on purpose: the log-based metric `api_unhandled_error` in
 * infra/gcp/monitoring.tf matches that text, so renaming it blinds the alert.
 */
export const ERROR_REPORT_PREFIX = 'Unhandled error'
const REPORTED_ERROR_EVENT = 'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent'
const MAX_MESSAGE = 300
const MAX_STACK = 8_000

export interface ErrorReportInput {
  error: unknown
  /** The route as declared (`/v1/receipts/:id`), never the concrete URL. */
  route?: string | undefined
  method?: string | undefined
  requestId?: string | undefined
  status?: number | undefined
}

export function formatErrorReport(input: ErrorReportInput): Record<string, unknown> {
  const { error } = input
  const name = error instanceof Error ? error.name : typeof error
  const text = (error instanceof Error ? error.message : String(error)).slice(0, MAX_MESSAGE)
  // Frames only: the stack's first lines repeat the message, which is already above.
  const frames = error instanceof Error && error.stack ? error.stack.split('\n').filter((line) => /^\s+at /.test(line)).join('\n').slice(0, MAX_STACK) : ''
  return {
    severity: 'ERROR',
    '@type': REPORTED_ERROR_EVENT,
    message: `${ERROR_REPORT_PREFIX}: ${name}: ${text}${frames ? `\n${frames}` : ''}`,
    serviceContext: { service: process.env.K_SERVICE ?? 'steuereule-api' },
    ...(input.method || input.route ? { context: { httpRequest: { method: input.method, url: input.route, ...(input.status ? { responseStatusCode: input.status } : {}) } } } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
  }
}

/** Structured logging is for the deployed service; development keeps Nest's readable output. */
export function structuredErrorLogging(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production'
}

export function writeErrorReport(input: ErrorReportInput, write: (line: string) => void = (line) => void process.stdout.write(line)): void {
  write(`${JSON.stringify(formatErrorReport(input))}\n`)
}
