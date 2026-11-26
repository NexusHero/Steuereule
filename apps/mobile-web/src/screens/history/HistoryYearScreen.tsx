import { ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { FLOW_CONTENT_MAX_WIDTH, Button, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import type { YearHistoryResponseDto, YearListItemDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { selectableTaxYears } from '../../config/taxYear'
import { BackButton } from '../shared/BackButton'
import { AssessmentDiffView } from './AssessmentDiffView'
import { HistoryGate, historyScreenStyles } from './HistoryGate'
import { historyStyles } from './historyStyles'
import { filingTypeChange, missingDetail, yearFigure } from './historyTimeline'
import { germanDate } from './historyFormat'
import { asksFiledElsewhere } from './historyInsights'
import { FiledElsewhereQuestion } from './FiledElsewhereQuestion'
import { CoupleNote, PrepaymentNote, RecurringChecklist, RepeatedCutNotes } from './HistoryYearInsights'
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
  /** „Belege hochladen“ from the checklist: the Belege tab with its one pipeline (ADR-0097). */
  readonly onOpenReceipts?: (() => void) | undefined
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
  // A year of the Festsetzungsfrist without data (ADR-0099 §1).
  if (item.withoutAssessment || item.filedElsewhere?.answer === 'ja') return tr('verlauf.jahr.satz.anderswo', { jahr: item.year })
  if (!item.hasData) return tr('verlauf.jahr.satz.luecke', { jahr: item.year, datum: germanDate(item.deadline.endsOn) })
  switch (item.kind) {
    case 'offen':
      return tr('verlauf.jahr.satz.offen')
    case 'eingereicht':
      return tr('verlauf.jahr.satz.eingereicht')
    case 'eckjahr':
      return tr('verlauf.jahr.satz.nurBescheid', { jahr: item.year })
    case 'bescheid':
      if (item.noDiffReason === 'keine-eingereichte-fassung') return tr('verlauf.jahr.satz.ohneFassung', { jahr: item.year })
      if (item.deviations === 0) return tr('verlauf.jahr.satz.wieErklaert')
      // A change that left the refund where it was says so, instead of a headline that looks like a cut.
      return tr(item.difference === 0 ? 'verlauf.jahr.satz.ohneWirkung' : 'verlauf.jahr.satz.aenderungen', { count: item.deviations })
  }
}

function YearLoaded({ data, year, onBack, onOpenYear, onPrepareAppeal, onOpenReceipts }: HistoryYearScreenProps & { readonly data: YearHistoryResponseDto }) {
  const bp = useBreakpoint()
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const item = data.list.find((l) => l.year === year)
  const selectable = selectableTaxYears().includes(year)

  const back = <BackButton accessibilityLabel={tr('verlauf.zurueck')} onPress={onBack} testID="verlauf-jahr-zurueck" />
  if (item === undefined) {
    return (
      <ScrollView contentContainerStyle={bp === 's' ? s.screen : s.wideScreen} testID="screen-container">
        {back}
        <View style={s.card} testID="verlauf-jahr-unbekannt">
          <Text style={s.cardTitle} accessibilityRole="header">
            {/* NR-21: `/app/verlauf/abc` parses to NaN — never show "NaN" as a year. */}
            {Number.isInteger(year) ? tr('verlauf.jahr.unbekannt.titel', { jahr: year }) : tr('verlauf.jahr.unbekannt.titelOhneJahr')}
          </Text>
          <Text style={s.muted}>{tr('verlauf.jahr.unbekannt.text')}</Text>
        </View>
      </ScrollView>
    )
  }

  const change = filingTypeChange(data, year)
  const assessed = item.kind === 'bescheid' || item.kind === 'eckjahr'
  const filedElsewhere = !item.hasData && (item.withoutAssessment || item.filedElsewhere?.answer === 'ja')
  const changeable = assessed && item.deadline.kind === 'aenderbar-bis' && item.deadline.running
  const figure = yearFigure(item, data.years.find((y) => y.year === year), data.diffs.some((d) => d.year === year), tr)
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
        {figure !== null ? (
          <Text style={s.figure} testID="verlauf-jahr-betrag">
            {figure}
          </Text>
        ) : null}
        {change !== null ? (
          <Text style={s.muted} testID="verlauf-jahr-wechsel">
            {tr(change === 'zusammen' ? 'verlauf.chart.wechselZusammen' : 'verlauf.chart.wechselEinzeln', { jahr: year })}
          </Text>
        ) : null}
        {changeable ? (
          <Text style={s.muted} testID="verlauf-jahr-aenderbar">
            {tr('verlauf.jahr.aenderbar', { datum: germanDate(item.deadline.endsOn) })}
          </Text>
        ) : null}
      </View>
      {asksFiledElsewhere(item) ? <FiledElsewhereQuestion year={year} tone="hell" testID={`verlauf-jahr-frage-${year}`} /> : null}
      {data.recurring !== null && data.recurring.year === year && data.recurring.items.length > 0 ? <RecurringChecklist checklist={data.recurring} onOpenReceipts={onOpenReceipts} /> : null}
      <YearBody data={data} item={item} onPrepareAppeal={onPrepareAppeal && selectable ? () => onPrepareAppeal(year) : undefined} />
      <View style={s.notes}>
        <RepeatedCutNotes data={data} year={year} />
        {assessed ? <CoupleNote data={data} year={year} /> : null}
        <PrepaymentNote data={data} year={year} />
      </View>
      {onOpenYear && selectable && !filedElsewhere ? (
        <View style={{ width: '100%', maxWidth: FLOW_CONTENT_MAX_WIDTH }}>
          <Button variant={item.hasData ? 'ghost' : 'primaer'} onPress={() => onOpenYear(year)} testID={`verlauf-zum-cockpit-${year}`}>
            {item.hasData ? tr('verlauf.zumCockpit', { jahr: year }) : tr('verlauf.jetzt.anfangen', { jahr: year })}
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

  if (item.kind === 'offen' && item.hasData) {
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
  const notes: ViewStyle = { width: '100%', maxWidth: FLOW_CONTENT_MAX_WIDTH }
  return { ...base, ...historyScreenStyles(t), head, items, title, notes }
}
