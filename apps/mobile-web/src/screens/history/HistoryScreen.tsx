import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import {
  useYearHistoryControllerGet,
  type OpenItemDto,
  type YearHistoryEntryDto,
  type YearHistoryResponseDto,
  type YearListItemDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { SELECTABLE_TAX_YEARS } from '../../config/taxYear'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { AssessmentDiffView } from './AssessmentDiffView'
import { AssessmentUploadEntry } from './AssessmentUploadEntry'
import { HistoryDevelopment } from './HistoryDevelopment'
import { PersonToggle } from './PersonToggle'
import { historyStyles } from './historyStyles'
import { netFor, workFor } from './historyChartModel'
import { exactValue, figureText, germanDate, missingSentence, newestFirst, signedEuro, signedFigureText, type HistoryPerson } from './historyFormat'
import { usePositionLabel } from './positionLabels'

export interface HistoryScreenProps {
  readonly isGuest: boolean
  /** The year open in the app (the upload's context). */
  readonly openYear: number
  readonly onRegister?: (() => void) | undefined
  readonly onLogin?: (() => void) | undefined
  /** Opens the year's cockpit. */
  readonly onOpenYear?: ((year: number) => void) | undefined
  /** „Einspruch vorbereiten“: the Bescheidprüfung of the year with its Einspruch. */
  readonly onPrepareAppeal?: ((year: number) => void) | undefined
  /** The owl's waiting drafts after an upload. */
  readonly onOpenDrafts?: (() => void) | undefined
}

/** The tab „Verlauf“ (ADR-0098 §1): what is due, all years declared and assessed, then the development over the years. */
export function HistoryScreen(props: HistoryScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const query = useYearHistoryControllerGet({ query: { enabled: !props.isGuest } })

  if (props.isGuest) return <GuestState {...props} />
  if (query.isPending) return <LoadingState bp={bp} label={tr('verlauf.laden')} />
  if (!query.isError && query.data.status === 401) return <GuestState {...props} />
  if (query.isError || query.data.status !== 200) {
    return <ErrorState bp={bp} heading={tr('verlauf.fehler.titel')} message={tr('verlauf.fehler.text')} retryLabel={tr('verlauf.fehler.erneut')} onRetry={() => void query.refetch()} testID="verlauf-fehler" />
  }
  return <HistoryLoaded {...props} data={query.data.data} />
}

function GuestState({ onRegister, onLogin }: HistoryScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  return (
    <ScrollView contentContainerStyle={bp === 's' ? s.screen : s.wideScreen} testID="screen-container">
      <Header />
      <View style={s.card} testID="verlauf-gast">
        <Text style={s.cardTitle}>{tr('verlauf.gast.titel')}</Text>
        <Text style={s.muted}>{tr('verlauf.gast.text')}</Text>
        <View style={s.buttonRow}>
          {onRegister ? (
            <Button onPress={onRegister} testID="verlauf-gast-registrieren">
              {tr('verlauf.gast.registrieren')}
            </Button>
          ) : null}
          {onLogin ? (
            <Button variant="ghost" onPress={onLogin} testID="verlauf-gast-anmelden">
              {tr('verlauf.gast.anmelden')}
            </Button>
          ) : null}
        </View>
      </View>
    </ScrollView>
  )
}

function Header({ range }: { readonly range?: string | undefined }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  return (
    <View style={s.header}>
      <Text style={s.eyebrow}>{range ? tr('verlauf.eyebrowZeitraum', { zeitraum: range }) : tr('verlauf.eyebrow')}</Text>
      <Text style={s.title} accessibilityRole="header" testID="verlauf-titel">
        {tr('verlauf.titel')}
      </Text>
    </View>
  )
}

/** The year to open first: the highlighted deadline, else the newest year with an Abgleich. */
function initialYear(data: YearHistoryResponseDto): number | null {
  const highlighted = data.openItems.find((o) => o.highlighted)
  if (highlighted) return highlighted.year
  const withDiff = [...data.diffs].sort((a, b) => b.year - a.year)[0]
  return withDiff?.year ?? null
}

function HistoryLoaded({ data, openYear, onOpenYear, onPrepareAppeal, onOpenDrafts }: HistoryScreenProps & { readonly data: YearHistoryResponseDto }) {
  const bp = useBreakpoint()
  const wide = bp !== 's'
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [selected, setSelected] = useState<number | null>(() => initialYear(data))
  const [panelOpen, setPanelOpen] = useState(() => initialYear(data) !== null)
  const [person, setPerson] = useState<HistoryPerson>('beide')
  const years = data.years
  const range = years.length > 0 ? `${years[0]!.year}–${years[years.length - 1]!.year}` : undefined
  const household = years.some((y) => y.persons.includes('B'))

  const openYearPanel = (year: number) => {
    setSelected(year)
    setPanelOpen(true)
  }

  const upload = (
    <AssessmentUploadEntry
      openYear={openYear}
      title={tr('verlauf.upload.titel', { jahr: (years[0]?.year ?? openYear) - 1 })}
      body={tr(wide ? 'verlauf.upload.textLang' : 'verlauf.upload.text')}
      cta={tr('verlauf.upload.cta')}
      onOpenDrafts={onOpenDrafts}
      testID="verlauf-upload"
    />
  )

  if (years.length === 0) {
    return (
      <ScrollView contentContainerStyle={wide ? s.wideScreen : s.screen} testID="screen-container">
        <Header />
        <View style={s.card} testID="verlauf-leer">
          <Text style={s.cardTitle}>{tr('verlauf.leer.titel')}</Text>
          <Text style={s.muted}>{tr('verlauf.leer.text')}</Text>
        </View>
        {upload}
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={wide ? s.wideScreen : s.screen} testID="screen-container">
      <View style={s.headRow}>
        <Header range={range} />
        {wide && household ? <PersonToggle person={person} onChange={setPerson} /> : null}
      </View>
      <OpenItems items={data.openItems} wide={wide} onPick={openYearPanel} />
      {wide ? null : <Hero data={data} />}
      {wide ? <YearTable data={data} person={person} selected={panelOpen ? selected : null} onPick={openYearPanel} /> : <YearList data={data} onPick={openYearPanel} />}
      {panelOpen && selected !== null ? (
        <YearPanel data={data} year={selected} onClose={() => setPanelOpen(false)} onOpenYear={onOpenYear} onPrepareAppeal={onPrepareAppeal} />
      ) : null}
      <HistoryDevelopment
        data={data}
        person={person}
        onPersonChange={setPerson}
        showPersonToggle={!wide && household}
        selectedYear={selected ?? years[years.length - 1]!.year}
        onSelectYear={setSelected}
        onOpenDiff={openYearPanel}
        openYear={openYear}
        onOpenDrafts={onOpenDrafts}
      />
      {upload}
    </ScrollView>
  )
}

/** „Was ansteht“: at most one item per year, the highlighted deadline first (ADR-0098 §1). */
function OpenItems({ items, wide, onPick }: { readonly items: readonly OpenItemDto[]; readonly wide: boolean; readonly onPick: (year: number) => void }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const label = usePositionLabel()
  if (items.length === 0) return null
  return (
    <View style={wide ? s.openGrid : s.openList} accessibilityLabel={tr('verlauf.ansteht.titel')} testID="verlauf-ansteht">
      {items.map((item) => {
        let heading: string
        let text: string
        if (item.kind === 'einspruchsfrist') {
          heading = item.refundDifference != null ? tr('verlauf.ansteht.weichtAb', { differenz: signedEuro(item.refundDifference) }) : tr('verlauf.ansteht.weichtAbOhneBetrag', { count: item.deviations ?? 0 })
          text = item.deadline ? tr('verlauf.ansteht.frist', { datum: germanDate(item.deadline.endsOn), count: item.deadline.remainingDays }) : ''
        } else if (item.kind === 'wartet-auf-bescheid') {
          heading = tr('verlauf.ansteht.wartet')
          const cuts = item.repeatedCuts ?? []
          text = cuts.length > 0 ? tr('verlauf.ansteht.wiederErklaert', { count: cuts.length, vorjahr: item.year - 1, liste: cuts.map((c) => label(c.position, c.label)).join(', ') }) : tr('verlauf.ansteht.eingereicht')
        } else {
          heading = tr('verlauf.ansteht.offen')
          text = missingSentence(item.missing ?? [], tr, 'fehltNoch')
        }
        return (
          <Pressable
            key={`${item.kind}-${item.year}`}
            accessibilityRole="button"
            accessibilityLabel={`${item.year}: ${heading}. ${text}`}
            onPress={() => onPick(item.year)}
            style={[s.openItem, wide ? s.openGridItem : null, item.highlighted ? s.openItemUrgent : null]}
            testID={`verlauf-ansteht-${item.year}`}
          >
            <Text style={s.openYear}>{item.year}</Text>
            <View style={s.flex}>
              <Text style={s.strong}>{heading}</Text>
              {text !== '' ? <Text style={s.muted}>{text}</Text> : null}
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

/** The summary under „Was ansteht“ (mock `held()`): what came back over the Bescheid years, and what the Finanzamt changed. */
function Hero({ data }: { readonly data: YearHistoryResponseDto }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const assessed = data.years.filter((y) => y.erstattung.amount.tier === 'bescheid')
  if (assessed.length === 0) return null
  const balance = assessed.reduce((a, y) => a + (exactValue(y.erstattung.amount) ?? 0), 0)
  const compared = data.list.filter((l) => l.declaredRefund !== null && l.assessedRefund !== null && l.difference !== null)
  const changed = compared.reduce((a, l) => a + (l.difference ?? 0), 0)
  const changedCount = compared.filter((l) => l.difference !== 0).length
  const period = assessed.length === 1 ? String(assessed[0]!.year) : `${assessed[0]!.year}–${assessed[assessed.length - 1]!.year}`
  return (
    <View style={s.hero} testID="verlauf-held">
      <View style={s.heroCell}>
        <Text style={s.muted}>{tr(balance < 0 ? 'verlauf.held.nachgezahlt' : 'verlauf.held.erstattet', { zeitraum: period })}</Text>
        <Text style={s.heroValue} testID="verlauf-held-erstattet">
          {signedEuro(balance)}
        </Text>
        <Text style={s.trend}>{tr('verlauf.held.ausBescheidjahren', { count: assessed.length })}</Text>
      </View>
      {compared.length > 0 ? (
        <View style={s.heroCell}>
          <Text style={s.muted}>{tr('verlauf.held.geaendert')}</Text>
          <Text style={s.heroValue} testID="verlauf-held-geaendert">
            {signedEuro(changed)}
          </Text>
          <Text style={[s.trend, changed < 0 ? s.trendBad : null]}>{tr('verlauf.held.inErklaerungen', { count: compared.length, geaendert: changedCount })}</Text>
        </View>
      ) : null}
    </View>
  )
}

function statusText(item: YearListItemDto, tr: ReturnType<typeof useTranslation>['t']): string {
  switch (item.kind) {
    case 'offen':
      return tr('verlauf.stand.offen')
    case 'eckjahr':
      return tr('verlauf.stand.eckjahr')
    case 'eingereicht':
      return tr('verlauf.stand.eingereicht')
    case 'bescheid':
      if (item.deviations > 0) return tr('verlauf.stand.abweichungen', { count: item.deviations })
      return item.noDiffReason === null ? tr('verlauf.stand.wieErklaert') : tr('verlauf.stand.bescheid')
  }
}

export function StagePill({ item, entry }: { readonly item: YearListItemDto; readonly entry: YearHistoryEntryDto | undefined }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  let text: string
  let style: TextStyle
  if (item.kind === 'eckjahr') {
    text = tr('verlauf.stufe.eckjahr')
    style = s.pillEck
  } else if (item.kind === 'bescheid') {
    text = item.deviations > 0 ? tr('verlauf.stufe.bescheidAbweichungen', { count: item.deviations }) : item.noDiffReason === null ? tr('verlauf.stufe.bescheidWieErklaert') : tr('verlauf.stufe.bescheid')
    style = item.deviations > 0 ? s.pillAbweichung : s.pillBescheid
  } else if (entry?.tier === 'schaetzung') {
    text = tr('verlauf.stufe.schaetzung')
    style = s.pillSchaetzung
  } else {
    text = tr('verlauf.stufe.offen')
    style = s.pillOffen
  }
  return <Text style={[s.pill, style]}>{text}</Text>
}

function refundCell(item: YearListItemDto, entry: YearHistoryEntryDto | undefined): string {
  if (item.assessedRefund !== null) return signedEuro(item.assessedRefund)
  return entry ? signedFigureText(entry.erstattung.amount, '–') : '–'
}

/** „Eure Steuerjahre“ on the phone: newest first, each with its stand, its stage and the refund (declared struck where cut). */
function YearList({ data, onPick }: { readonly data: YearHistoryResponseDto; readonly onPick: (year: number) => void }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  return (
    <View style={s.listCard} testID="verlauf-jahre">
      <Text style={s.listTitle} accessibilityRole="header">
        {tr('verlauf.liste.titel')}
      </Text>
      {newestFirst(data.list).map((item) => {
        const entry = data.years.find((y) => y.year === item.year)
        const cut = item.difference !== null && item.difference !== 0 && item.declaredRefund !== null && item.assessedRefund !== null
        return (
          <Pressable
            key={item.year}
            accessibilityRole="button"
            accessibilityHint={tr('verlauf.liste.oeffnen')}
            onPress={() => onPick(item.year)}
            style={s.yearRow}
            testID={`verlauf-jahr-${item.year}`}
          >
            <Text style={s.yearRowYear}>{item.year}</Text>
            <View style={s.flex}>
              <Text style={s.muted}>{`${statusText(item, tr)} · ${tr(`verlauf.veranlagung.${item.filingType}`)}`}</Text>
              <StagePill item={item} entry={entry} />
            </View>
            {cut ? (
              <View style={s.amountCol}>
                <Text style={[s.amount, s.struck]}>{signedEuro(item.declaredRefund!)}</Text>
                <Text style={s.amount}>{signedEuro(item.assessedRefund!)}</Text>
                <Text style={[s.amount, s.textBad]}>{signedEuro(item.difference!)}</Text>
              </View>
            ) : (
              <Text style={s.amount}>{refundCell(item, entry)}</Text>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

const COLUMN_WIDTHS = [64, 170, 110, 104, 92, 112, 120, 104, 112, 96] as const

/** „Alle Jahre: erklärt und festgesetzt“ on tablet and desktop: the list as a table with the other figures behind it. */
function YearTable({ data, person, selected, onPick }: { readonly data: YearHistoryResponseDto; readonly person: HistoryPerson; readonly selected: number | null; readonly onPick: (year: number) => void }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const open = tr('verlauf.nochOffenKurz')
  const heads = [
    tr('verlauf.tabelle.jahr'),
    tr('verlauf.tabelle.stand'),
    tr('verlauf.tabelle.erklaert'),
    tr('verlauf.tabelle.lautBescheid'),
    tr('verlauf.tabelle.differenz'),
    tr('verlauf.tabelle.werbungskosten'),
    tr('verlauf.tabelle.brutto', { person: tr(`verlauf.person.${person}`) }),
    tr('verlauf.tabelle.netto'),
    tr('verlauf.tabelle.steuerquote'),
    tr('verlauf.tabelle.veranlagung'),
  ]
  const rows = newestFirst(data.list)
  return (
    <View style={s.listCard} testID="verlauf-tabelle">
      <Text style={s.listTitle} accessibilityRole="header">
        {tr('verlauf.tabelle.titel')}
      </Text>
      <ScrollView horizontal>
        <View role="table" accessibilityLabel={tr('verlauf.tabelle.titel')}>
          <View role="row" style={s.tableHead}>
            {heads.map((h, i) => (
              <Text key={h} role="columnheader" style={[s.th, { width: COLUMN_WIDTHS[i] }, i > 1 && i < 9 ? s.right : null]}>
                {h}
              </Text>
            ))}
          </View>
          {rows.map((item, idx) => {
            const entry = data.years.find((y) => y.year === item.year)
            const older = rows[idx + 1]
            const change = older !== undefined && older.filingType !== item.filingType
            const cells: ReactNode[] = [
              <Text style={s.tdYear}>{item.year}</Text>,
              <StagePill item={item} entry={entry} />,
              <Text style={[s.td, s.right]}>{item.kind === 'eingereicht' && entry ? signedFigureText(entry.erstattung.amount, '–') : item.declaredRefund === null ? '–' : signedEuro(item.declaredRefund)}</Text>,
              <Text style={[s.td, s.right]}>{item.assessedRefund === null ? '–' : signedEuro(item.assessedRefund)}</Text>,
              <Text style={[s.td, s.right, item.difference !== null && item.difference < 0 ? s.textBadStrong : null]}>{item.difference === null ? '–' : signedEuro(item.difference)}</Text>,
              <Text style={[s.td, s.right]}>{entry ? figureText(workFor(entry, person)?.angesetzt, 'euro', open) : '–'}</Text>,
              <Text style={[s.td, s.right]}>{entry ? figureText(netFor(entry, person)?.brutto, 'euro', open) : '–'}</Text>,
              <Text style={[s.td, s.right]}>{entry ? figureText(netFor(entry, person)?.netto, 'euro', open) : '–'}</Text>,
              <Text style={[s.td, s.right]}>{entry ? figureText(entry.steuerquote.effective, 'percent', open) : '–'}</Text>,
              <Text style={s.tdText}>{tr(`verlauf.veranlagung.${item.filingType}`)}</Text>,
            ]
            return (
              <Pressable
                key={item.year}
                role="row"
                accessibilityHint={tr('verlauf.liste.oeffnen')}
                onPress={() => onPick(item.year)}
                style={[s.tableRow, item.year === selected ? s.tableRowActive : null, change ? s.tableRowChange : null]}
                testID={`verlauf-tabelle-${item.year}`}
              >
                {cells.map((c, i) => (
                  <View key={heads[i]} role="cell" style={[s.cell, { width: COLUMN_WIDTHS[i] }]}>
                    {c}
                  </View>
                ))}
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

/** Below the list: the year's Abgleich, or why there is none; and the way into the year's cockpit. */
function YearPanel({
  data,
  year,
  onClose,
  onOpenYear,
  onPrepareAppeal,
}: {
  readonly data: YearHistoryResponseDto
  readonly year: number
  readonly onClose: () => void
  readonly onOpenYear?: ((year: number) => void) | undefined
  readonly onPrepareAppeal?: ((year: number) => void) | undefined
}) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const label = usePositionLabel()
  const diffs = data.diffs.filter((d) => d.year === year)
  const item = data.list.find((l) => l.year === year)
  const waiting = data.openItems.find((o) => o.year === year && o.kind === 'wartet-auf-bescheid')
  const selectable = SELECTABLE_TAX_YEARS.includes(year)
  const maskYear = data.maskLessons?.fromYear === year ? data.maskLessons.year : null
  const appeal = onPrepareAppeal && selectable ? () => onPrepareAppeal(year) : undefined

  let body: ReactNode
  if (diffs.length > 0) {
    body = diffs.map((d, i) => (
      <AssessmentDiffView
        key={`${d.year}-${d.person ?? 'beide'}`}
        diff={d.diff}
        deadline={d.deadline}
        submittedOn={d.submittedOn}
        assessmentDate={d.assessmentDate}
        person={d.person}
        lessons={d.lessons}
        maskYear={maskYear}
        onPrepareAppeal={appeal}
        onClose={i === 0 ? onClose : undefined}
        testID={d.person === null ? `verlauf-abgleich-${year}` : `verlauf-abgleich-${year}-${d.person}`}
      />
    ))
  } else {
    const cuts = waiting?.repeatedCuts ?? []
    body = (
      <View style={s.panelCard} testID={`verlauf-ohne-abgleich-${year}`} accessibilityLiveRegion="polite">
        <View style={s.panelHead}>
          <View style={s.flex}>
            <Text style={s.eyebrow}>{cuts.length > 0 ? tr('verlauf.wartet.eyebrow') : tr('verlauf.abgleich.eyebrow')}</Text>
            <Text style={s.cardTitle} accessibilityRole="header">
              {cuts.length > 0 ? tr('verlauf.wartet.titel', { jahr: year }) : tr('verlauf.abgleich.titel', { jahr: year })}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('verlauf.abgleich.schliessen')} onPress={onClose} style={s.close} testID={`verlauf-ohne-abgleich-${year}-schliessen`}>
            <Text style={s.strong}>×</Text>
          </Pressable>
        </View>
        {cuts.length > 0 ? (
          <>
            <Text style={s.muted}>{tr('verlauf.wartet.text', { count: cuts.length, vorjahr: year - 1, jahr: year })}</Text>
            <View style={s.lessons}>
              {cuts.map((c) => (
                <Text key={c.position} style={s.strong}>
                  {label(c.position, c.label)}
                </Text>
              ))}
            </View>
            <Text style={s.muted}>{tr('verlauf.wartet.keineVorhersage')}</Text>
          </>
        ) : (
          <Text style={s.muted} testID={`verlauf-ohne-abgleich-${year}-grund`}>
            {noDiffSentence(item, year, tr)}
          </Text>
        )}
      </View>
    )
  }

  return (
    <View style={s.panel} testID={`verlauf-jahr-panel-${year}`}>
      {body}
      {onOpenYear && selectable ? (
        <Button variant="ghost" onPress={() => onOpenYear(year)} testID={`verlauf-zum-cockpit-${year}`}>
          {tr('verlauf.zumCockpit', { jahr: year })}
        </Button>
      ) : null}
    </View>
  )
}

function noDiffSentence(item: YearListItemDto | undefined, year: number, tr: ReturnType<typeof useTranslation>['t']): string {
  if (item === undefined) return tr('verlauf.ohneAbgleich.offen', { jahr: year })
  switch (item.noDiffReason) {
    case 'eckjahr':
      return tr('verlauf.ohneAbgleich.eckjahr', { jahr: year })
    case 'keine-eingereichte-fassung':
      return tr('verlauf.ohneAbgleich.ohneFassung', { jahr: year })
    default:
      return item.kind === 'eingereicht' ? tr('verlauf.ohneAbgleich.wartet', { jahr: year }) : tr('verlauf.ohneAbgleich.offen', { jahr: year })
  }
}

function makeStyles(t: UiTheme) {
  const base = historyStyles(t)
  const screen: ViewStyle = { ...t.layout.overview.narrow, gap: t.space.s4, paddingBottom: t.space.s7 }
  const wideScreen: ViewStyle = { ...t.layout.overview.wide, gap: t.space.s4, paddingBottom: t.space.s7 }
  const header: ViewStyle = { gap: 2 }
  const headRow: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: t.space.s3 }
  const title: TextStyle = { ...t.type.title, color: t.color.tinte }
  const flex: ViewStyle = { flex: 1, minWidth: 0, gap: 2 }
  const buttonRow: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }
  const openList: ViewStyle = { gap: t.space.s2 }
  const openGrid: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s3 }
  // Side by side on wide screens only; in the phone's column a basis would be a height.
  const openGridItem: ViewStyle = { flexGrow: 1, flexBasis: 240 }
  const openItem: ViewStyle = { flexDirection: 'row', gap: t.space.s3, alignItems: 'baseline', backgroundColor: t.color.karte, borderWidth: t.space.kontur, borderColor: t.color.linie, borderRadius: t.radius.s, paddingHorizontal: t.space.s3, paddingVertical: t.space.s2, minHeight: 44 }
  const openItemUrgent: ViewStyle = { backgroundColor: t.color.warnWeich, borderColor: t.color.warn, ...t.shadow.hartS }
  const openYear: TextStyle = { ...t.type.itemTitle, color: t.color.tinte }
  const hero: ViewStyle = { ...base.card, flexDirection: 'row', flexWrap: 'wrap', ...t.shadow.hart }
  const heroCell: ViewStyle = { flex: 1, minWidth: 140, gap: 2 }
  const heroValue: TextStyle = { ...t.type.subhead, color: t.color.tinte, fontVariant: ['tabular-nums'] }
  const listCard: ViewStyle = { backgroundColor: t.color.karte, borderWidth: t.space.kontur, borderColor: t.color.linie, borderRadius: t.radius.m, overflow: 'hidden' }
  const listTitle: TextStyle = { ...t.type.cardTitle, color: t.color.tinte, paddingHorizontal: t.space.s4, paddingTop: t.space.s3, paddingBottom: t.space.s2 }
  const yearRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, paddingHorizontal: t.space.s4, paddingVertical: t.space.s3, borderTopWidth: 1, borderTopColor: t.color.linieWeich, minHeight: 44 }
  const yearRowYear: TextStyle = { ...t.type.itemTitle, color: t.color.tinte, width: 52 }
  const amountCol: ViewStyle = { alignItems: 'flex-end' }
  const amount: TextStyle = { ...t.type.metaLarge, color: t.color.tinte, textAlign: 'right', fontVariant: ['tabular-nums'] }
  const struck: TextStyle = { textDecorationLine: 'line-through', color: t.color.tinte2 }
  const textBad: TextStyle = { color: t.color.fehler, fontWeight: t.weight.schwer }
  const textBadStrong: TextStyle = { color: t.color.fehler, fontWeight: t.weight.schwer }
  const tableHead: ViewStyle = { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.color.linieWeich, paddingHorizontal: t.space.s2 }
  const th: TextStyle = { ...t.type.captionStrong, color: t.color.tinte2, paddingHorizontal: t.space.s2, paddingVertical: 6 }
  const right: TextStyle = { textAlign: 'right' }
  const tableRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: t.color.linieWeich, paddingHorizontal: t.space.s2, minHeight: 44 }
  const tableRowActive: ViewStyle = { backgroundColor: t.color.funkeWeich }
  const tableRowChange: ViewStyle = { borderTopWidth: 2, borderTopColor: t.color.ki, borderStyle: 'dashed' }
  const cell: ViewStyle = { paddingHorizontal: t.space.s2, paddingVertical: t.space.s2 }
  const td: TextStyle = { ...t.type.metaLarge, color: t.color.tinte, fontVariant: ['tabular-nums'] }
  const tdYear: TextStyle = { ...t.type.itemTitle, color: t.color.tinte }
  const tdText: TextStyle = { ...t.type.small, color: t.color.tinte }
  const panel: ViewStyle = { gap: t.space.s3 }
  const panelCard: ViewStyle = { ...base.card, ...t.shadow.hart }
  const panelHead: ViewStyle = { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: t.space.s3 }
  const close: ViewStyle = { width: 36, height: 36, borderRadius: t.radius.pille, borderWidth: t.space.kontur, borderColor: t.color.linie, alignItems: 'center', justifyContent: 'center' }
  const lessons: ViewStyle = { backgroundColor: t.color.funkeWeich, borderWidth: t.space.kontur, borderColor: t.color.linie, borderRadius: t.radius.s, padding: t.space.s3, gap: t.space.s2 }
  return {
    ...base, screen, wideScreen, header, headRow, title, flex, buttonRow, openList, openGrid, openGridItem, openItem,
    openItemUrgent, openYear, hero, heroCell, heroValue, listCard, listTitle, yearRow, yearRowYear, amountCol, amount, struck, textBad, textBadStrong, tableHead, th, right,
    tableRow, tableRowActive, tableRowChange, cell, td, tdYear, tdText, panel, panelCard, panelHead, close, lessons,
  }
}
