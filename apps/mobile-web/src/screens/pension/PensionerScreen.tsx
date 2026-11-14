import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Feld, Input, inkOnFunke, useTheme, useBreakpoint, type UiTheme } from '@steuereule/ui'
import {
  getCockpitControllerGetCockpitSummaryQueryKey,
  getPensionControllerGetQueryKey,
  getTaxEstimateControllerGetQueryKey,
  usePensionControllerGet,
  usePensionControllerSetField,
  usePensionControllerSetPensionKind,
  type PensionFieldDto,
  type PensionResponseDto,
} from '@steuereule/api-client'
import { PENSION_TYPES, type PensionType } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { integerFrom } from '../shared/integer'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { usePendingMutations } from '../shared/usePendingMutations'
import { SaveFailedNotice } from '../shared/SaveFailedNotice'
import { watchSaveResult } from '../shared/saveFeedback'

type FieldId = 'jahresbetrag' | 'rentenbeginnJahr' | 'alterBeiRentenbeginn'

export interface PensionerScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  /** Set when Person A records the partner's pension (ADR-0088, partner without an own account). */
  readonly partnerName?: string
}

export function PensionerScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR, partnerName }: PensionerScreenProps) {
  const params = partnerName === undefined ? undefined : ({ person: 'B' } as const)
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = usePensionControllerGet(taxYear, params)
  const setKind = usePensionControllerSetPensionKind()
  const setField = usePensionControllerSetField()
  const { track, flushThen, saveFailed } = usePendingMutations()

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('rente.loading')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('rente.loadError.heading')}
        message={tr('rente.loadError.message')}
        retryLabel={tr('rente.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const response = query.data.data

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: getPensionControllerGetQueryKey(taxYear, params) })
    void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
    void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
  }

  function sendKind(kind: PensionType | null) {
    track(watchSaveResult(setKind.mutateAsync({ jahr: taxYear, data: { kind }, ...(params ? { params } : {}) })).then(invalidate))
  }

  function send(field: FieldId, data: PensionFieldDto) {
    track(watchSaveResult(setField.mutateAsync({ jahr: taxYear, feld: field, data, ...(params ? { params } : {}) })).then(invalidate))
  }

  const showsPensionStartYear = response.kind !== null && response.kind !== 'PrivateRentenversicherung'
  const showsAlter = response.kind === 'PrivateRentenversicherung'

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('rente.back')} onPress={() => flushThen(onBack)} testID="rente-zurueck" /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading} testID="rente-heading">{tr('rente.heading')}</Text>
      {partnerName !== undefined ? <Text testID="rente-partner-hinweis">{tr('rente.partnerFor', { name: partnerName })}</Text> : null}
      <Text style={styles.help}>{tr('rente.help')}</Text>

      <Text style={styles.sectionHeading}>{tr('rente.artHeading')}</Text>
      {PENSION_TYPES.map((kind) => (
        <Pressable
          key={kind}
          accessibilityRole="button"
          onPress={() => sendKind(kind)}
          style={[styles.artButton, response.kind === kind ? styles.artButtonActive : null]}
        >
          <Text style={response.kind === kind ? styles.artLabelActive : styles.artLabel}>{tr(`rente.arten.${kind}`)}</Text>
        </Pressable>
      ))}

      <PensionFieldEditor
        label={tr('rente.felder.jahresbetrag')}
        state={response.jahresbetrag}
        onRecorded={(value) => send('jahresbetrag', { kind: 'erfasst', value })}
        onUnclear={() => send('jahresbetrag', { kind: 'unklar' })}
      />
      {showsPensionStartYear ? (
        <PensionFieldEditor
          label={tr('rente.felder.rentenbeginnJahr')}
          state={response.rentenbeginnJahr}
          onRecorded={(value) => send('rentenbeginnJahr', { kind: 'erfasst', value })}
          onUnclear={() => send('rentenbeginnJahr', { kind: 'unklar' })}
        />
      ) : null}
      {showsAlter ? (
        <PensionFieldEditor
          label={tr('rente.felder.alterBeiRentenbeginn')}
          state={response.alterBeiRentenbeginn}
          onRecorded={(value) => send('alterBeiRentenbeginn', { kind: 'erfasst', value })}
          onUnclear={() => send('alterBeiRentenbeginn', { kind: 'unklar' })}
        />
      ) : null}

      <ItemNotice response={response} />

      <SaveFailedNotice visible={saveFailed} />
      <Button onPress={() => flushThen(onDone)} style={styles.cta}>
        {tr('rente.weiter')}
      </Button>
    </ScrollView>
  )
}

function PensionFieldEditor({
  label,
  state,
  onRecorded,
  onUnclear,
}: {
  readonly label: string
  readonly state: PensionFieldDto
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
          placeholder={tr('rente.feld.placeholder')}
          onSubmit={commit}
          onBlur={commit}
          accessibilityLabel={`${label} (${tr('rente.feld.placeholder')})`}
        />
        <Pressable accessibilityRole="button" onPress={onUnclear} style={s.unklarButton}>
          <Text style={state.kind === 'unklar' ? s.unklarActive : s.unklarLabel}>{tr('rente.feld.unklar')}</Text>
        </Pressable>
      </View>
    </Feld>
  )
}

function ItemNotice({ response }: { readonly response: PensionResponseDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const items = response.items[0]

  if (items === undefined) {
    return <Text style={s.postenOffen}>{tr('rente.posten.offen')}</Text>
  }
  return (
    <View style={s.postenBlock}>
      <Text style={s.postenHeading}>{tr('rente.posten.heading')}</Text>
      <Text style={s.postenBetrag}>{`${items.amount} €`}</Text>
      <Text style={s.postenHerkunft}>{items.provenance}</Text>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', marginBottom: t.space.s4 }
  const heading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const help: TextStyle = { ...t.type.body, color: t.color.tinte2, marginBottom: t.space.s4 }
  const sectionHeading: TextStyle = { ...t.type.bodyStrong, color: t.color.tinte, marginBottom: t.space.s2 }
  const kindButton: ViewStyle = {
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
    marginBottom: t.space.s2,
  }
  const kindButtonActive: ViewStyle = { backgroundColor: t.color.funke, borderColor: t.color.funke }
  const kindLabel: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const kindLabelActive: TextStyle = { ...t.type.label, color: inkOnFunke(t) }
  const fieldRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3 }
  const unclearButton: ViewStyle = {
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
  }
  const unclearLabel: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const unclearActive: TextStyle = { ...t.type.label, color: t.color.tinte }
  const itemsBlock: ViewStyle = { marginVertical: t.space.s3, padding: t.space.s3, borderWidth: t.space.kontur, borderColor: t.color.tinte, borderRadius: t.radius.s }
  const itemsHeading: TextStyle = { ...t.type.itemTitle, color: t.color.tinte, marginBottom: t.space.s1 }
  const itemAmount: TextStyle = { ...t.type.headline, color: t.color.tinte }
  const itemSource: TextStyle = { ...t.type.small, color: t.color.tinte2, marginTop: t.space.s1 }
  const itemsOpen: TextStyle = { ...t.type.body, color: t.color.tinte2, marginVertical: t.space.s3 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return {
    screen,
    wideScreen,
    headerRow,
    heading,
    help,
    sectionHeading,
    artButton: kindButton,
    artButtonActive: kindButtonActive,
    artLabel: kindLabel,
    artLabelActive: kindLabelActive,
    feldRow: fieldRow,
    unklarButton: unclearButton,
    unklarLabel: unclearLabel,
    unklarActive: unclearActive,
    postenBlock: itemsBlock,
    postenHeading: itemsHeading,
    postenBetrag: itemAmount,
    postenHerkunft: itemSource,
    postenOffen: itemsOpen,
    cta,
  }
}
