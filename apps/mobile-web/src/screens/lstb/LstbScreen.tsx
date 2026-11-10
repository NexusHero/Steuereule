import { useEffect, useRef, useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Feld, HerkunftsChip, Input, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { wageTaxCertificateStatus } from '@steuereule/core'
import {
  useLstbControllerGetLstb,
  useLstbControllerSetField,
  useLstbScanControllerConfirmScan,
  useReceiptParseControllerParseReceipt,
  useAdvisorControllerGetSession,
  useAdvisorControllerDismissAction,
  getLstbControllerGetLstbQueryKey,
  getCockpitControllerGetCockpitSummaryQueryKey,
  getTaxEstimateControllerGetQueryKey,
  getConfirmationControllerGetQueryKey,
  getReceiptControllerListQueryKey,
  getAdvisorControllerGetSessionQueryKey,
  uploadReceiptFile,
  type AdvisorChatMessageDto,
  type CalculationTermDto,
  type LstbExtractedFieldDto,
  type LstbExtractedFieldDtoReason,
  type LstbFieldDto,
  type LstbResponseDto,
  type LstbYearConflictDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { formatCalculation } from '../../lib/lstb/formatCalculation'
import { detectDocumentMimeType, extractDocumentTextOnDevice, type OcrStage } from '../../lib/documentOcr'
import { integerFrom } from '../shared/integer'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { InMaskAdvisorCompanion } from '../advisor/InMaskAdvisorCompanion'
import { ReceiptFileModal } from '../receipts/ReceiptFileModal'

type FieldId = 'bruttoarbeitslohn' | 'lohnsteuer' | 'sozialversicherung'

const FIELDS: readonly { id: FieldId; labelKey: string }[] = [
  { id: 'bruttoarbeitslohn', labelKey: 'lstb.felder.bruttoarbeitslohn' },
  { id: 'lohnsteuer', labelKey: 'lstb.felder.lohnsteuer' },
  { id: 'sozialversicherung', labelKey: 'lstb.felder.sozialversicherung' },
]

interface StagedFieldDraft {
  readonly text: string
  readonly status: 'ok' | 'pruefen'
  readonly confirmed: boolean
  readonly sourceLines: readonly string[]
  readonly calculation: readonly CalculationTermDto[]
  readonly reason: LstbExtractedFieldDtoReason
}

interface StagedLstbScanDraft {
  readonly stage: 'deterministic' | 'llm_text_fallback'
  readonly receiptId: string | null
  readonly fileName: string
  readonly taxYearOnDocument: number | null
  readonly actionIds: readonly string[]
  readonly fields: Readonly<Record<FieldId, StagedFieldDraft>>
}

type ScanBusyPhase = null | 'uploading' | OcrStage | 'parsing'

export interface LstbScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  /** Set when Person A records the partner's certificate (ADR-0054, partner without an own account). */
  readonly partnerName?: string
  /** Invoked when a scanned LStB belongs to a different tax year and the user switches to it. */
  readonly onSwitchTaxYear?: (year: number) => void
}

function buildFieldDraft(field: LstbExtractedFieldDto): StagedFieldDraft {
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

function rehydrateDraftFromAdvisorMessages(
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

export function LstbScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR, partnerName, onSwitchTaxYear }: LstbScreenProps) {
  const params = partnerName === undefined ? undefined : ({ person: 'B' } as const)
  const expectedPerson: 'A' | 'B' = partnerName === undefined ? 'A' : 'B'
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const query = useLstbControllerGetLstb(taxYear, params)
  const setField = useLstbControllerSetField()
  const confirmScan = useLstbScanControllerConfirmScan()
  const parseReceipt = useReceiptParseControllerParseReceipt()
  const dismissAction = useAdvisorControllerDismissAction()
  const advisorSessionQuery = useAdvisorControllerGetSession(taxYear, { query: { retry: false } })

  const [stagedScan, setStagedScan] = useState<StagedLstbScanDraft | null>(null)
  const [locallyDismissed, setLocallyDismissed] = useState(false)
  const [scanBusyPhase, setScanBusyPhase] = useState<ScanBusyPhase>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [yearConflict, setYearConflict] = useState<LstbYearConflictDto | null>(null)
  const [overwriteConflict, setOverwriteConflict] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Reset draft state if taxYear or person changes
  useEffect(() => {
    setStagedScan(null)
    setLocallyDismissed(false)
    setScanError(null)
    setYearConflict(null)
    setOverwriteConflict(false)
    setPreviewOpen(false)
  }, [taxYear, expectedPerson])

  // Rehydrate pending staged scan draft across page reloads without touching LStB storage
  useEffect(() => {
    if (stagedScan !== null || locallyDismissed) return
    if (advisorSessionQuery.data?.status !== 200) return
    const rehydrated = rehydrateDraftFromAdvisorMessages(advisorSessionQuery.data.data.messages, expectedPerson)
    if (rehydrated !== null) {
      setStagedScan(rehydrated)
    }
  }, [advisorSessionQuery.data, expectedPerson, locallyDismissed, stagedScan])

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('lstb.loading')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('lstb.loadError.heading')}
        message={tr('lstb.loadError.message')}
        retryLabel={tr('lstb.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const response = query.data.data
  const isWeb = typeof document !== 'undefined'

  function send(field: FieldId, data: LstbFieldDto) {
    setField.mutate(
      { jahr: taxYear, feld: field, data, ...(params ? { params } : {}) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getLstbControllerGetLstbQueryKey(taxYear, params) })
          void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
          void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
        },
      },
    )
  }

  async function handleScanFile(file: File | undefined) {
    if (!file) return
    setScanError(null)
    setYearConflict(null)
    setOverwriteConflict(false)
    setLocallyDismissed(false)

    const prelimMime = detectDocumentMimeType(new Uint8Array(0), file.type, file.name)
    if (prelimMime === null) {
      setScanError(tr('lstb.scan.error.unsupportedFile'))
      return
    }

    try {
      setScanBusyPhase('uploading')
      let uploadedReceiptId: string | null = null
      try {
        const uploadRes = await uploadReceiptFile({
          file,
          fileName: file.name,
          kind: 'Sonstiges',
        })
        if (uploadRes.ok) {
          uploadedReceiptId = uploadRes.data.id
          void queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() })
        }
      } catch {
        // Continue OCR + parse even if binary receipt upload is unavailable (e.g. guest mode)
      }

      setScanBusyPhase('detecting')
      const ocrResult = await extractDocumentTextOnDevice(file, {
        fileName: file.name,
        mimeType: file.type,
        onProgress: (p) => {
          if (p.stage !== 'done') {
            setScanBusyPhase(p.stage)
          }
        },
      })

      if (ocrResult.text.trim().length === 0) {
        setScanError(tr('lstb.scan.error.emptyOcr'))
        return
      }

      setScanBusyPhase('parsing')
      const parseRes = await parseReceipt.mutateAsync({
        data: {
          taxYear,
          kind: 'lstb',
          fileName: file.name,
          ...(uploadedReceiptId !== null ? { receiptId: uploadedReceiptId } : {}),
          rawText: ocrResult.text,
          textSource: ocrResult.kind === 'pdf' && !ocrResult.usedOcrFallback ? 'pdf_text' : 'ocr',
          stageDraft: true,
          ...(params ? { person: 'B' } : {}),
        },
      })

      if (parseRes.status !== 200 || !parseRes.data.lstb) {
        setScanError(tr('lstb.scan.error.parseFailed'))
        return
      }

      const lstbScan = parseRes.data.lstb
      if (lstbScan.yearConflict !== null) {
        // Year mismatch: stage nothing and surface explicit switch-year dialog
        setStagedScan(null)
        setYearConflict(lstbScan.yearConflict)
        return
      }

      setStagedScan({
        stage: lstbScan.stage,
        receiptId: lstbScan.receiptId ?? uploadedReceiptId,
        fileName: file.name,
        taxYearOnDocument: lstbScan.taxYearOnDocument,
        actionIds: lstbScan.stagedActionIds,
        fields: {
          bruttoarbeitslohn: buildFieldDraft(lstbScan.fields.bruttoarbeitslohn),
          lohnsteuer: buildFieldDraft(lstbScan.fields.lohnsteuer),
          sozialversicherung: buildFieldDraft(lstbScan.fields.sozialversicherung),
        },
      })
      void queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) })
    } catch {
      setScanError(tr('lstb.scan.error.parseFailed'))
    } finally {
      setScanBusyPhase(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  function updateStagedFieldText(fieldId: FieldId, nextText: string) {
    setStagedScan((prev) => {
      if (prev === null) return null
      const current = prev.fields[fieldId]
      const parsed = integerFrom(nextText)
      return {
        ...prev,
        fields: {
          ...prev.fields,
          [fieldId]: {
            ...current,
            text: nextText,
            confirmed: parsed !== null,
          },
        },
      }
    })
  }

  function confirmStagedField(fieldId: FieldId) {
    setStagedScan((prev) => {
      if (prev === null) return null
      const current = prev.fields[fieldId]
      return {
        ...prev,
        fields: {
          ...prev.fields,
          [fieldId]: {
            ...current,
            confirmed: true,
          },
        },
      }
    })
  }

  async function handleDiscardDraft() {
    if (stagedScan === null) return
    const actionIds = [...stagedScan.actionIds]
    setLocallyDismissed(true)
    setStagedScan(null)
    setOverwriteConflict(false)
    for (const actionId of actionIds) {
      await dismissAction.mutateAsync({ jahr: taxYear, actionId }).catch(() => {})
    }
    void queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) })
  }

  async function handleConfirmScan(overwriteExisting: boolean) {
    if (stagedScan === null) return
    const gross = integerFrom(stagedScan.fields.bruttoarbeitslohn.text)
    const lst = integerFrom(stagedScan.fields.lohnsteuer.text)
    const sv = integerFrom(stagedScan.fields.sozialversicherung.text)
    if (gross === null || lst === null || sv === null) return

    setScanError(null)
    try {
      const res = await confirmScan.mutateAsync({
        jahr: taxYear,
        ...(params ? { params } : {}),
        data: {
          bruttoarbeitslohn: gross,
          lohnsteuer: lst,
          sozialversicherung: sv,
          ...(stagedScan.receiptId !== null ? { receiptId: stagedScan.receiptId } : {}),
          ...(stagedScan.actionIds.length > 0 ? { actionIds: [...stagedScan.actionIds] } : {}),
          ...(overwriteExisting ? { overwriteExisting: true } : {}),
        },
      })

      if (res.status === 200) {
        setLocallyDismissed(true)
        setStagedScan(null)
        setOverwriteConflict(false)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getLstbControllerGetLstbQueryKey(taxYear, params) }),
          queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) }),
          queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) }),
          queryClient.invalidateQueries({ queryKey: getConfirmationControllerGetQueryKey(taxYear) }),
          queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) }),
        ])
        return
      }

      if ((res.status as number) === 409) {
        setOverwriteConflict(true)
        return
      }

      setScanError(tr('lstb.scan.error.confirmFailed'))
    } catch {
      setScanError(tr('lstb.scan.error.confirmFailed'))
    }
  }

  // Evaluate live plausibility & yellow-field confirmation state while a scan draft is active
  const stagedGross = stagedScan ? integerFrom(stagedScan.fields.bruttoarbeitslohn.text) : null
  const stagedLst = stagedScan ? integerFrom(stagedScan.fields.lohnsteuer.text) : null
  const stagedSv = stagedScan ? integerFrom(stagedScan.fields.sozialversicherung.text) : null
  const stagedAllIntegers = stagedGross !== null && stagedLst !== null && stagedSv !== null
  const stagedLiveStatus = stagedAllIntegers
    ? wageTaxCertificateStatus({
        bruttoarbeitslohn: { kind: 'erfasst', value: stagedGross },
        lohnsteuer: { kind: 'erfasst', value: stagedLst },
        sozialversicherung: { kind: 'erfasst', value: stagedSv },
      })
    : null
  const stagedHasWiderspruch = stagedLiveStatus?.kind === 'widerspruch'
  const stagedHasUnconfirmedYellow =
    stagedScan !== null &&
    FIELDS.some((f) => stagedScan.fields[f.id].status === 'pruefen' && !stagedScan.fields[f.id].confirmed)
  const canApplyScan =
    stagedScan !== null && stagedAllIntegers && !stagedHasUnconfirmedYellow && !stagedHasWiderspruch && !confirmScan.isPending

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('lstb.back')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{partnerName === undefined ? tr('lstb.heading') : tr('lstb.headingPartner', { name: partnerName })}</Text>
      <Text style={styles.help}>{tr('lstb.help')}</Text>

      <Card variant="nacht" style={styles.scanCard} testID="lstb-scan-card">
        <Text style={styles.scanHeading}>{tr('lstb.scan.heading')}</Text>
        <Text style={styles.scanBody}>{tr('lstb.scan.help')}</Text>
        {isWeb ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              data-testid="lstb-scan-file-input"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0]
                void handleScanFile(file)
              }}
            />
            <Button
              onPress={() => fileInputRef.current?.click()}
              disabled={scanBusyPhase !== null}
              testID="lstb-scan-cta"
            >
              {scanBusyPhase !== null ? tr(`lstb.scan.progress.${scanBusyPhase}`) : tr('lstb.scan.cta')}
            </Button>
          </>
        ) : (
          <Text style={styles.scanBody}>{tr('lstb.scan.nativeUnsupported')}</Text>
        )}
        {scanError !== null && <Text style={styles.scanErrorText}>{scanError}</Text>}
      </Card>

      {yearConflict !== null && (
        <Card style={styles.conflictCard} testID="lstb-year-conflict-modal">
          <Text style={styles.conflictHeading}>{tr('lstb.scan.yearConflict.title')}</Text>
          <Text style={styles.conflictBody}>
            {tr('lstb.scan.yearConflict.body', {
              documentYear: yearConflict.documentYear,
              activeYear: yearConflict.activeYear,
            })}
          </Text>
          <View style={styles.conflictActions}>
            {onSwitchTaxYear !== undefined && (
              <Button
                onPress={() => {
                  const targetYear = yearConflict.documentYear
                  setYearConflict(null)
                  onSwitchTaxYear(targetYear)
                }}
                style={styles.compactButton}
                testID="lstb-year-conflict-switch"
              >
                {tr('lstb.scan.yearConflict.switchYear', { jahr: yearConflict.documentYear })}
              </Button>
            )}
            <Button
              variant="ghost"
              onPress={() => setYearConflict(null)}
              style={styles.compactButton}
              testID="lstb-year-conflict-cancel"
            >
              {tr('lstb.scan.yearConflict.cancel')}
            </Button>
          </View>
        </Card>
      )}

      {overwriteConflict && (
        <Card style={styles.conflictCard} testID="lstb-overwrite-conflict-modal">
          <Text style={styles.conflictHeading}>{tr('lstb.scan.overwriteConflict.title')}</Text>
          <Text style={styles.conflictBody}>{tr('lstb.scan.overwriteConflict.body', { jahr: taxYear })}</Text>
          <View style={styles.conflictActions}>
            <Button
              onPress={() => void handleConfirmScan(true)}
              disabled={confirmScan.isPending}
              style={styles.compactButton}
              testID="lstb-overwrite-confirm"
            >
              {tr('lstb.scan.overwriteConflict.replace')}
            </Button>
            <Button
              variant="ghost"
              onPress={() => setOverwriteConflict(false)}
              disabled={confirmScan.isPending}
              style={styles.compactButton}
              testID="lstb-overwrite-cancel"
            >
              {tr('lstb.scan.overwriteConflict.cancel')}
            </Button>
          </View>
        </Card>
      )}

      {stagedScan !== null && (
        <Card style={styles.draftBannerCard} testID="lstb-scan-draft-banner">
          <View style={styles.draftHeader}>
            <Text style={styles.draftTitle}>{tr('lstb.scan.draftBanner.title')}</Text>
            <Chip variant={stagedScan.stage === 'llm_text_fallback' ? 'pro' : 'src'}>
              {stagedScan.stage === 'llm_text_fallback'
                ? tr('lstb.scan.draftBanner.stageLlmFallback')
                : tr('lstb.scan.draftBanner.stageDeterministic')}
            </Chip>
          </View>
          <Text style={styles.draftSubtitle}>{tr('lstb.scan.draftBanner.subtitle')}</Text>

          {stagedHasUnconfirmedYellow && (
            <Text style={styles.yellowWarningText}>{tr('lstb.scan.draftBanner.yellowBlocked')}</Text>
          )}

          {stagedHasWiderspruch && stagedLiveStatus?.kind === 'widerspruch' && (
            <View style={styles.widerspruchBlock} testID="lstb-scan-widerspruch">
              <Text style={styles.widerspruchHeading}>{tr('lstb.scan.draftBanner.widerspruchBlocked')}</Text>
              {stagedLiveStatus.conflicts.map((w) => (
                <Text key={w.kind} style={styles.widerspruchItem}>
                  {tr(`lstb.widerspruch.${w.kind}`)}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.draftActions}>
            <Button
              onPress={() => void handleConfirmScan(false)}
              disabled={!canApplyScan}
              style={styles.compactButton}
              testID="lstb-scan-apply"
            >
              {confirmScan.isPending ? tr('lstb.scan.draftBanner.applying') : tr('lstb.scan.draftBanner.apply')}
            </Button>
            {stagedScan.receiptId !== null && (
              <Button
                variant="ghost"
                onPress={() => setPreviewOpen(true)}
                style={styles.compactButton}
                testID="lstb-scan-view-receipt"
              >
                {tr('lstb.scan.draftBanner.viewReceipt')}
              </Button>
            )}
            <Button
              variant="leise"
              onPress={() => void handleDiscardDraft()}
              style={styles.compactButton}
              testID="lstb-scan-discard"
            >
              {tr('lstb.scan.draftBanner.discard')}
            </Button>
          </View>
        </Card>
      )}

      {previewOpen && stagedScan?.receiptId !== null && stagedScan?.receiptId !== undefined && (
        <ReceiptFileModal
          receiptId={stagedScan.receiptId}
          fileName={stagedScan.fileName}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {FIELDS.map((field) => {
        const draft = stagedScan?.fields[field.id] ?? null
        return (
          <LstbFieldEditor
            key={field.id}
            fieldId={field.id}
            label={tr(field.labelKey)}
            state={response[field.id]}
            stagedDraft={draft}
            stagedReceiptName={stagedScan?.fileName ?? null}
            testID={`lstb-${field.id}`}
            onStagedChange={(nextText) => updateStagedFieldText(field.id, nextText)}
            onStagedConfirm={() => confirmStagedField(field.id)}
            onRecorded={(value) => send(field.id, { kind: 'erfasst', value })}
            onUnclear={() => send(field.id, { kind: 'unklar' })}
          />
        )
      })}

      <StateNotice response={response} />

      <InMaskAdvisorCompanion screen="lstb" taxYear={taxYear} />

      <Button onPress={onDone} style={styles.cta} testID="lstb-weiter">
        {tr('lstb.weiter')}
      </Button>
    </ScrollView>
  )
}

function LstbFieldEditor({
  fieldId,
  label,
  state,
  stagedDraft,
  stagedReceiptName,
  testID,
  onStagedChange,
  onStagedConfirm,
  onRecorded,
  onUnclear,
}: {
  readonly fieldId: FieldId
  readonly label: string
  readonly state: LstbFieldDto
  readonly stagedDraft: StagedFieldDraft | null
  readonly stagedReceiptName: string | null
  readonly testID?: string
  readonly onStagedChange: (nextText: string) => void
  readonly onStagedConfirm: () => void
  readonly onRecorded: (value: number) => void
  readonly onUnclear: () => void
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const [text, setText] = useState(state.kind === 'erfasst' ? String(state.value) : '')
  const serverValue = state.kind === 'erfasst' ? state.value : null

  useEffect(() => {
    setText(serverValue === null ? '' : String(serverValue))
  }, [state.kind, serverValue])

  function commit() {
    // Zero-Write guarantee: never auto-PUT while a scanned LStB draft is staged
    if (stagedDraft !== null) return
    const value = integerFrom(text)
    if (value === null) return
    if (state.kind === 'erfasst' && state.value === value) return
    onRecorded(value)
  }

  const displayedValue = stagedDraft !== null ? stagedDraft.text : state.kind === 'unklar' ? '' : text
  const stagedCalculation = stagedDraft !== null ? formatCalculation(stagedDraft.calculation, (line, amount) => tr('lstb.scan.field.calculationTerm', { line, amount })) : null

  return (
    <Feld label={label}>
      {stagedDraft !== null && (
        <View style={s.stagedMetaRow}>
          <HerkunftsChip
            variant={stagedDraft.confirmed ? 'ok' : 'pruefen'}
            testID={`lstb-chip-${fieldId}`}
            source={{
              ...(stagedReceiptName ? { receipt: stagedReceiptName } : {}),
              rule: tr('lstb.scan.field.ruleLabel'),
              ...(stagedCalculation !== null ? { calculationPath: stagedCalculation } : {}),
              ...(stagedDraft.reason ? { reason: tr(`lstb.scan.field.reason.${stagedDraft.reason}`) } : {}),
            }}
          />
          {stagedDraft.status === 'pruefen' && !stagedDraft.confirmed && (
            <Button
              variant="leise"
              onPress={onStagedConfirm}
              style={s.confirmFieldButton}
              testID={`lstb-confirm-field-${fieldId}`}
            >
              {tr('lstb.scan.field.confirm')}
            </Button>
          )}
          {stagedDraft.status === 'pruefen' && stagedDraft.confirmed && (
            <Text style={s.confirmedBadgeText}>{tr('lstb.scan.field.confirmed')}</Text>
          )}
        </View>
      )}
      <View style={s.feldRow}>
        <Input
          type="numeric"
          mono
          value={displayedValue}
          onChange={(next) => {
            if (stagedDraft !== null) {
              onStagedChange(next)
            } else {
              setText(next)
            }
          }}
          placeholder={tr('lstb.feld.placeholder')}
          onSubmit={commit}
          onBlur={commit}
          accessibilityLabel={`${label} (${tr('lstb.feld.placeholder')})`}
          {...(testID ? { testID } : {})}
        />
        {stagedDraft === null && (
          <Pressable accessibilityRole="button" onPress={onUnclear} style={s.unklarButton}>
            <Text style={state.kind === 'unklar' ? s.unklarActive : s.unklarLabel}>{tr('lstb.feld.unklar')}</Text>
          </Pressable>
        )}
      </View>
    </Feld>
  )
}

function StateNotice({ response }: { readonly response: LstbResponseDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const z = response.state

  if (z.kind === 'vollstaendig') {
    return <Text style={s.zustandOk}>{tr('lstb.zustand.vollstaendig')}</Text>
  }
  if (z.kind === 'widerspruch') {
    return (
      <View style={s.widerspruchBlock}>
        <Text style={s.widerspruchHeading}>{tr('lstb.zustand.widerspruch')}</Text>
        {(z.conflicts ?? []).map((w) => (
          <Text key={w.kind} style={s.widerspruchItem}>
            {tr(`lstb.widerspruch.${w.kind}`)}
          </Text>
        ))}
      </View>
    )
  }
  return <Text style={s.zustandOffen}>{tr('lstb.zustand.unvollstaendig', { offen: (z.open ?? []).length, unklar: (z.unclear ?? []).length })}</Text>
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wideScreen: ViewStyle = { ...screen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', marginBottom: t.space.s4 }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['2xl'],
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const help: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s4 }
  const scanCard: ViewStyle = {
    marginBottom: t.space.s4,
    gap: t.space.s2,
  }
  const scanHeading: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    color: t.color.funkeHell,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * t.size.xs,
  }
  const scanBody: TextStyle = {
    color: t.color.nachtText,
    opacity: 0.9,
    fontFamily: t.font.text,
    fontSize: t.size.s,
  }
  const scanErrorText: TextStyle = {
    color: t.color.warn,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
  }
  const conflictCard: ViewStyle = {
    marginBottom: t.space.s4,
    borderWidth: 2,
    borderColor: t.color.warn,
    backgroundColor: t.color.warnWeich,
    gap: t.space.s2,
  }
  const conflictHeading: TextStyle = {
    color: t.color.tinte,
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.l,
  }
  const conflictBody: TextStyle = {
    color: t.color.tinte,
    fontFamily: t.font.text,
    fontSize: t.size.s,
  }
  const conflictActions: ViewStyle = {
    flexDirection: 'row',
    gap: t.space.s2,
    flexWrap: 'wrap',
    marginTop: t.space.s2,
  }
  const draftBannerCard: ViewStyle = {
    marginBottom: t.space.s4,
    borderWidth: 2,
    borderColor: t.color.tinte,
    gap: t.space.s2,
  }
  const draftHeader: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: t.space.s2,
    flexWrap: 'wrap',
  }
  const draftTitle: TextStyle = {
    flex: 1,
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.m,
    color: t.color.tinte,
  }
  const draftSubtitle: TextStyle = {
    color: t.color.tinte2,
    fontFamily: t.font.text,
    fontSize: t.size.s,
  }
  const yellowWarningText: TextStyle = {
    color: t.color.warn,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
  }
  const draftActions: ViewStyle = {
    flexDirection: 'row',
    gap: t.space.s2,
    flexWrap: 'wrap',
    marginTop: t.space.s2,
  }
  const compactButton: ViewStyle = {
    width: 'auto',
    minHeight: 42,
    paddingHorizontal: t.space.s4,
  }
  const stagedMetaRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.s2,
    marginBottom: t.space.s2,
    flexWrap: 'wrap',
  }
  const confirmFieldButton: ViewStyle = {
    width: 'auto',
    minHeight: 32,
    paddingHorizontal: t.space.s3,
  }
  const confirmedBadgeText: TextStyle = {
    color: t.color.ok,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.xs,
  }
  const fieldRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3 }
  const unclearButton: ViewStyle = {
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
  }
  const unclearLabel: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s }
  const unclearActive: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s }
  const stateOk: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.m, marginVertical: t.space.s3 }
  const stateOpen: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginVertical: t.space.s3 }
  const conflictBlock: ViewStyle = { marginVertical: t.space.s3, padding: t.space.s3, borderWidth: t.space.kontur, borderColor: t.color.warn, borderRadius: t.radius.s }
  const conflictBlockHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.m, marginBottom: t.space.s2 }
  const conflictItem: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s1 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return {
    screen,
    wideScreen,
    headerRow,
    heading,
    help,
    scanCard,
    scanHeading,
    scanBody,
    scanErrorText,
    conflictCard,
    conflictHeading,
    conflictBody,
    conflictActions,
    draftBannerCard,
    draftHeader,
    draftTitle,
    draftSubtitle,
    yellowWarningText,
    draftActions,
    compactButton,
    stagedMetaRow,
    confirmFieldButton,
    confirmedBadgeText,
    feldRow: fieldRow,
    unklarButton: unclearButton,
    unklarLabel: unclearLabel,
    unklarActive: unclearActive,
    zustandOk: stateOk,
    zustandOffen: stateOpen,
    widerspruchBlock: conflictBlock,
    widerspruchHeading: conflictBlockHeading,
    widerspruchItem: conflictItem,
    cta,
  }
}
