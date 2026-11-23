import type { Screen } from '@steuereule/core'

/**
 * The rows of one mask that a draft of the owl may prepare as new (ADR-0091). The module that owns
 * the mask provides its source; the advisor collects them by screen.
 */
export interface DraftRecordSource {
  readonly screen: Screen
  /** Creates the row from the draft's values and answers its id. */
  create(dataUserId: string, taxYear: number, values: Readonly<Record<string, string>>): Promise<string>
  /** Takes the row back when the draft is undone. Absent where a created row stays. */
  remove?(dataUserId: string, taxYear: number, id: string): Promise<void>
}
