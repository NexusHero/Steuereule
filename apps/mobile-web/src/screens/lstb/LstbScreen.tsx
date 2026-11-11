import { useEffect, useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Feld, HerkunftsChip, Input, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
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
import { integerFrom } from '../shared/integer'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { usePendingMutations } from '../shared/usePendingMutations'
import { SaveFailedNotice } from '../shared/SaveFailedNotice'
import { watchSaveResult } from '../shared/saveFeedback'
import { InMaskAdvisorCompanion } from '../advisor/InMaskAdvisorCompanion'
import { FIELDS, type FieldId, type StagedFieldDraft } from './scan/lstbScanDraft'
import { LstbScanPanel } from './scan/LstbScanPanel'
import { useLstbScan } from './scan/useLstbScan'
import { ChurchTaxLines } from './ChurchTaxLines'

export interface LstbScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  /** Set when Person A records the partner's certificate (ADR-0054, partner without an own account). */
  readonly partnerName?: string
  /** Invoked when a scanned LStB belongs to a different tax year and the user switches to it. */
  readonly onSwitchTaxYear?: (year: number) => void
}

export function LstbScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR, partnerName, onSwitchTaxYear }: LstbScreenProps) {
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
  const { track, flushThen: finish, saveFailed } = usePendingMutations()

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

  function send(field: FieldId, data: LstbFieldDto) {
    track(
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

      <ChurchTaxLines taxYear={taxYear} params={params} track={track} />

      <InMaskAdvisorCompanion screen="lstb" taxYear={taxYear} />

      <SaveFailedNotice visible={saveFailed} />
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
