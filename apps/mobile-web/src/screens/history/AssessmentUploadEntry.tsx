import { useState } from 'react'
import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, useTheme, type UiTheme } from '@steuereule/ui'
import { CreateReceiptDtoKind, getYearHistoryControllerGetQueryKey, type ParsedAssessmentNoticeResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { ReceiptPickerButton } from '../shared/ReceiptPickerButton'
import { detectDocumentMimeType } from '../../lib/documentOcr'
import { storeReceipt } from '../../lib/receipts/storeReceipt'
import { useReceiptReader } from '../../lib/receipts/useReceiptReader'
import { triggerSaveErrorHaptic } from '../shared/saveFeedback'
import { useReceiptStatusText } from '../receipts/ReceiptOutcomeLines'
import { usePositionLabel } from './positionLabels'
import { germanDate, joinList } from './historyFormat'

export interface AssessmentUploadEntryProps {
  /** The year open in the app: the reading takes the year from the Bescheid itself (ADR-0097 §5). */
  readonly openYear: number
  /** `lstb`: the Lohnsteuerbescheinigung of an Eckjahr (Brutto → Netto „aus dem Bescheid nicht ablesbar“). */
  readonly document?: 'steuerbescheid' | 'lstb' | undefined
  readonly title: string
  readonly body: string
  readonly cta: string
  readonly onOpenDrafts?: (() => void) | undefined
  readonly testID: string
}

/**
 * „2020 oder früher ergänzen“ (ADR-0098 §4): no upload of its own, only another way into the one Beleg
 * pipeline of the Belege tab, with the kind `steuerbescheid` as context. The owl reads the figures as
 * drafts (Zero-Write); taking them over for a year without a declaration creates an Eckjahr.
 */
export function AssessmentUploadEntry({ openYear, document = 'steuerbescheid', title, body, cta, onOpenDrafts, testID }: AssessmentUploadEntryProps) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const statusText = useReceiptStatusText()
  const reader = useReceiptReader({ taxYear: openYear, context: document === 'steuerbescheid' ? { kind: 'steuerbescheid', expectedKind: 'steuerbescheid' } : { kind: 'lstb', expectedKind: 'lstb' } })
  const [key, setKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isWeb = typeof globalThis.document !== 'undefined'
  const entry = key === null ? null : (reader.entries[key] ?? null)
  const notice = entry?.response?.assessmentNotice ?? null

  async function handleFile(file: File) {
    setError(null)
    if (detectDocumentMimeType(new Uint8Array(0), file.type, file.name) === null) {
      triggerSaveErrorHaptic()
      setError(tr('belege.upload.errorUnsupported'))
      return
    }
    setBusy(true)
    try {
      const stored = await storeReceipt(file, document === 'steuerbescheid' ? CreateReceiptDtoKind.Steuerbescheid : CreateReceiptDtoKind.Sonstiges)
      if (stored === null) {
        triggerSaveErrorHaptic()
        setError(tr('belege.upload.errorFailed'))
        return
      }
      setKey(stored.id)
      await reader.read(stored.id, file, stored.id)
      await queryClient.invalidateQueries({ queryKey: getYearHistoryControllerGetQueryKey() })
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={s.box} testID={testID}>
      <View style={s.row}>
        <View style={s.text}>
          <Text style={s.title}>{title}</Text>
          <Text style={s.body}>{body}</Text>
        </View>
        {isWeb ? (
          <ReceiptPickerButton onFile={(file) => void handleFile(file)} disabled={busy} testID={`${testID}-cta`} inputTestID={`${testID}-datei`}>
            {busy ? tr('belege.upload.uploading') : cta}
          </ReceiptPickerButton>
        ) : (
          <Text style={s.body}>{tr('verlauf.upload.nurWeb')}</Text>
        )}
      </View>
      {error !== null ? (
        <Text style={s.error} accessibilityLiveRegion="polite" testID={`${testID}-fehler`}>
          {error}
        </Text>
      ) : null}
      {entry?.phase ? (
        <Text style={s.body} accessibilityLiveRegion="polite">
          {tr('verlauf.upload.liest')}
        </Text>
      ) : null}
      {entry?.outcome && !entry.phase ? (
        <View style={s.result} accessibilityLiveRegion="polite" testID={`${testID}-ergebnis`}>
          {notice !== null ? <NoticeLines notice={notice} testID={testID} /> : <Text style={s.body}>{statusText(entry.outcome, { withReason: true })}</Text>}
          {entry.outcome.pending > 0 && onOpenDrafts ? (
            <Button variant="ghost" onPress={onOpenDrafts} testID={`${testID}-vorschlaege`}>
              {tr('verlauf.upload.zurEule')}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

/** What the reading found on the Bescheid: its year, what was read and what was not, and whether it creates an Eckjahr. */
function NoticeLines({ notice, testID }: { readonly notice: ParsedAssessmentNoticeResponseDto; readonly testID: string }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const label = usePositionLabel()
  const names = (ids: readonly string[]) => joinList(ids.map((id) => label(id, id)), tr)
  return (
    <View style={s.notice} testID={`${testID}-bescheid`}>
      <Text style={s.strong}>
        {notice.taxYearOnDocument === null ? tr('verlauf.upload.ohneJahr') : tr('verlauf.upload.jahr', { jahr: notice.taxYearOnDocument })}
        {notice.assessmentDate ? ` ${tr('verlauf.upload.datum', { datum: germanDate(notice.assessmentDate) })}` : ''}
      </Text>
      {notice.read.length > 0 ? <Text style={s.body}>{tr('verlauf.upload.gelesen', { count: notice.read.length, liste: names(notice.read) })}</Text> : null}
      {notice.notRead.length > 0 ? (
        <Text style={s.body} testID={`${testID}-nicht-gelesen`}>
          {tr('verlauf.upload.nichtGelesen', { liste: names(notice.notRead) })}
        </Text>
      ) : null}
      {notice.explanations > 0 ? <Text style={s.body}>{tr('verlauf.upload.erlaeuterungen', { count: notice.explanations })}</Text> : null}
      {notice.createsEckjahr && notice.taxYearOnDocument !== null ? (
        <Text style={s.body} testID={`${testID}-eckjahr`}>
          {tr('verlauf.upload.eckjahr', { jahr: notice.taxYearOnDocument })}
        </Text>
      ) : null}
      <Text style={s.body}>{tr('verlauf.upload.entwuerfe', { count: notice.stagedActionIds.length })}</Text>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const box: ViewStyle = { borderWidth: t.space.kontur, borderStyle: 'dashed', borderColor: t.color.linie, borderRadius: t.radius.s, padding: t.space.s3, gap: t.space.s2 }
  const row: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: t.space.s3 }
  const text: ViewStyle = { flex: 1, minWidth: 200, gap: 2 }
  const title: TextStyle = { ...t.type.labelStrong, color: t.color.tinte }
  const body: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const strong: TextStyle = { ...t.type.labelStrong, color: t.color.tinte }
  const error: TextStyle = { ...t.type.small, color: t.color.fehler }
  const result: ViewStyle = { gap: t.space.s2, borderTopWidth: 1, borderTopColor: t.color.linieWeich, paddingTop: t.space.s2 }
  const notice: ViewStyle = { gap: 2 }
  return { box, row, text, title, body, strong, error, result, notice }
}
