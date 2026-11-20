import { fieldsOfScreen, provenanceKey, type Screen } from '@steuereule/core'
import type { AssistantSessionInfo, McpDeps } from './mcp-session.js'

export interface OwnRecord {
  /** Whether the record is this assistant's own, unconfirmed and untouched by the user. */
  readonly own: boolean
  /** The markings of the record, to forget once it is gone. */
  readonly keys: readonly string[]
}

/**
 * Whether a record (a child, a rental object) is still only this assistant's: it carries the marking the
 * assistant set when it created it (`anchorField`), every marking on it is the assistant's unconfirmed
 * entry, and every value on it is such an entry. One value the user typed or confirmed keeps the record.
 * Traces to: ADR-0052 amendment 2 (the assistant removes only what it entered itself).
 */
export async function ownRecord(
  deps: Pick<McpDeps, 'confirmation'>,
  target: { userId: string; taxYear: number; screen: Screen; instance: string; anchorField: string },
  assistant: AssistantSessionInfo,
): Promise<OwnRecord> {
  const { userId, taxYear, screen, instance, anchorField } = target
  const prefix = `${screen}:${instance}.`
  const markings = (await deps.confirmation.list(userId, taxYear)).filter((m) => m.key.startsWith(prefix))
  const isOwn = (m: (typeof markings)[number]) => !m.confirmed && m.proposal === null && m.provenance.kind === 'assistent' && m.provenance.name === assistant.clientName
  const keys = fieldsOfScreen(screen).map((spec) => provenanceKey(screen, spec.field, instance))
  const values = await deps.confirmation.readRawValues(userId, taxYear, keys)
  const empty = (value: unknown) => value === null || value === undefined || value === ''
  const untouched = keys.every((key) => empty(values[key]) || markings.some((m) => m.key === key && isOwn(m)))
  const anchored = markings.some((m) => m.key === provenanceKey(screen, anchorField, instance))
  return { own: untouched && anchored && markings.every(isOwn), keys: markings.map((m) => m.key) }
}
