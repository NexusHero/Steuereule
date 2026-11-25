import { useEffect, useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Feld, HerkunftsChip, Input, useTheme, useBreakpoint, type UiTheme } from '@steuereule/ui'
import {
  useLstbControllerGetLstb,
  useLstbControllerSetField,
  getLstbControllerGetLstbQueryKey,
  getCockpitControllerGetCockpitSummaryQueryKey,
  getTaxEstimateControllerGetQueryKey,
  type LstbFieldDto,
  type LstbResponseDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { formatCalculation } from '../../lib/lstb/formatCalculation'
import { runningTaxYear } from '../../config/taxYear'
import { LoadingState, LoadFailedState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { screenHeaderStyles, unclearableFieldStyles } from '../shared/screenStyles'
import { usePendingMutations } from '../shared/usePendingMutations'
import { SaveFailedNotice } from '../shared/SaveFailedNotice'
import { watchSaveResult } from '../shared/saveFeedback'
import { useTrackField } from '../shared/useTrackField'
import { wholeEurosOrUnreadable } from '../shared/amountField'
import { OfficialFormLink } from '../printout/OfficialFormLink'
import { FIELDS, type FieldId, type StagedFieldDraft } from './scan/lstbScanDraft'
import { LstbScanPanel } from './scan/LstbScanPanel'
import { useLstbScan } from './scan/useLstbScan'
import { ChurchTaxLines } from './ChurchTaxLines'
import { SubsidyLine } from './SubsidyLine'
import { SocialInsuranceLines } from './SocialInsuranceLines'
import { EmployerLine } from './EmployerLine'

export interface LstbScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  /** Set when Person A records the partner's certificate (ADR-0054, partner without an own account). */
  readonly partnerName?: string
  /** Invoked when a scanned LStB belongs to a different tax year and the user switches to it. */
  readonly onSwitchTaxYear?: (year: number) => void
}

export function LstbScreen({ onDone = () => {}, onBack, taxYear = runningTaxYear(), partnerName, onSwitchTaxYear }: LstbScreenProps) {
  const params = partnerName === undefined ? undefined : ({ person: 'B' } as const)
  const expectedPerson: 'A' | 'B' = partnerName === undefined ? 'A' : 'B'
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()

  const query = useLstbControllerGetLstb(taxYear, params)
  const setField = useLstbControllerSetField()
  const scan = useLstbScan({ taxYear, person: expectedPerson })
  const stagedScan = scan.stagedScan
  const { track, flushThen: finish, saveFailed, saveError, clearSaveError } = usePendingMutations()
  const trackField = useTrackField(track, clearSaveError)

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('lstb.loading')} />
  }
  if (query.isError) return <LoadFailedState bp={bp} error={query.error} onRetry={() => void query.refetch()} />

  const response = query.data.data

  function send(field: FieldId, data: LstbFieldDto) {
    trackField(
      field,
      watchSaveResult(setField.mutateAsync({ jahr: taxYear, feld: field, data, ...(params ? { params } : {}) })).then(() => {
        void queryClient.invalidateQueries({ queryKey: getLstbControllerGetLstbQueryKey(taxYear, params) })
        void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
        void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
      }),
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('lstb.back')} onPress={() => finish(onBack)} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{partnerName === undefined ? tr('lstb.heading') : tr('lstb.headingPartner', { name: partnerName })}</Text>
      <Text style={styles.help}>{tr('lstb.help')}</Text>

      <LstbScanPanel scan={scan} taxYear={taxYear} onSwitchTaxYear={onSwitchTaxYear} />

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
            onStagedChange={(nextText) => scan.updateFieldText(field.id, nextText)}
            onStagedConfirm={() => scan.confirmField(field.id)}
            onRecorded={(value) => send(field.id, { kind: 'erfasst', value })}
            onUnclear={() => send(field.id, { kind: 'unklar' })}
          />
        )
      })}

      <StateNotice response={response} />

      <EmployerLine taxYear={taxYear} params={params} track={(p) => trackField('arbeitgeber', p)} />

      <ChurchTaxLines taxYear={taxYear} params={params} track={(p) => trackField('kirchensteuer', p)} />
      <SubsidyLine taxYear={taxYear} params={params} track={(p) => trackField('zuschuesse', p)} />
      <SocialInsuranceLines taxYear={taxYear} params={params} track={(p) => trackField('zeilen', p)} />

      <OfficialFormLink screen="lstb" taxYear={taxYear} />

      <SaveFailedNotice visible={saveFailed || saveError !== null} error={saveError} />
      <Button onPress={() => finish(onDone)} style={styles.cta} testID="lstb-weiter">
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
  const [unreadable, setUnreadable] = useState(false)
  const serverValue = state.kind === 'erfasst' ? state.value : null

  useEffect(() => {
    setText(serverValue === null ? '' : String(serverValue))
  }, [state.kind, serverValue])

  function commit() {
    // Zero-Write guarantee: never auto-PUT while a scanned LStB draft is staged
    if (stagedDraft !== null) return
    const value = wholeEurosOrUnreadable(text)
    // WEB-12: an amount the app cannot read is named at the field, not silently dropped.
    setUnreadable(value === 'unreadable')
    if (value === null || value === 'unreadable') return
    if (state.kind === 'erfasst' && state.value === value) return
    onRecorded(value)
  }

  // WEB-13: after „Kann ich nicht lesen“ the field shows what is typed into it (the server answer clears it).
  const displayedValue = stagedDraft !== null ? stagedDraft.text : text
  const stagedCalculation = stagedDraft !== null ? formatCalculation(stagedDraft.calculation, (line, amount) => tr('lstb.scan.field.calculationTerm', { line, amount })) : null

  return (
    <Feld label={label} {...(unreadable && stagedDraft === null ? { error: tr('betrag.unlesbar') } : {})}>
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
              setUnreadable(false)
            }
          }}
          placeholder={tr('lstb.feld.placeholder')}
          onSubmit={commit}
          onBlur={commit}
          accessibilityLabel={`${label} (${tr('lstb.feld.placeholder')})`}
          {...(testID ? { testID } : {})}
        />
        {stagedDraft === null && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setText('')
              setUnreadable(false)
              onUnclear()
            }}
            style={s.unklarButton}
          >
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
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
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
    ...t.type.captionStrong,
    color: t.color.ok,
  }
  const stateOk: TextStyle = { ...t.type.body, color: t.color.tinte, marginVertical: t.space.s3 }
  const stateOpen: TextStyle = { ...t.type.body, color: t.color.tinte2, marginVertical: t.space.s3 }
  const conflictBlock: ViewStyle = { marginVertical: t.space.s3, padding: t.space.s3, borderWidth: t.space.kontur, borderColor: t.color.warn, borderRadius: t.radius.s }
  const conflictBlockHeading: TextStyle = { ...t.type.itemTitle, color: t.color.tinte, marginBottom: t.space.s2 }
  const conflictItem: TextStyle = { ...t.type.small, color: t.color.tinte, marginBottom: t.space.s1 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return {
    screen,
    wideScreen,
    ...screenHeaderStyles(t),
    stagedMetaRow,
    confirmFieldButton,
    confirmedBadgeText,
    ...unclearableFieldStyles(t),
    zustandOk: stateOk,
    zustandOffen: stateOpen,
    widerspruchBlock: conflictBlock,
    widerspruchHeading: conflictBlockHeading,
    widerspruchItem: conflictItem,
    cta,
  }
}
