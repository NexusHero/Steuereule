import type { AdvisorChatMessageDto, CalculationTermDto, LstbExtractedFieldDto, LstbExtractedFieldDtoReason } from '@steuereule/api-client'
import { wageTaxCertificateStatus, type WageTaxCertificateStatus } from '@steuereule/core'
import { integerFrom } from '../../shared/integer'

/** Client-side model of a staged LStB scan (#444): what was read, how sure, and what the user confirmed. */
export type FieldId = 'bruttoarbeitslohn' | 'lohnsteuer' | 'sozialversicherung'

export const FIELDS: readonly { id: FieldId; labelKey: string }[] = [
  { id: 'bruttoarbeitslohn', labelKey: 'lstb.felder.bruttoarbeitslohn' },
  { id: 'lohnsteuer', labelKey: 'lstb.felder.lohnsteuer' },
  { id: 'sozialversicherung', labelKey: 'lstb.felder.sozialversicherung' },
]

export interface StagedFieldDraft {
  readonly text: string
  readonly status: 'ok' | 'pruefen'
  readonly confirmed: boolean
  readonly sourceLines: readonly string[]
  readonly calculation: readonly CalculationTermDto[]
  readonly reason: LstbExtractedFieldDtoReason
}

export interface StagedLstbScanDraft {
  readonly stage: 'deterministic' | 'llm_text_fallback'
  readonly receiptId: string | null
  readonly fileName: string
  readonly taxYearOnDocument: number | null
  readonly actionIds: readonly string[]
  readonly fields: Readonly<Record<FieldId, StagedFieldDraft>>
}

export function buildFieldDraft(field: LstbExtractedFieldDto): StagedFieldDraft {
  const text = field.value !== null && Number.isFinite(field.value) ? String(Math.round(field.value)) : ''
  return {
    text,
    status: field.status,
    confirmed: field.status === 'ok',
    sourceLines: field.sourceLines ?? [],
    calculation: field.calculation ?? [],
    reason: field.reason ?? null,
  }
}

/** Restores a pending staged scan after a reload from the advisor messages (Zero-Write, AC 5). */
export function rehydrateDraftFromAdvisorMessages(
  messages: readonly AdvisorChatMessageDto[],
  expectedPerson: 'A' | 'B',
): StagedLstbScanDraft | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    const scanMeta = msg?.meta?.lstbScan
    const actions = msg?.meta?.actions
    if (!scanMeta || !actions || actions.length === 0) continue
    if ((scanMeta.person ?? 'A') !== expectedPerson) continue

    const lstbActions = actions.filter((a) => a.screen === 'lstb')
    if (lstbActions.length === 0) continue
    const hasPending = lstbActions.some((a) => a.status === 'pending')
    if (!hasPending) return null

    const byField = new Map(lstbActions.map((a) => [a.field, a]))
    const toDraft = (fieldId: FieldId): StagedFieldDraft => {
      const action = byField.get(fieldId)
      const status = action?.confidenceStatus ?? 'ok'
      return {
        text: action?.newValue ?? '',
        status,
        confirmed: status === 'ok',
        sourceLines: action?.sourceLines ?? [],
        calculation: action?.calculation ?? [],
        reason: action?.fieldReason ?? null,
      }
    }

    return {
      stage: scanMeta.stage,
      receiptId: scanMeta.receiptId ?? null,
      fileName: 'Lohnsteuerbescheinigung',
      taxYearOnDocument: scanMeta.taxYearOnDocument ?? null,
      actionIds: scanMeta.actionIds,
      fields: {
        bruttoarbeitslohn: toDraft('bruttoarbeitslohn'),
        lohnsteuer: toDraft('lohnsteuer'),
        sozialversicherung: toDraft('sozialversicherung'),
      },
    }
  }
  return null
}

export interface StagedDraftEvaluation {
  readonly values: Readonly<Record<FieldId, number | null>>
  readonly allIntegers: boolean
  /** Gross wage and wage tax are whole numbers and the social insurance is one too or left empty (ADR-0083). */
  readonly readyToApply: boolean
  /** The social insurance could not be read and is left empty: it stays open, or the recorded sum stands. */
  readonly socialInsuranceOpen: boolean
  readonly liveStatus: WageTaxCertificateStatus | null
  readonly hasWiderspruch: boolean
  readonly hasUnconfirmedYellow: boolean
}

/** Live plausibility and yellow-field state of a draft; „Werte übernehmen“ stays blocked until both are clean (AC 6). */
export function evaluateStagedDraft(draft: StagedLstbScanDraft | null): StagedDraftEvaluation {
  const values = {
    bruttoarbeitslohn: draft ? integerFrom(draft.fields.bruttoarbeitslohn.text) : null,
    lohnsteuer: draft ? integerFrom(draft.fields.lohnsteuer.text) : null,
    sozialversicherung: draft ? integerFrom(draft.fields.sozialversicherung.text) : null,
  }
  const { bruttoarbeitslohn, lohnsteuer, sozialversicherung } = values
  const allIntegers = bruttoarbeitslohn !== null && lohnsteuer !== null && sozialversicherung !== null
  const socialInsuranceOpen = draft !== null && draft.fields.sozialversicherung.text.trim() === ''
  const readyToApply = bruttoarbeitslohn !== null && lohnsteuer !== null && (sozialversicherung !== null || socialInsuranceOpen)
  const liveStatus = readyToApply
    ? wageTaxCertificateStatus({
        bruttoarbeitslohn: { kind: 'erfasst', value: bruttoarbeitslohn },
        lohnsteuer: { kind: 'erfasst', value: lohnsteuer },
        sozialversicherung: { kind: 'erfasst', value: sozialversicherung ?? 0 },
      })
    : null
  return {
    values,
    allIntegers,
    readyToApply,
    socialInsuranceOpen,
    liveStatus,
    hasWiderspruch: liveStatus?.kind === 'widerspruch',
    // An empty social insurance is no yellow value to confirm: it is left open on purpose.
    hasUnconfirmedYellow:
      draft !== null &&
      FIELDS.some((f) => draft.fields[f.id].status === 'pruefen' && !draft.fields[f.id].confirmed && !(f.id === 'sozialversicherung' && socialInsuranceOpen)),
  }
}
