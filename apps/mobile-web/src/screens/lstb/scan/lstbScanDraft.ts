import type {
  AdvisorChatMessageDto,
  CalculationTermDto,
  LstbExtractedEmployerDto,
  LstbExtractedFieldDto,
  LstbExtractedFieldDtoReason,
  LstbExtractedLinesDto,
} from '@steuereule/api-client'
import { LSTB_SCAN_LINES, wageTaxCertificateStatus, type LstbScanLine, type WageTaxCertificateStatus } from '@steuereule/core'
import { wholeEurosFrom } from '../../shared/wholeEuros'
import { euroCentsFrom } from '../SocialInsuranceLines'

/** Client-side model of a staged LStB scan (#444): what was read, how sure, and what the user confirmed. */
export type FieldId = 'bruttoarbeitslohn' | 'lohnsteuer' | 'sozialversicherung'

export const FIELDS: readonly { id: FieldId; labelKey: string }[] = [
  { id: 'bruttoarbeitslohn', labelKey: 'lstb.felder.bruttoarbeitslohn' },
  { id: 'lohnsteuer', labelKey: 'lstb.felder.lohnsteuer' },
  { id: 'sozialversicherung', labelKey: 'lstb.felder.sozialversicherung' },
]

/** A further line of the certificate the scan read (Soli, church tax, Zeilen 22–27, the subsidies). */
export type LineId = LstbScanLine

/** The labels the mask gives these lines in its own sections, so the draft reads like the mask. */
export const LINE_LABEL_KEYS: Readonly<Record<LineId, string>> = {
  solidaritaetszuschlag: 'lstb.zeilen.solidaritaetszuschlag',
  kirchensteuer: 'lstb.kirchensteuer.zeile6',
  kirchensteuerEhegatte: 'lstb.kirchensteuer.zeile7',
  rvArbeitgeber: 'lstb.zeilen.rvArbeitgeber',
  rvArbeitnehmer: 'lstb.zeilen.rvArbeitnehmer',
  zuschuesseKvPv: 'lstb.zuschuesse.zeile24',
  zuschussPv: 'lstb.zeilen.zuschussPv',
  kvArbeitnehmer: 'lstb.zeilen.kvArbeitnehmer',
  pvArbeitnehmer: 'lstb.zeilen.pvArbeitnehmer',
  avArbeitnehmer: 'lstb.zeilen.avArbeitnehmer',
}

/** The employer as read; like a field, a yellow one waits for the user's confirmation. */
export interface StagedEmployerDraft {
  readonly text: string
  readonly status: 'ok' | 'pruefen'
  readonly confirmed: boolean
  readonly reason: LstbExtractedEmployerDto['reason']
}

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
  /** Only the lines the certificate prints; the others are not offered. */
  readonly lines: Readonly<Partial<Record<LineId, StagedFieldDraft>>>
  readonly employer: StagedEmployerDraft | null
}

/** Soli is shown with its cents as people write them („12,34“); the other lines in whole euros. */
function lineText(line: LineId, value: number): string {
  return line === 'solidaritaetszuschlag' ? value.toFixed(2).replace('.', ',') : String(Math.round(value))
}

/** The lines a scan read (`value` set), as drafts. */
export function buildLineDrafts(lines: LstbExtractedLinesDto | undefined): Partial<Record<LineId, StagedFieldDraft>> {
  const drafts: Partial<Record<LineId, StagedFieldDraft>> = {}
  for (const line of LSTB_SCAN_LINES) {
    const read = lines?.[line]
    if (read === undefined || read.value === null || !Number.isFinite(read.value)) continue
    drafts[line] = { ...buildFieldDraft(read), text: lineText(line, read.value) }
  }
  return drafts
}

export function buildEmployerDraft(employer: LstbExtractedEmployerDto | undefined): StagedEmployerDraft | null {
  if (employer === undefined || employer.value === null || employer.value.trim() === '') return null
  return { text: employer.value, status: employer.status, confirmed: employer.status === 'ok', reason: employer.reason }
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
    const toDraft = (fieldId: FieldId | LineId): StagedFieldDraft => {
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
      lines: Object.fromEntries(LSTB_SCAN_LINES.filter((line) => byField.has(line)).map((line) => [line, toDraft(line)])),
      // The employer is no draft of the owl (it never leaves the mask), so a reload does not bring it back.
      employer: null,
    }
  }
  return null
}

/** The value a line's text stands for: whole euros, the Soli with cents; empty is „not taken over“. */
function lineValueFrom(line: LineId, text: string): number | null {
  return line === 'solidaritaetszuschlag' ? euroCentsFrom(text) : wholeEurosFrom(text)
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
  /** The lines to take over with the three values; a line left empty is not sent. */
  readonly lineValues: Readonly<Partial<Record<LineId, number>>>
}

/** Live plausibility and yellow-field state of a draft; „Werte übernehmen“ stays blocked until both are clean (AC 6). */
export function evaluateStagedDraft(draft: StagedLstbScanDraft | null): StagedDraftEvaluation {
  const values = {
    bruttoarbeitslohn: draft ? wholeEurosFrom(draft.fields.bruttoarbeitslohn.text) : null,
    lohnsteuer: draft ? wholeEurosFrom(draft.fields.lohnsteuer.text) : null,
    sozialversicherung: draft ? wholeEurosFrom(draft.fields.sozialversicherung.text) : null,
  }
  const { bruttoarbeitslohn, lohnsteuer, sozialversicherung } = values
  const allIntegers = bruttoarbeitslohn !== null && lohnsteuer !== null && sozialversicherung !== null
  const socialInsuranceOpen = draft !== null && draft.fields.sozialversicherung.text.trim() === ''
  const lineValues: Partial<Record<LineId, number>> = {}
  let linesValid = true
  for (const [line, lineDraft] of Object.entries(draft?.lines ?? {}) as [LineId, StagedFieldDraft][]) {
    if (lineDraft.text.trim() === '') continue
    const value = lineValueFrom(line, lineDraft.text)
    if (value === null) linesValid = false
    else lineValues[line] = value
  }
  const readyToApply = bruttoarbeitslohn !== null && lohnsteuer !== null && (sozialversicherung !== null || socialInsuranceOpen) && linesValid
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
      (FIELDS.some((f) => draft.fields[f.id].status === 'pruefen' && !draft.fields[f.id].confirmed && !(f.id === 'sozialversicherung' && socialInsuranceOpen)) ||
        Object.values(draft.lines).some((line) => line !== undefined && line.status === 'pruefen' && !line.confirmed && line.text.trim() !== '') ||
        (draft.employer !== null && draft.employer.status === 'pruefen' && !draft.employer.confirmed && draft.employer.text.trim() !== '')),
    lineValues,
  }
}
