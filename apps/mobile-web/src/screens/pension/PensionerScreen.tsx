import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, inkOnFunke, useTheme, useBreakpoint, type UiTheme, controlLine } from '@steuereule/ui'
import {
  getCockpitControllerGetCockpitSummaryQueryKey,
  getPensionControllerGetQueryKey,
  getTaxEstimateControllerGetQueryKey,
  usePensionControllerGet,
  usePensionControllerSetField,
  usePensionControllerSetPensionKind,
  type PensionFieldDto,
} from '@steuereule/api-client'
import { PENSION_TYPES, type PensionType } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { UnclearableNumberField } from '../shared/UnclearableNumberField'
import { screenHeaderStyles } from '../shared/screenStyles'
import { ItemNotice } from '../shared/ItemNotice'
import { runningTaxYear } from '../../config/taxYear'
import { LoadingState, LoadFailedState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { usePendingMutations } from '../shared/usePendingMutations'
import { SaveFailedNotice } from '../shared/SaveFailedNotice'
import { watchSaveResult } from '../shared/saveFeedback'
import { useTrackField } from '../shared/useTrackField'

type FieldId = 'jahresbetrag' | 'rentenbeginnJahr' | 'alterBeiRentenbeginn'

export interface PensionerScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  /** Set when Person A records the partner's pension (ADR-0088, partner without an own account). */
  readonly partnerName?: string
}

export function PensionerScreen({ onDone = () => {}, onBack, taxYear = runningTaxYear(), partnerName }: PensionerScreenProps) {
  const params = partnerName === undefined ? undefined : ({ person: 'B' } as const)
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = usePensionControllerGet(taxYear, params)
  const setKind = usePensionControllerSetPensionKind()
  const setField = usePensionControllerSetField()
  const { track, flushThen, saveFailed, saveError, clearSaveError } = usePendingMutations()
  const trackField = useTrackField(track, clearSaveError)

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('rente.loading')} />
  }
  if (query.isError) return <LoadFailedState bp={bp} error={query.error} onRetry={() => void query.refetch()} />

  const response = query.data.data

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: getPensionControllerGetQueryKey(taxYear, params) })
    void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
    void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
  }

  function sendKind(kind: PensionType | null) {
    trackField('kind', watchSaveResult(setKind.mutateAsync({ jahr: taxYear, data: { kind }, ...(params ? { params } : {}) })).then(invalidate))
  }

  function send(field: FieldId, data: PensionFieldDto) {
    trackField(field, watchSaveResult(setField.mutateAsync({ jahr: taxYear, feld: field, data, ...(params ? { params } : {}) })).then(invalidate))
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

      <UnclearableNumberField
        label={tr('rente.felder.jahresbetrag')}
        state={response.jahresbetrag}
        placeholder={tr('rente.feld.placeholder')}
        unclearLabel={tr('rente.feld.unklar')}
        onRecorded={(value) => send('jahresbetrag', { kind: 'erfasst', value })}
        onUnclear={() => send('jahresbetrag', { kind: 'unklar' })}
      />
      {showsPensionStartYear ? (
        <UnclearableNumberField
          label={tr('rente.felder.rentenbeginnJahr')}
          whole
          state={response.rentenbeginnJahr}
          placeholder={tr('rente.feld.placeholder')}
          unclearLabel={tr('rente.feld.unklar')}
          onRecorded={(value) => send('rentenbeginnJahr', { kind: 'erfasst', value })}
          onUnclear={() => send('rentenbeginnJahr', { kind: 'unklar' })}
        />
      ) : null}
      {showsAlter ? (
        <UnclearableNumberField
          label={tr('rente.felder.alterBeiRentenbeginn')}
          whole
          state={response.alterBeiRentenbeginn}
          placeholder={tr('rente.feld.placeholder')}
          unclearLabel={tr('rente.feld.unklar')}
          onRecorded={(value) => send('alterBeiRentenbeginn', { kind: 'erfasst', value })}
          onUnclear={() => send('alterBeiRentenbeginn', { kind: 'unklar' })}
        />
      ) : null}

      <ItemNotice
        amount={response.items[0]?.amount}
        openLabel={tr('rente.posten.offen')}
        heading={tr('rente.posten.heading')}
        source={response.items[0]?.provenance ?? ''}
      />

      <SaveFailedNotice visible={saveFailed || saveError !== null} error={saveError} />
      <Button onPress={() => flushThen(onDone)} style={styles.cta}>
        {tr('rente.weiter')}
      </Button>
    </ScrollView>
  )
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
  const sectionHeading: TextStyle = { ...t.type.bodyStrong, color: t.color.tinte, marginBottom: t.space.s2 }
  const kindButton: ViewStyle = {
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    borderWidth: t.space.kontur,
    borderColor: controlLine(t),
    borderRadius: t.radius.s,
    marginBottom: t.space.s2,
  }
  const kindButtonActive: ViewStyle = { backgroundColor: t.color.funke, borderColor: t.color.funke }
  const kindLabel: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const kindLabelActive: TextStyle = { ...t.type.label, color: inkOnFunke(t) }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return {
    screen,
    wideScreen,
    ...screenHeaderStyles(t),
    sectionHeading,
    artButton: kindButton,
    artButtonActive: kindButtonActive,
    artLabel: kindLabel,
    artLabelActive: kindLabelActive,
    cta,
  }
}
