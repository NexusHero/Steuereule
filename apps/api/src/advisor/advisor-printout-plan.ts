import {
  planPrintoutGaps,
  printoutGapFollowUp,
  printoutGapKey,
  printoutGapReads,
  provenanceKey,
  isNewRecordId,
  type AdvisorActionProposal,
  type AdvisorMessageMeta,
  type AdvisorRecordHandles,
  type PrintoutGapContext,
  type PrintoutGapPlan,
} from '@steuereule/core'
import { checkPiiFree } from '../ki/ki.adapter.js'

/** Reads the current values of fields of one person (`ConfirmationService.readRawValues`). */
export type RawValuesReader = (dataUserId: string, taxYear: number, keys: readonly string[]) => Promise<Record<string, string | null>>

export interface PrintoutPlanInput {
  readonly userId: string
  readonly taxYear: number
  /** The printout check's codes. */
  readonly missing: readonly string[]
  /** Person B's data user, when there is a Person B (ADR-0054); `recordable` while the user records B's data. */
  readonly spouse: { readonly spouseUserId: string; readonly recordable: boolean } | null
  readonly records: AdvisorRecordHandles
  readonly personalDataConsent: boolean
  readonly read: RawValuesReader
}

/**
 * The checklist of what closes the printout's gaps (ADR-0091, Nachtrag): the core names the fields,
 * this reads which of them are empty, through the same field access the owl's drafts write through.
 * The plan holds field names and neutral record names only.
 */
export async function buildPrintoutPlan(input: PrintoutPlanInput): Promise<PrintoutGapPlan> {
  const ctx: PrintoutGapContext = {
    joint: input.spouse !== null,
    personB: input.spouse ? { recordable: input.spouse.recordable } : null,
    children: (input.records.kind ?? []).map((record) => record.handle),
    rentals: (input.records.vermietung ?? []).map((record) => record.handle),
    personalDataConsent: input.personalDataConsent,
    taxYear: input.taxYear,
  }
  const reads = printoutGapReads(input.missing, ctx)
  const idOf = (screen: 'kind' | 'vermietung' | string, handle: string | undefined): string | undefined =>
    handle === undefined ? undefined : (input.records[screen as 'kind' | 'vermietung'] ?? []).find((record) => record.handle === handle)?.id
  const values: Record<string, string | null> = {}
  for (const person of ['A', 'B'] as const) {
    const dataUserId = person === 'A' ? input.userId : input.spouse?.spouseUserId
    if (dataUserId === undefined) continue
    const mine = reads.filter((target) => target.person === person)
    const storageKeys = mine.map((target) => provenanceKey(target.screen, target.field, idOf(target.screen, target.record)))
    const read = storageKeys.length > 0 ? await input.read(dataUserId, input.taxYear, storageKeys) : {}
    mine.forEach((target, i) => {
      values[printoutGapKey(target)] = read[storageKeys[i]!] ?? null
    })
  }
  const plan = planPrintoutGaps(input.missing, ctx, values)
  checkPiiFree(plan)
  return plan
}

/** The gap keys a draft (and its companion fields) is about, so the app does not ask what is on its way. */
export function stagedGapKeys(meta: AdvisorMessageMeta, records: AdvisorRecordHandles | undefined): string[] {
  const drafts: AdvisorActionProposal[] = [...(meta.action ? [meta.action] : []), ...(meta.actions ?? [])]
  const keys: string[] = []
  for (const draft of drafts) {
    const handle =
      draft.instance === null || draft.instance === undefined
        ? undefined
        : isNewRecordId(draft.instance)
          ? 'neu'
          : (records?.[draft.screen] ?? []).find((record) => record.id === draft.instance)?.handle
    const person = draft.person ?? 'A'
    for (const field of [draft.field, ...Object.keys(draft.companionFields ?? {})]) {
      keys.push(printoutGapKey({ person, screen: draft.screen, field, record: handle }))
    }
  }
  return keys
}

/** Whether the drafts of an earlier answer were taken over and none is still open. */
export function draftsTakenOver(meta: AdvisorMessageMeta | null | undefined): boolean {
  const drafts = [...(meta?.action ? [meta.action] : []), ...(meta?.actions ?? [])]
  return drafts.some((draft) => draft.status === 'applied') && !drafts.some((draft) => draft.status === 'pending')
}

export interface FollowUpInput {
  readonly plan: PrintoutGapPlan | undefined
  readonly message: string
  readonly reply: string
  readonly meta: AdvisorMessageMeta
  readonly records: AdvisorRecordHandles | undefined
  readonly previous: { readonly draftsApplied: boolean; readonly printoutGapsAsked?: readonly string[] | undefined } | undefined
  readonly subjectLabels?: Readonly<Record<string, string>> | undefined
}

/** The deterministic printout follow-up of one answer: the text to add and the gaps it asked. */
export function printoutFollowUp(input: FollowUpInput): { readonly text: string; readonly meta: Pick<AdvisorMessageMeta, 'printoutGapsAsked'> } {
  if (!input.plan) return { text: '', meta: {} }
  const result = printoutGapFollowUp({
    plan: input.plan,
    message: input.message,
    reply: input.reply,
    previousDraftsApplied: input.previous?.draftsApplied ?? false,
    previousAsked: input.previous?.printoutGapsAsked,
    stagedKeys: stagedGapKeys(input.meta, input.records),
    subjectLabels: input.subjectLabels,
  })
  if (result === null) return { text: '', meta: {} }
  return { text: result.text, meta: { printoutGapsAsked: result.asked } }
}
