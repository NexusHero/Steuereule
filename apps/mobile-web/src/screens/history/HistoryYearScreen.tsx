import { ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { FLOW_CONTENT_MAX_WIDTH, Button, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import type { YearHistoryResponseDto, YearListItemDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { SELECTABLE_TAX_YEARS } from '../../config/taxYear'
import { BackButton } from '../shared/BackButton'
import { AssessmentDiffView } from './AssessmentDiffView'
import { HistoryGate, historyScreenStyles } from './HistoryGate'
import { historyStyles } from './historyStyles'
import { filingTypeChange, missingDetail } from './historyTimeline'
import { usePositionLabel } from './positionLabels'

export interface HistoryYearScreenProps {
  readonly year: number
  readonly isGuest: boolean
  readonly onBack: () => void
  readonly onRegister?: (() => void) | undefined
  readonly onLogin?: (() => void) | undefined
  /** Opens the year's cockpit. */
  readonly onOpenYear?: ((year: number) => void) | undefined
  /** „Einspruch vorbereiten“: the Bescheidprüfung of the year with its Einspruch. */
  readonly onPrepareAppeal?: ((year: number) => void) | undefined
}

/** One year of the Verlauf (ADR-0098 §1, §8): one sentence on where it stands, then what belongs to its kind. */
export function HistoryYearScreen(props: HistoryYearScreenProps) {
  return (
    <HistoryGate isGuest={props.isGuest} onRegister={props.onRegister} onLogin={props.onLogin}>
      {(data) => <YearLoaded {...props} data={data} />}
    </HistoryGate>
  )
}

function statusSentence(item: YearListItemDto, tr: TFunction): string {
  switch (item.kind) {
    case 'offen':
      return tr('verlauf.jahr.satz.offen')
    case 'eingereicht':
      return tr('verlauf.jahr.satz.eingereicht')
    case 'eckjahr':
      return tr('verlauf.jahr.satz.nurBescheid', { jahr: item.year })
    case 'bescheid':
      if (item.noDiffReason === 'keine-eingereichte-fassung') return tr('verlauf.jahr.satz.ohneFassung', { jahr: item.year })
      return item.deviations > 0 ? tr('verlauf.jahr.satz.aenderungen', { count: item.deviations }) : tr('verlauf.jahr.satz.wieErklaert')
  }
}

function YearLoaded({ data, year, onBack, onOpenYear, onPrepareAppeal }: HistoryYearScreenProps & { readonly data: YearHistoryResponseDto }) {
  const bp = useBreakpoint()
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const item = data.list.find((l) => l.year === year)
  const selectable = SELECTABLE_TAX_YEARS.includes(year)

  const back = <BackButton accessibilityLabel={tr('verlauf.zurueck')} onPress={onBack} testID="verlauf-jahr-zurueck" />
  if (item === undefined) {
    return (
      <ScrollView contentContainerStyle={bp === 's' ? s.screen : s.wideScreen} testID="screen-container">
        {back}
        <View style={s.card} testID="verlauf-jahr-unbekannt">
          <Text style={s.cardTitle} accessibilityRole="header">
            {tr('verlauf.jahr.unbekannt.titel', { jahr: year })}
          </Text>
          <Text style={s.muted}>{tr('verlauf.jahr.unbekannt.text')}</Text>
        </View>
      </ScrollView>
    )
  }

  const change = filingTypeChange(data, year)
  return (
    <ScrollView contentContainerStyle={bp === 's' ? s.screen : s.wideScreen} testID="screen-container">
      {back}
      <View style={s.head}>
        <Text style={s.title} accessibilityRole="header" testID="verlauf-jahr-titel">
          {year}
        </Text>
        <Text style={s.body} testID="verlauf-jahr-satz">
          {statusSentence(item, tr)}
        </Text>
        {change !== null ? (
          <Text style={s.muted} testID="verlauf-jahr-wechsel">
            {tr(change === 'zusammen' ? 'verlauf.chart.wechselZusammen' : 'verlauf.chart.wechselEinzeln', { jahr: year })}
          </Text>
        ) : null}
      </View>
      <YearBody data={data} item={item} onPrepareAppeal={onPrepareAppeal && selectable ? () => onPrepareAppeal(year) : undefined} />
      {onOpenYear && selectable ? (
        <View style={{ width: '100%', maxWidth: FLOW_CONTENT_MAX_WIDTH }}>
          <Button variant="ghost" onPress={() => onOpenYear(year)} testID={`verlauf-zum-cockpit-${year}`}>
            {tr('verlauf.zumCockpit', { jahr: year })}
          </Button>
        </View>
      ) : null}
    </ScrollView>
  )
}

function YearBody({ data, item, onPrepareAppeal }: { readonly data: YearHistoryResponseDto; readonly item: YearListItemDto; readonly onPrepareAppeal?: (() => void) | undefined }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const label = usePositionLabel()
  const year = item.year
  const diffs = data.diffs.filter((d) => d.year === year)

  if (diffs.length > 0) {
    const maskYear = data.maskLessons?.fromYear === year ? data.maskLessons.year : null
    // Two single returns: both Abgleiche, one per person.
    return (
      <>
        {diffs.map((d) => (
          <AssessmentDiffView
            key={`${d.year}-${d.person ?? 'beide'}`}
            diff={d.diff}
            deadline={d.deadline}
            submittedOn={d.submittedOn}
            assessmentDate={d.assessmentDate}
            person={d.person}
            lessons={d.lessons}
            maskYear={maskYear}
            onPrepareAppeal={onPrepareAppeal}
            yearInTitle={false}
            testID={d.person === null ? `verlauf-abgleich-${year}` : `verlauf-abgleich-${year}-${d.person}`}
          />
        ))}
      </>
    )
  }

  if (item.kind === 'eingereicht') {
    const cuts = data.openItems.find((o) => o.year === year && o.kind === 'wartet-auf-bescheid')?.repeatedCuts ?? []
    if (cuts.length === 0) return null
    return (
      <View style={s.card} testID={`verlauf-wartet-${year}`}>
        <Text style={s.cardTitle} accessibilityRole="header">
          {tr('verlauf.wartet.titel')}
        </Text>
        <Text style={s.muted}>{tr('verlauf.wartet.text', { count: cuts.length, vorjahr: year - 1, jahr: year })}</Text>
        <View style={s.items}>
          {cuts.map((c) => (
            <Text key={c.position} style={s.strong}>
              {label(c.position, c.label)}
            </Text>
          ))}
        </View>
        <Text style={s.muted}>{tr('verlauf.wartet.keineVorhersage')}</Text>
      </View>
    )
  }

  if (item.kind === 'offen') {
    const entry = data.years.find((y) => y.year === year)
    const missing = missingDetail(entry?.missing ?? data.openItems.find((o) => o.year === year)?.missing ?? [], year, data.today, tr)
    if (missing.length === 0) return null
    return (
      <View style={s.card} testID={`verlauf-fehlt-${year}`}>
        <Text style={s.cardTitle} accessibilityRole="header">
          {tr('verlauf.jahr.fehltTitel')}
        </Text>
        <View style={s.items}>
          {missing.map((m) => (
            <Text key={m} style={s.body}>{`· ${m}`}</Text>
          ))}
        </View>
      </View>
    )
  }
  return null
}

function makeStyles(t: UiTheme) {
  const base = historyStyles(t)
  const head: ViewStyle = { gap: t.space.s1 }
  const items: ViewStyle = { gap: t.space.s2, borderTopWidth: 1, borderTopColor: t.color.linieWeich, paddingTop: t.space.s3 }
  const title: TextStyle = { ...t.type.title, color: t.color.tinte }
  return { ...base, ...historyScreenStyles(t), head, items, title }
}
