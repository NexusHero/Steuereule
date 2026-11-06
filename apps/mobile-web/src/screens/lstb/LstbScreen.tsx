import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Feld, Input, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  useLstbControllerGetLstb,
  useLstbControllerSetField,
  getLstbControllerGetLstbQueryKey,
  type LstbFieldDto,
  type LstbResponseDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { integerFrom } from '../shared/integer'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

type FieldId = 'bruttoarbeitslohn' | 'lohnsteuer' | 'sozialversicherung'

const FIELDS: readonly { id: FieldId; labelKey: string }[] = [
  { id: 'bruttoarbeitslohn', labelKey: 'lstb.felder.bruttoarbeitslohn' },
  { id: 'lohnsteuer', labelKey: 'lstb.felder.lohnsteuer' },
  { id: 'sozialversicherung', labelKey: 'lstb.felder.sozialversicherung' },
]

export interface LstbScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  /** Set when Person A records the partner's certificate (ADR-0054, partner without an own account). */
  readonly partnerName?: string
}

export function LstbScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR, partnerName }: LstbScreenProps) {
  const params = partnerName === undefined ? undefined : ({ person: 'B' } as const)
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useLstbControllerGetLstb(taxYear, params)
  const setField = useLstbControllerSetField()

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
    setField.mutate(
      { jahr: taxYear, feld: field, data, ...(params ? { params } : {}) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getLstbControllerGetLstbQueryKey(taxYear, params) })
        },
      },
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('lstb.back')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{partnerName === undefined ? tr('lstb.heading') : tr('lstb.headingPartner', { name: partnerName })}</Text>
      <Text style={styles.help}>{tr('lstb.help')}</Text>

      {FIELDS.map((field) => (
        <LstbFieldEditor
          key={field.id}
          label={tr(field.labelKey)}
          state={response[field.id]}
          onRecorded={(value) => send(field.id, { kind: 'erfasst', value })}
          onUnclear={() => send(field.id, { kind: 'unklar' })}
        />
      ))}

      <StateNotice response={response} />

      <Button onPress={onDone} style={styles.cta}>
        {tr('lstb.weiter')}
      </Button>
    </ScrollView>
  )
}

function LstbFieldEditor({
  label,
  state,
  onRecorded,
  onUnclear,
}: {
  readonly label: string
  readonly state: LstbFieldDto
  readonly onRecorded: (value: number) => void
  readonly onUnclear: () => void
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const [text, setText] = useState(state.kind === 'erfasst' ? String(state.value) : '')

  function commit() {
    const value = integerFrom(text)
    if (value === null) return
    if (state.kind === 'erfasst' && state.value === value) return
    onRecorded(value)
  }

  return (
    <Feld label={label}>
      <View style={s.feldRow}>
        <Input
          type="numeric"
          mono
          value={state.kind === 'unklar' ? '' : text}
          onChange={setText}
          placeholder={tr('lstb.feld.placeholder')}
          onSubmit={commit}
          onBlur={commit}
          accessibilityLabel={`${label} (${tr('lstb.feld.placeholder')})`}
        />
        <Pressable accessibilityRole="button" onPress={onUnclear} style={s.unklarButton}>
          <Text style={state.kind === 'unklar' ? s.unklarActive : s.unklarLabel}>{tr('lstb.feld.unklar')}</Text>
        </Pressable>
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
  const conflictHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.m, marginBottom: t.space.s2 }
  const conflictItem: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s1 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return { screen, wideScreen, headerRow, heading, help, feldRow: fieldRow, unklarButton: unclearButton, unklarLabel: unclearLabel, unklarActive: unclearActive, zustandOk: stateOk, zustandOffen: stateOpen, widerspruchBlock: conflictBlock, widerspruchHeading: conflictHeading, widerspruchItem: conflictItem, cta }
}
