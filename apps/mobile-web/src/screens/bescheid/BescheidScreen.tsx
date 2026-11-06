import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Feld, Input, Pill, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { formatEuro } from '@steuereule/core'
import {
  useAssessmentControllerGet,
  useAssessmentControllerSetDate,
  useAssessmentControllerSetAppeal,
  useAssessmentControllerSetField,
  useAssessmentControllerSetStatus,
  getAssessmentControllerGetQueryKey,
  type AssessmentDeviationDto,
  type AssessmentResponseDto,
  type PutAssessmentFieldDto,
  type SetAssessmentStatusDtoStatus,
  type SetAppealDtoReason,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

type FieldId = 'einnahmen' | 'vorsorgeaufwand' | 'anrechnung' | 'festgesetzteSteuer' | 'erstattung'

const FIELDS: readonly { id: FieldId; labelKey: string }[] = [
  { id: 'einnahmen', labelKey: 'bescheid.felder.einnahmen' },
  { id: 'vorsorgeaufwand', labelKey: 'bescheid.felder.vorsorgeaufwand' },
  { id: 'anrechnung', labelKey: 'bescheid.felder.anrechnung' },
  { id: 'festgesetzteSteuer', labelKey: 'bescheid.felder.festgesetzteSteuer' },
  { id: 'erstattung', labelKey: 'bescheid.felder.erstattung' },
]

const REASONS: readonly { id: 'betrag-falsch' | 'beleg-nicht-beruecksichtigt' | 'sonstiges'; labelKey: string }[] = [
  { id: 'betrag-falsch', labelKey: 'bescheid.einspruch.grund.betrag-falsch' },
  { id: 'beleg-nicht-beruecksichtigt', labelKey: 'bescheid.einspruch.grund.beleg-nicht-beruecksichtigt' },
  { id: 'sonstiges', labelKey: 'bescheid.einspruch.grund.sonstiges' },
]

export interface AssessmentScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
}

export function AssessmentScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR }: AssessmentScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useAssessmentControllerGet(taxYear)
  const setField = useAssessmentControllerSetField()
  const setDate = useAssessmentControllerSetDate()
  const setStatus = useAssessmentControllerSetStatus()
  const setAppeal = useAssessmentControllerSetAppeal()

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('bescheid.loading')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('bescheid.loadError.heading')}
        message={tr('bescheid.loadError.message')}
        retryLabel={tr('bescheid.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const response = query.data.data

  const refetch = () => void queryClient.invalidateQueries({ queryKey: getAssessmentControllerGetQueryKey(taxYear) })

  function sendField(field: FieldId, data: PutAssessmentFieldDto) {
    setField.mutate({ jahr: taxYear, feld: field, data }, { onSuccess: refetch })
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('bescheid.back')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{tr('bescheid.heading')}</Text>
      <Text style={styles.help}>{tr('bescheid.help')}</Text>

      <FristBanner frist={response.frist} />

      {FIELDS.map((field) => (
        <AssessmentFieldEditor
          key={field.id}
          fieldId={field.id}
          label={tr(field.labelKey)}
          state={response.fields.find((f) => f.id === field.id)}
          onRecorded={(value) => sendField(field.id, { kind: 'erfasst', value })}
          onUnclear={() => sendField(field.id, { kind: 'unklar' })}
        />
      ))}

      <DateEditor date={response.frist.assessmentDate} onSet={(date) => setDate.mutate({ jahr: taxYear, data: { date } }, { onSuccess: refetch })} />

      <ReconciliationSection response={response} />

      <StatusSection response={response} onSetStatus={(status) => setStatus.mutate({ jahr: taxYear, data: { status } }, { onSuccess: refetch })} />

      <AppealSection
        response={response}
        onAppeal={(reason) => setAppeal.mutate({ jahr: taxYear, data: { reason } }, { onSuccess: refetch })}
      />

      <Button onPress={onDone} style={styles.cta}>
        {tr('bescheid.done')}
      </Button>
    </ScrollView>
  )
}

function FristBanner({ frist }: { readonly frist: AssessmentResponseDto['frist'] }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  if (frist.assessmentDate === null) {
    return (
      <Card variant="nacht">
        <Text style={s.fristHeading}>{tr('bescheid.frist.nochKeinDatum')}</Text>
      </Card>
    )
  }
  const expired = (frist.remainingDays ?? 0) < 0
  return (
    <Card variant="nacht">
      <Text style={s.fristHeading}>{tr('bescheid.frist.heading')}</Text>
      {expired ? (
        <Text style={s.fristBody}>{tr('bescheid.frist.abgelaufen', { ende: frist.deadlineEnd })}</Text>
      ) : (
        <Text style={s.fristBody}>{tr('bescheid.frist.verbleibend', { tage: frist.remainingDays, ende: frist.deadlineEnd })}</Text>
      )}
    </Card>
  )
}

function AssessmentFieldEditor({
  fieldId,
  label,
  state,
  onRecorded,
  onUnclear,
}: {
  readonly fieldId: FieldId
  readonly label: string
  readonly state: { kind: 'erfasst' | 'offen' | 'unklar'; value?: number } | undefined
  readonly onRecorded: (value: number) => void
  readonly onUnclear: () => void
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const kind = state?.kind ?? 'offen'
  const [text, setText] = useState(kind === 'erfasst' ? String(state?.value) : '')

  function commit() {
    const trimmed = text.trim()
    const muster = fieldId === 'erstattung' ? /^-?(0|[1-9]\d*)$/ : /^(0|[1-9]\d*)$/
    if (!muster.test(trimmed)) return
    const value = Number(trimmed)
    if (state?.kind === 'erfasst' && state.value === value) return
    onRecorded(value)
  }

  return (
    <Feld label={label}>
      <View style={s.feldRow}>
        <Input
          type="numeric"
          mono
          value={kind === 'unklar' ? '' : text}
          onChange={setText}
          placeholder={tr('bescheid.feld.placeholder')}
          onSubmit={commit}
          onBlur={commit}
          accessibilityLabel={`${label} (${tr('bescheid.feld.placeholder')})`}
        />
        <Pressable accessibilityRole="button" onPress={onUnclear} style={s.unklarButton}>
          <Text style={kind === 'unklar' ? s.unklarActive : s.unklarLabel}>{tr('bescheid.feld.unklar')}</Text>
        </Pressable>
      </View>
    </Feld>
  )
}

function DateEditor({ date, onSet }: { readonly date: string | null; readonly onSet: (datum: string | null) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const [text, setText] = useState(date ?? '')

  function commit() {
    if (text !== date && /^\d{4}-\d{2}-\d{2}$/.test(text)) onSet(text)
  }

  return (
    <Feld label={tr('bescheid.datum.label')}>
      <View style={s.feldRow}>
        <Input
          type="text"
          mono
          value={text}
          onChange={setText}
          placeholder="JJJJ-MM-TT"
          onSubmit={commit}
          onBlur={commit}
          accessibilityLabel={tr('bescheid.datum.label')}
        />
      </View>
    </Feld>
  )
}

function ReconciliationSection({ response }: { readonly response: AssessmentResponseDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const deviations = response.reconciliation.deviations

  return (
    <View style={s.section}>
      <Text style={s.sectionHeading}>{tr('bescheid.abgleich.heading')}</Text>
      {response.reconciliation.calculationIncomplete ? (
        <Text style={s.muted}>{tr('bescheid.abgleich.unvollstaendig')}</Text>
      ) : null}
      {deviations.length === 0 ? (
        <Text style={s.ok}>{tr('bescheid.abgleich.stimmt')}</Text>
      ) : (
        deviations.map((a) => <DeviationRow key={a.field} a={a} />)
      )}
    </View>
  )
}

function DeviationRow({ a }: { readonly a: AssessmentDeviationDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  return (
    <Card>
      <View style={s.abweichungHead}>
        <Text style={s.abweichungFeld}>{tr(`bescheid.felder.${a.field}`)}</Text>
        <Text style={s.abweichungDelta}>{a.difference > 0 ? '+' : ''}{formatEuro(a.difference)}</Text>
      </View>
      <Text style={s.abweichungBody}>
        {tr('bescheid.abgleich.zeile', { bescheid: formatEuro(a.assessment), berechnet: formatEuro(a.calculated) })}
      </Text>
    </Card>
  )
}

function StatusSection({ response, onSetStatus }: { readonly response: AssessmentResponseDto; readonly onSetStatus: (status: SetAssessmentStatusDtoStatus) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const next = response.nextStates.filter((z) => z === 'geprüft' || z === 'einspruch-eingelegt') as SetAssessmentStatusDtoStatus[]
  return (
    <View style={s.section}>
      <Text style={s.sectionHeading}>{tr('bescheid.status.heading')}</Text>
      <View style={s.statusRow}>
        <Pill>{tr(`bescheid.status.${response.status}`)}</Pill>
      </View>
      {next.includes('geprüft') ? (
        <Button onPress={() => onSetStatus('geprüft')} style={s.cta}>
          {tr('bescheid.status.alsGeprueft')}
        </Button>
      ) : null}
    </View>
  )
}

function AppealSection({ response, onAppeal }: { readonly response: AssessmentResponseDto; readonly onAppeal: (reason: SetAppealDtoReason) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)

  if (!response.nextStates.includes('einspruch-eingelegt')) {
    if (response.status === 'einspruch-eingelegt') {
      return (
        <View style={s.section}>
          <Text style={s.sectionHeading}>{tr('bescheid.einspruch.heading')}</Text>
          <Text style={s.ok}>{tr('bescheid.einspruch.eingelegt', { grund: tr(`bescheid.einspruch.grund.${response.appealReason ?? 'sonstiges'}`) })}</Text>
        </View>
      )
    }
    return null
  }

  return (
    <View style={s.section}>
      <Text style={s.sectionHeading}>{tr('bescheid.einspruch.heading')}</Text>
      <Text style={s.muted}>{tr('bescheid.einspruch.help')}</Text>
      {REASONS.map((g) => (
        <Button key={g.id} variant="ghost" onPress={() => onAppeal(g.id)} style={s.grundButton}>
          {tr(g.labelKey)}
        </Button>
      ))}
    </View>
  )
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
  const section: ViewStyle = { marginTop: t.space.s4 }
  const sectionHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.m, marginBottom: t.space.s2 }
  const muted: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s2 }
  const ok: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s2 }
  const fristHeading: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.xs, color: t.color.funkeHell, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs, marginBottom: t.space.s2 }
  const fristBody: TextStyle = { color: t.color.nachtText, opacity: 0.85, fontFamily: t.font.text, fontSize: t.size.s }
  const deviationHead: ViewStyle = { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: t.space.s3 }
  const deviationField: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s }
  const deviationDelta: TextStyle = { color: t.color.warn, fontFamily: t.font.mono, fontWeight: t.weight.schwer, fontSize: t.size.m }
  const deviationBody: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginTop: t.space.s2 }
  const statusRow: ViewStyle = { flexDirection: 'row', gap: t.space.s2, marginBottom: t.space.s2 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  const reasonButton: ViewStyle = { marginTop: t.space.s2 }
  return {
    screen, wideScreen, headerRow, heading, help, feldRow: fieldRow, unklarButton: unclearButton, unklarLabel: unclearLabel, unklarActive: unclearActive,
    section, sectionHeading, muted, ok, fristHeading, fristBody, abweichungHead: deviationHead, abweichungFeld: deviationField,
    abweichungDelta: deviationDelta, abweichungBody: deviationBody, statusRow, cta, grundButton: reasonButton,
  }
}
