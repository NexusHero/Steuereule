import type { AdvisorStreamEvent } from '@steuereule/core'
import { InMemoryRunLog, type RunEntry, type RunInfo, type RunLog } from '../../run-log/run-log.js'

export { RUN_RETENTION_MS } from '../../run-log/run-log.js'

export const ADVISOR_RUN_LOG = Symbol('ADVISOR_RUN_LOG')

/** A running answer of the owl: whose it is, and the message it writes into. */
export interface AdvisorRunInfo extends RunInfo {
  readonly taxYear: number
  readonly assistantMessageId: string
}

export type AdvisorRunEntry = RunEntry<AdvisorStreamEvent>

/** The run log (`run-log/`) for the owl's answers: its events are the chat's stream events (#476). */
export type AdvisorRunLog = RunLog<AdvisorStreamEvent, AdvisorRunInfo>

/** Single-instance log: correct for one API process, and the stand-in wherever Redis is absent. */
export class InMemoryAdvisorRunLog extends InMemoryRunLog<AdvisorStreamEvent, AdvisorRunInfo> {}
