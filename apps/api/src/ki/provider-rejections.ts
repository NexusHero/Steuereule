import { Logger } from '@nestjs/common'
import { structuredErrorLogging, writeErrorReport } from '../common/error-report.js'

/**
 * The Google SDK reads a Gemini stream twice: once for the caller and once to build the final
 * response it never hands out. When the connection breaks halfway, the caller gets the error and
 * handles it (the turn ends as failed), but the second reading rejects a promise nobody listens
 * to. Node ends the whole process for that, so one dropped connection to Gemini took the API down
 * for everyone (found in a local run, reproduced with a faked network).
 *
 * Only this one error is let through. Any other rejection nobody handled still ends the process.
 */
export function isLeftoverProviderStreamError(reason: unknown): boolean {
  return reason instanceof Error && /^\[GoogleGenerativeAI(?: Abort)? Error\]: (?:Error reading from the stream|Request aborted when reading from the stream)/.test(reason.message)
}

/** How long requests in flight get to finish once an unknown rejection has been seen. */
export const REJECTION_DRAIN_MS = 10_000

export interface RejectionGuardOptions {
  target?: Pick<NodeJS.Process, 'on'>
  logger?: Pick<Logger, 'warn' | 'error'>
  /** Stops accepting and waits for requests in flight (the app's graceful close). Absent before the app exists. */
  drain?: () => Promise<unknown>
  exit?: (code: number) => void
  drainMs?: number
  /** Writes the structured error line; replaced in tests. */
  report?: (reason: unknown) => void
}

/**
 * An unknown rejection leaves unknown state, so the instance must end (the platform starts a fresh one). But
 * ending at once drops every request in flight on it, so: stop accepting, let those finish within a short
 * deadline, then exit non-zero (ADR-0109). A second rejection while draining is only logged.
 */
export function installProviderRejectionGuard(options: RejectionGuardOptions = {}): void {
  const { target = process, logger = new Logger('ProviderStream'), drain, exit = (code) => process.exit(code), drainMs = REJECTION_DRAIN_MS } = options
  const report =
    options.report ??
    ((reason) => {
      if (structuredErrorLogging()) writeErrorReport({ error: reason })
      else logger.error(`Unhandled rejection, ending the process: ${String(reason)}`, reason instanceof Error ? reason.stack : undefined)
    })
  let ending = false

  target.on('unhandledRejection', (reason) => {
    if (isLeftoverProviderStreamError(reason)) {
      logger.warn(`A model stream broke off; the turn was ended already (${(reason as Error).message.slice(0, 120)})`)
      return
    }
    report(reason)
    if (ending) return
    ending = true

    // The deadline is the backstop: a hung request must not keep a broken instance alive.
    const deadline = setTimeout(() => exit(1), drainMs)
    deadline.unref()
    void (drain ? drain().catch(() => undefined) : Promise.resolve()).then(() => {
      clearTimeout(deadline)
      exit(1)
    })
  })
}
