import { Logger } from '@nestjs/common'

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

export function installProviderRejectionGuard(target: Pick<NodeJS.Process, 'on'> = process, logger = new Logger('ProviderStream')): void {
  target.on('unhandledRejection', (reason) => {
    if (isLeftoverProviderStreamError(reason)) {
      logger.warn(`A model stream broke off; the turn was ended already (${(reason as Error).message.slice(0, 120)})`)
      return
    }
    // Not ours: keep Node's rule that an unhandled rejection is fatal.
    throw reason
  })
}
