import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { Polyline, Svg } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import type { HistoryDeltaDto, HistoryFigureDto, YearHistoryEntryDto, YearHistoryResponseDto } from '@steuereule/api-client'
import { formatEuro } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { HistoryChart, segmentColor } from './HistoryChart'
import { AssessmentUploadEntry } from './AssessmentUploadEntry'
import { PersonToggle } from './PersonToggle'
import { buildChart, effectivePerson, netFor, sparkPoints, workFor, type SegmentKind } from './historyChartModel'
import {
  bounds,
  deltaText,
  deltaTone,
  exactValue,
  figureText,
  isHouseholdOnly,
  METRIC_ORDER,
  missingSentence,
  newestFirst,
  percent,
  signedEuro,
  signedFigureText,
  type HistoryMetric,
  type HistoryPerson,
} from './historyFormat'
import { historyStyles } from './historyStyles'
import { owlSentence } from './owlSentences'
import { groupTabs, type HistoryGroupTab } from './historyInsights'
import { HistoryGroupPanel } from './HistoryGroups'

export interface HistoryDevelopmentProps {
  readonly data: YearHistoryResponseDto
  readonly person: HistoryPerson
  readonly onPersonChange: (p: HistoryPerson) => void
  readonly showPersonToggle: boolean
  readonly selectedYear: number
  readonly onSelectYear: (year: number) => void
  readonly onOpenDiff: (year: number) => void
  readonly openYear: number
  readonly onOpenDrafts?: (() => void) | undefined
}

const LEGEND: Readonly<Record<HistoryMetric, readonly SegmentKind[] | null>> = {
  netto: ['netto', 'steuern', 'sozialversicherung'],
  werbungskosten: ['fahrtweg', 'homeoffice', 'arbeitsmittel', 'sonstiges', 'summeLautBescheid'],
  erstattung: null,
  steuerquote: null,
}

/** „Entwicklung über die Jahre“ (ADR-0098 §2, mock chips, KPIs and `chart()`): the four key figures, Erstattung first, on their own page. */
export function HistoryDevelopment({ data, person, onPersonChange, showPersonToggle, selectedYear, onSelectYear, onOpenDiff, openYear, onOpenDrafts }: HistoryDevelopmentProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [metric, setMetric] = useState<HistoryMetric>('erstattung')
  // A group tab (ADR-0099 §3, §7) replaces the key figure's chart while it is picked.
  const [group, setGroup] = useState<HistoryGroupTab | null>(null)
  const groups = groupTabs(data)
  const pickMetric = (m: HistoryMetric) => {
    setGroup(null)
    setMetric(m)
  }
  const [tableOpen, setTableOpen] = useState(false)
  const who = effectivePerson(metric, person)
  const model = buildChart(data.years, metric, person)
  const years = data.years
  const range = `${years[0]!.year}–${years[years.length - 1]!.year}`
  const personSuffix = who === 'beide' ? '' : ` · ${tr(`verlauf.person.${who}`)}`
  const title = `${tr(`verlauf.kennzahl.${metric}.titel`)}${personSuffix}`
  const entry = years.find((y) => y.year === selectedYear) ?? years[years.length - 1]!

  const chartCard = (
    <View style={s.card} testID="verlauf-karte">
      <Text style={s.cardTitle} accessibilityRole="header" testID="verlauf-karte-titel">
        {title}
      </Text>
      <Text style={s.sub}>{tr(`verlauf.kennzahl.${metric}.sub`)}</Text>
      {isHouseholdOnly(metric) && person !== 'beide' ? (
        <Text style={s.hint} testID="verlauf-hinweis-haushalt">
          {tr('verlauf.hinweisHaushalt')}
        </Text>
      ) : null}
      <HistoryChart
        model={model}
        selectedYear={entry.year}
        onSelectYear={onSelectYear}
        accessibilityLabel={tr('verlauf.chart.a11y', { titel: title, zeitraum: range })}
        height={bp === 's' ? 230 : 260}
        testID="verlauf-diagramm"
      />
      <Legend metric={metric} showChange={who === 'beide' && model.filingTypeChanges.length > 0} />
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: tableOpen }} onPress={() => setTableOpen((v) => !v)} style={s.tableToggle} testID="verlauf-datentabelle-umschalten">
        <Text style={s.link}>{tableOpen ? `▾ ${tr('verlauf.datentabelle.zu')}` : `▸ ${tr('verlauf.datentabelle.auf')}`}</Text>
      </Pressable>
      {tableOpen ? <DataTable entries={years} metric={metric} person={who} /> : null}
      <View style={s.tiers}>
        <Text style={[s.pill, s.pillBescheid]}>{tr('verlauf.stufe.bescheid')}</Text>
        <Text style={[s.pill, s.pillSchaetzung]}>{tr('verlauf.stufe.schaetzung')}</Text>
        <Text style={[s.pill, s.pillOffen]}>{tr('verlauf.stufe.offen')}</Text>
        <Text style={s.muted}>{tr('verlauf.tippeJahr')}</Text>
      </View>
    </View>
  )
  const detail = <YearDetail entry={entry} entries={years} data={data} metric={metric} person={who} onOpenDiff={onOpenDiff} openYear={openYear} onOpenDrafts={onOpenDrafts} />
  const owl = (
    <View style={s.owlBox} testID="verlauf-eule">
      <Text style={s.owlLabel}>{tr('verlauf.eule.label')}</Text>
      <Text style={s.owlText}>{owlSentence(metric, years, data.list, who, tr)}</Text>
    </View>
  )

  return (
    <View style={s.section}>
      {showPersonToggle ? <PersonToggle person={person} onChange={onPersonChange} /> : null}
      {bp === 's' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          <View style={s.chips} role="tablist" accessibilityLabel={tr('verlauf.kennzahlWaehlen')}>
            {/* The mock's order: the refund, then the groups the household has, then the other key figures. */}
            {METRIC_ORDER.slice(0, 1).map((m) => (
              <MetricChip key={m} label={tr(`verlauf.kennzahl.${m}.label`)} active={group === null && m === metric} onPress={() => pickMetric(m)} testID={`verlauf-kennzahl-${m}`} />
            ))}
            {groups.map((g) => (
              <MetricChip key={g} label={tr(`verlauf.gruppe.tab.${g}`)} active={group === g} onPress={() => setGroup(g)} testID={`verlauf-bereich-${g}`} />
            ))}
            {METRIC_ORDER.slice(1).map((m) => (
              <MetricChip key={m} label={tr(`verlauf.kennzahl.${m}.label`)} active={group === null && m === metric} onPress={() => pickMetric(m)} testID={`verlauf-kennzahl-${m}`} />
            ))}
          </View>
        </ScrollView>
      ) : (
        <>
          <Kpis data={data} metric={group === null ? metric : null} person={person} onPick={pickMetric} />
          {groups.length > 0 ? (
            <View style={[s.chips, s.wrap]} role="tablist" accessibilityLabel={tr('verlauf.gruppe.mehr')}>
              {groups.map((g) => (
                <MetricChip key={g} label={tr(`verlauf.gruppe.tab.${g}`)} active={group === g} onPress={() => setGroup(group === g ? null : g)} testID={`verlauf-bereich-${g}`} />
              ))}
            </View>
          ) : null}
        </>
      )}
      {group !== null ? (
        <HistoryGroupPanel data={data} tab={group} />
      ) : bp === 'l' ? (
        <View style={s.raster}>
          <View style={s.rasterMain}>{chartCard}</View>
          <View style={s.rasterSide}>
            {detail}
            {owl}
          </View>
        </View>
      ) : (
        <>
          {chartCard}
          {detail}
          {owl}
        </>
      )}
    </View>
  )
}

function MetricChip({ label, active, onPress, testID }: { readonly label: string; readonly active: boolean; readonly onPress: () => void; readonly testID: string }) {
  const t = useTheme()
  const s = makeStyles(t)
  return (
    <Pressable role="tab" aria-selected={active} accessibilityState={{ selected: active }} onPress={onPress} style={[s.chip, active ? s.chipActive : null]} testID={testID}>
      <Text style={[s.chipText, active ? s.chipTextActive : null]}>{label}</Text>
    </Pressable>
  )
}

function Legend({ metric, showChange }: { readonly metric: HistoryMetric; readonly showChange: boolean }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const items: { key: string; swatch: ViewStyle; text: string }[] = []
  const segs = LEGEND[metric]
  if (segs) for (const k of segs) items.push({ key: k, swatch: { backgroundColor: segmentColor(t, k) }, text: tr(`verlauf.segment.${k}`) })
  if (metric === 'erstattung') {
    items.push({ key: 'ok', swatch: { backgroundColor: t.color.ok }, text: tr('verlauf.legende.erstattungBescheid') })
    items.push({ key: 'cut', swatch: { backgroundColor: t.color.fehlerWeich, borderColor: t.color.fehler, borderStyle: 'dashed' }, text: tr('verlauf.legende.gekuerzt') })
    items.push({ key: 'est', swatch: { backgroundColor: t.color.warnWeich, borderColor: t.color.warn, borderStyle: 'dashed' }, text: tr('verlauf.legende.schaetzung') })
    items.push({ key: 'mark', swatch: s.swatchLine, text: tr('verlauf.legende.erklaert') })
  }
  if (metric === 'werbungskosten') items.push({ key: 'pausch', swatch: { ...s.swatchLine, borderTopColor: t.color.fehler, borderStyle: 'dashed' }, text: tr('verlauf.legende.pauschbetrag') })
  if (metric === 'steuerquote') {
    items.push({ key: 'eff', swatch: { backgroundColor: t.color.tinte, borderRadius: 5 }, text: tr('verlauf.legende.effektiv') })
    items.push({ key: 'grenz', swatch: { backgroundColor: t.color.ki, borderRadius: 5 }, text: tr('verlauf.legende.grenz') })
  }
  if (showChange) items.push({ key: 'wechsel', swatch: { ...s.swatchLine, width: 2, height: 12, borderTopWidth: 0, borderLeftWidth: 2, borderLeftColor: t.color.ki, borderStyle: 'dashed' }, text: tr('verlauf.legende.wechsel') })
  return (
    <View style={s.legend}>
      {items.map((i) => (
        <View key={i.key} style={s.legendItem}>
          <View style={[s.swatch, i.swatch]} />
          <Text style={s.legendText}>{i.text}</Text>
        </View>
      ))}
    </View>
  )
}

/** The latest year with a value for at least one key figure: all four tiles show that same year (ADR-0098 §2). */
function kpiYear(entries: readonly YearHistoryEntryDto[], person: HistoryPerson): YearHistoryEntryDto | null {
  return (
    newestFirst(entries).find((e) => bounds(e.erstattung.amount) !== null || bounds(workFor(e, person)?.angesetzt) !== null || bounds(netFor(e, person)?.netto) !== null || bounds(e.steuerquote.effective) !== null) ?? null
  )
}

function Kpis({ data, metric, person, onPick }: { readonly data: YearHistoryResponseDto; readonly metric: HistoryMetric | null; readonly person: HistoryPerson; readonly onPick: (m: HistoryMetric) => void }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const entry = kpiYear(data.years, person)
  if (entry === null) return null
  const open = tr('verlauf.nochOffenKurz')
  const tiles: { m: HistoryMetric; who: HistoryPerson; value: string; figure: HistoryFigureDto | null | undefined; series: (HistoryFigureDto | null | undefined)[] }[] = [
    { m: 'erstattung', who: 'beide', figure: entry.erstattung.amount, value: signedFigureText(entry.erstattung.amount, open), series: data.years.map((y) => y.erstattung.amount) },
    { m: 'werbungskosten', who: person, figure: workFor(entry, person)?.angesetzt, value: figureText(workFor(entry, person)?.angesetzt, 'euro', open), series: data.years.map((y) => workFor(y, person)?.angesetzt) },
    { m: 'netto', who: person, figure: netFor(entry, person)?.netto, value: figureText(netFor(entry, person)?.netto, 'euro', open), series: data.years.map((y) => netFor(y, person)?.netto) },
    { m: 'steuerquote', who: 'beide', figure: entry.steuerquote.effective, value: figureText(entry.steuerquote.effective, 'percent', open), series: data.years.map((y) => y.steuerquote.effective) },
  ]
  return (
    <View style={s.kpis}>
      {tiles.map((tile) => {
        const active = tile.m === metric
        const points = sparkPoints(tile.series.map((f) => bounds(f)))
        const delta = tile.figure?.delta
        return (
          <Pressable key={tile.m} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => onPick(tile.m)} style={[s.kpi, active ? s.kpiActive : null]} testID={`verlauf-kpi-${tile.m}`}>
            <Text style={s.muted}>{tr('verlauf.kpi.label', { kennzahl: tr(`verlauf.kennzahl.${tile.m}.label`), jahr: entry.year, person: tr(`verlauf.person.${tile.who}`) })}</Text>
            <Text style={s.kpiValue}>{tile.value}</Text>
            {points !== '' ? (
              <Svg width="100%" height={22} viewBox="0 0 100 22" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Polyline points={points} fill="none" stroke={t.color.tinte2} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              </Svg>
            ) : null}
            {delta ? <DeltaLine delta={delta} unit={tile.m === 'steuerquote' ? 'percent' : 'euro'} lowerIsBetter={tile.m === 'steuerquote'} /> : null}
          </Pressable>
        )
      })}
    </View>
  )
}

function DeltaLine({ delta, unit, lowerIsBetter, testID }: { readonly delta: HistoryDeltaDto; readonly unit: 'euro' | 'percent'; readonly lowerIsBetter: boolean; readonly testID?: string }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const tone = deltaTone(delta, lowerIsBetter)
  return (
    <Text style={[s.trend, tone === 'good' ? s.trendGood : tone === 'bad' ? s.trendBad : null]} testID={testID}>
      {deltaText(delta, unit, tr)}
    </Text>
  )
}

function Line({ label, value, sum = false, testID }: { readonly label: string; readonly value: string; readonly sum?: boolean; readonly testID?: string }) {
  const t = useTheme()
  const s = makeStyles(t)
  return (
    <View style={[s.line, sum ? s.lineSum : null]} testID={testID}>
      <Text style={[s.lineLabel, sum ? s.strong : null]}>{label}</Text>
      <Text style={[s.lineValue, sum ? s.strong : null]}>{value}</Text>
    </View>
  )
}

function TierPill({ entry, figure, metric }: { readonly entry: YearHistoryEntryDto; readonly figure: HistoryFigureDto | null | undefined; readonly metric: HistoryMetric }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  if (entry.tier === 'offen') return <Text style={[s.pill, s.pillOffen]}>{tr('verlauf.stufe.offen')}</Text>
  if (entry.eckjahr) return <Text style={[s.pill, s.pillEck]}>{tr('verlauf.stufe.eckjahrBescheid')}</Text>
  if (!figure || figure.tier === 'offen') return <Text style={[s.pill, s.pillOffen]}>{tr('verlauf.stufe.offen')}</Text>
  if (metric === 'netto' && figure.source === 'lohnsteuerbescheinigung') return <Text style={[s.pill, s.pillLstb]}>{tr('verlauf.stufe.lstb')}</Text>
  if (metric === 'netto' && figure.source === 'lohnausweis') return <Text style={[s.pill, s.pillLstb]}>{tr('verlauf.stufe.lohnausweis')}</Text>
  return figure.tier === 'bescheid' ? <Text style={[s.pill, s.pillBescheid]}>{tr('verlauf.stufe.bescheid')}</Text> : <Text style={[s.pill, s.pillSchaetzung]}>{tr('verlauf.stufe.schaetzung')}</Text>
}

/** The detail of the picked year (mock `detail()`): the figure's parts, its tier, the change to the year before. */
function YearDetail({
  entry,
  data,
  metric,
  person,
  onOpenDiff,
  openYear,
  onOpenDrafts,
}: {
  readonly entry: YearHistoryEntryDto
  readonly entries: readonly YearHistoryEntryDto[]
  readonly data: YearHistoryResponseDto
  readonly metric: HistoryMetric
  readonly person: HistoryPerson
  readonly onOpenDiff: (year: number) => void
  readonly openYear: number
  readonly onOpenDrafts?: (() => void) | undefined
}) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const open = tr('verlauf.nochOffenKurz')
  const year = entry.year
  const who =
    person === 'beide' ? (entry.persons.includes('B') ? tr(entry.filingType === 'zusammen' ? 'verlauf.detail.zusammen' : 'verlauf.detail.einzeln') : tr('verlauf.detail.du')) : tr(`verlauf.person.${person}`)
  const rows: ReactNode[] = []
  let figure: HistoryFigureDto | null | undefined

  if (entry.tier === 'offen' && metric !== 'netto') {
    figure = null
    rows.push(
      <Text key="offen" style={s.muted}>
        {missingSentence(entry.missing, tr)}
      </Text>,
    )
  } else if (metric === 'netto') {
    const net = netFor(entry, person)
    figure = net?.brutto
    if (!net || exactValue(net.brutto) === null) {
      rows.push(
        <Text key="na" style={s.muted}>
          {entry.eckjahr ? tr('verlauf.detail.bruttoNichtImBescheid', { jahr: year }) : missingSentence(net?.brutto.missing ?? entry.missing, tr)}
        </Text>,
      )
      if (entry.eckjahr) {
        rows.push(
          <AssessmentUploadEntry
            key="lstb"
            openYear={openYear}
            document="lstb"
            title={tr('verlauf.detail.lstbTitel', { jahr: year })}
            body={tr('verlauf.detail.lstbText')}
            cta={tr('verlauf.detail.lstbCta')}
            onOpenDrafts={onOpenDrafts}
            testID="verlauf-detail-lstb"
          />,
        )
      }
    } else {
      const minus = (f: HistoryFigureDto) => `− ${figureText(f, 'euro', open)}`
      rows.push(<Line key="b" label={tr('verlauf.detail.brutto')} value={figureText(net.brutto, 'euro', open)} />)
      rows.push(<Line key="l" label={tr('verlauf.detail.lohnsteuer')} value={minus(net.lohnsteuer)} />)
      if ((exactValue(net.solidaritaetszuschlag) ?? 0) > 0) rows.push(<Line key="so" label={tr('verlauf.detail.soli')} value={minus(net.solidaritaetszuschlag)} />)
      if ((exactValue(net.kirchensteuer) ?? 0) > 0) rows.push(<Line key="k" label={tr('verlauf.detail.kirchensteuer')} value={minus(net.kirchensteuer)} />)
      rows.push(<Line key="sv" label={tr('verlauf.detail.sozialversicherung')} value={minus(net.sozialversicherung)} />)
      rows.push(<Line key="n" label={tr('verlauf.detail.netto')} value={figureText(net.netto, 'euro', open)} sum testID="verlauf-detail-netto" />)
      if (person === 'beide' && 'nettoNachErstattung' in net) {
        rows.push(<Line key="ne" label={tr('verlauf.detail.nettoNachErstattung')} value={figureText(entry.netto.beide.nettoNachErstattung, 'euro', open)} />)
      } else if (entry.filingType === 'zusammen') {
        rows.push(
          <Text key="ne" style={s.muted}>
            {tr('verlauf.detail.nettoNachErstattungNurGemeinsam')}
          </Text>,
        )
      }
      for (const rate of net.exchangeRates) {
        rows.push(
          <Text key={`kurs${rate.period}`} style={s.muted}>
            {tr('verlauf.detail.kurs', { kurs: rate.rate.toLocaleString('de-DE', { maximumFractionDigits: 4 }), zeitraum: rate.period })}
          </Text>,
        )
      }
      rows.push(<DeltaLine key="d" delta={net.netto.delta} unit="euro" lowerIsBetter={false} />)
    }
  } else if (metric === 'werbungskosten') {
    const w = workFor(entry, person)
    figure = w?.total
    if (w) {
      if (w.parts) {
        rows.push(<Line key="f" label={tr('verlauf.teil.fahrtwegName')} value={formatEuro(w.parts.fahrtweg)} />)
        rows.push(<Line key="h" label={tr('verlauf.teil.homeofficeName')} value={formatEuro(w.parts.homeoffice)} />)
        rows.push(<Line key="a" label={tr('verlauf.teil.arbeitsmittelName')} value={formatEuro(w.parts.arbeitsmittel)} />)
        if (w.parts.sonstiges > 0) rows.push(<Line key="o" label={tr('verlauf.teil.sonstigesName')} value={formatEuro(w.parts.sonstiges)} />)
        rows.push(<Line key="s" label={tr('verlauf.detail.summe')} value={figureText(w.total, 'euro', open)} sum />)
      } else {
        rows.push(<Line key="lb" label={tr('verlauf.detail.lautBescheid')} value={figureText(w.total, 'euro', open)} />)
        rows.push(
          <Text key="ohne" style={s.muted}>
            {tr('verlauf.detail.ohneAufteilung')}
          </Text>,
        )
      }
      if (w.pauschbetrag !== null) rows.push(<Line key="p" label={tr(person === 'beide' && entry.persons.length > 1 ? 'verlauf.detail.pauschbetragZwei' : 'verlauf.detail.pauschbetrag', { jahr: year })} value={formatEuro(w.pauschbetrag)} />)
      rows.push(<Line key="an" label={tr('verlauf.detail.angesetzt')} value={figureText(w.angesetzt, 'euro', open)} />)
      const people: readonly ('A' | 'B')[] = person === 'beide' ? (entry.persons as ('A' | 'B')[]) : [person]
      for (const p of people) {
        const pw = workFor(entry, p)
        if (pw?.belowLumpSum === true && pw.pauschbetrag !== null) {
          rows.push(
            <Text key={`u${p}`} style={s.muted}>
              {entry.persons.length > 1 ? tr('verlauf.detail.unterPauschbetragPerson', { person: tr(`verlauf.person.${p}`), betrag: formatEuro(pw.pauschbetrag) }) : tr('verlauf.detail.unterPauschbetrag', { betrag: formatEuro(pw.pauschbetrag) })}
            </Text>,
          )
        }
      }
      rows.push(<DeltaLine key="d" delta={w.angesetzt.delta} unit="euro" lowerIsBetter={false} />)
    }
  } else if (metric === 'erstattung') {
    const r = entry.erstattung
    figure = r.amount
    const assessed = r.amount.tier === 'bescheid'
    if (assessed && r.declared !== null) rows.push(<Line key="e" label={tr('verlauf.detail.erklaert')} value={signedEuro(r.declared)} />)
    rows.push(<Line key="a" label={tr(assessed ? 'verlauf.detail.lautBescheid' : 'verlauf.detail.geschaetzt')} value={signedFigureText(r.amount, open)} sum testID="verlauf-detail-erstattung" />)
    if (assessed && r.declared !== null && r.difference !== null) {
      rows.push(
        r.difference !== 0 ? (
          <Line key="g" label={tr('verlauf.detail.geaendert')} value={signedEuro(r.difference)} />
        ) : (
          <Text key="g" style={s.muted}>
            {tr('verlauf.detail.wieErklaert')}
          </Text>
        ),
      )
    }
    if (r.sumOfSingleFilings) {
      rows.push(
        <Text key="sum" style={s.muted}>
          {tr('verlauf.detail.summeEinzeln')}
        </Text>,
      )
    }
    if (r.estimateBeforeAssessment !== null) {
      const est = r.estimateBeforeAssessment
      rows.push(<Line key="sv" label={tr('verlauf.detail.schaetzungVorher')} value={`${signedEuro(est.from)} – ${signedEuro(est.to)}`} />)
      const value = exactValue(r.amount)
      if (value !== null) rows.push(<Line key="tr" label={tr('verlauf.detail.treffer')} value={tr(value >= est.from && value <= est.to ? 'verlauf.detail.innerhalb' : 'verlauf.detail.ausserhalb')} />)
    }
    rows.push(<DeltaLine key="d" delta={r.amount.delta} unit="euro" lowerIsBetter={false} />)
  } else {
    const q = entry.steuerquote
    figure = q.effective
    rows.push(<Line key="est" label={tr(q.incomeTax.tier === 'bescheid' ? 'verlauf.detail.festgesetzteEst' : 'verlauf.detail.estGeschaetzt')} value={figureText(q.incomeTax, 'euro', open)} />)
    if (bounds(q.effective) === null) {
      rows.push(
        <Text key="ohne" style={s.muted}>
          {tr('verlauf.detail.quoteOhneBrutto', { jahr: year })}
        </Text>,
      )
    } else {
      rows.push(<Line key="q" label={tr('verlauf.detail.quoteEffektiv')} value={figureText(q.effective, 'percent', open)} sum />)
      const marginal = exactValue(q.marginal)
      if (marginal !== null) rows.push(<Line key="g" label={tr('verlauf.detail.grenzsteuersatz')} value={percent(marginal)} />)
      else
        rows.push(
          <Text key="g" style={s.muted}>
            {tr('verlauf.detail.grenzEinzeln')}
          </Text>,
        )
    }
    rows.push(<DeltaLine key="d" delta={q.effective.delta} unit="percent" lowerIsBetter />)
  }

  const listItem = data.list.find((l) => l.year === year)
  let diffButton: ReactNode = null
  if (listItem?.kind === 'eckjahr') {
    diffButton = <Text style={s.muted}>{tr('verlauf.ohneAbgleich.eckjahr', { jahr: year })}</Text>
  } else if (listItem && listItem.noDiffReason === null) {
    const n = listItem.deviations
    diffButton = (
      <Pressable accessibilityRole="button" onPress={() => onOpenDiff(year)} style={s.openDiff} testID="verlauf-detail-abgleich">
        <Text style={s.strong}>{tr('verlauf.detail.abgleich')}</Text>
        <Text style={[s.counter, n > 0 ? s.counterBad : s.counterOk]}>{n > 0 ? tr('verlauf.detail.abweichungen', { count: n }) : tr('verlauf.detail.gleich')}</Text>
      </Pressable>
    )
  }

  return (
    <View style={s.detail} testID="verlauf-detail">
      <View style={s.detailHead}>
        <Text style={s.detailYear}>{year}</Text>
        <TierPill entry={entry} figure={figure} metric={metric} />
      </View>
      <Text style={s.muted}>{who}</Text>
      {rows}
      {diffButton}
    </View>
  )
}

/** The numbers behind the chart, as a table (ADR-0098 Umsetzung 3): every chart has one. */
function DataTable({ entries, metric, person }: { readonly entries: readonly YearHistoryEntryDto[]; readonly metric: HistoryMetric; readonly person: HistoryPerson }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const open = tr('verlauf.nochOffenKurz')
  const tier = (f: HistoryFigureDto | null | undefined) => tr(`verlauf.stufe.${f?.tier ?? 'offen'}`)
  let heads: string[]
  let rows: string[][]
  switch (metric) {
    case 'erstattung':
      heads = [tr('verlauf.tabelle.jahr'), tr('verlauf.tabelle.stufe'), tr('verlauf.tabelle.erklaert'), tr('verlauf.tabelle.erstattung'), tr('verlauf.tabelle.differenz')]
      rows = entries.map((e) => [String(e.year), tier(e.erstattung.amount), e.erstattung.declared === null ? '–' : signedEuro(e.erstattung.declared), signedFigureText(e.erstattung.amount, open), e.erstattung.difference === null ? '–' : signedEuro(e.erstattung.difference)])
      break
    case 'werbungskosten':
      heads = [tr('verlauf.tabelle.jahr'), tr('verlauf.tabelle.stufe'), tr('verlauf.detail.summe'), tr('verlauf.legende.pauschbetrag'), tr('verlauf.detail.angesetzt')]
      rows = entries.map((e) => {
        const w = workFor(e, person)
        return [String(e.year), tier(w?.total), figureText(w?.total, 'euro', open), w?.pauschbetrag == null ? '–' : formatEuro(w.pauschbetrag), figureText(w?.angesetzt, 'euro', open)]
      })
      break
    case 'netto':
      heads = [tr('verlauf.tabelle.jahr'), tr('verlauf.detail.brutto'), tr('verlauf.detail.lohnsteuer'), tr('verlauf.detail.sozialversicherung'), tr('verlauf.detail.netto'), tr('verlauf.tabelle.nettoQuote')]
      rows = entries.map((e) => {
        const n = netFor(e, person)
        return [String(e.year), figureText(n?.brutto, 'euro', open), figureText(n?.lohnsteuer, 'euro', open), figureText(n?.sozialversicherung, 'euro', open), figureText(n?.netto, 'euro', open), figureText(n?.nettoQuote, 'percent', open)]
      })
      break
    case 'steuerquote':
      heads = [tr('verlauf.tabelle.jahr'), tr('verlauf.tabelle.stufe'), tr('verlauf.detail.festgesetzteEst'), tr('verlauf.detail.quoteEffektiv'), tr('verlauf.detail.grenzsteuersatz')]
      rows = entries.map((e) => [String(e.year), tier(e.steuerquote.effective), figureText(e.steuerquote.incomeTax, 'euro', open), figureText(e.steuerquote.effective, 'percent', open), e.steuerquote.marginal ? figureText(e.steuerquote.marginal, 'percent', open) : '–'])
      break
  }
  return (
    <ScrollView horizontal>
      <View role="table" accessibilityLabel={tr('verlauf.datentabelle.a11y', { titel: tr(`verlauf.kennzahl.${metric}.titel`) })} testID="verlauf-datentabelle">
        <View role="row" style={s.dataRow}>
          {heads.map((h) => (
            <Text key={h} role="columnheader" style={[s.dataCell, s.dataHead]}>
              {h}
            </Text>
          ))}
        </View>
        {rows.map((r) => (
          <View key={r[0]} role="row" style={s.dataRow}>
            {r.map((c, i) => (
              <Text key={heads[i]} role={i === 0 ? 'rowheader' : 'cell'} style={s.dataCell}>
                {c}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function makeStyles(t: UiTheme) {
  const base = historyStyles(t)
  const section: ViewStyle = { gap: t.space.s3 }
  const chips: ViewStyle = { flexDirection: 'row', gap: 6, paddingVertical: 2 }
  const chip: ViewStyle = { borderWidth: t.space.kontur, borderColor: t.color.linie, backgroundColor: t.color.karte, borderRadius: t.radius.pille, paddingHorizontal: t.space.s3, paddingVertical: 6, minHeight: 44, justifyContent: 'center' }
  const chipActive: ViewStyle = { backgroundColor: t.color.funke, ...t.shadow.hartS }
  const chipText: TextStyle = { ...t.type.label, color: t.color.tinte }
  const chipTextActive: TextStyle = { color: t.color.nacht }
  const kpis: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s3 }
  const wrap: ViewStyle = { flexWrap: 'wrap' }
  const kpi: ViewStyle = { flexGrow: 1, flexBasis: 180, backgroundColor: t.color.karte, borderWidth: t.space.kontur, borderColor: t.color.linie, borderRadius: t.radius.m, paddingHorizontal: t.space.s3, paddingVertical: t.space.s3, gap: 4 }
  const kpiActive: ViewStyle = { backgroundColor: t.color.funkeWeich, ...t.shadow.hart }
  const kpiValue: TextStyle = { ...t.type.subhead, color: t.color.tinte, fontVariant: ['tabular-nums'] }
  const raster: ViewStyle = { flexDirection: 'row', gap: t.space.s4, alignItems: 'flex-start' }
  const rasterMain: ViewStyle = { flex: 1, minWidth: 0 }
  const rasterSide: ViewStyle = { width: 300, gap: t.space.s3 }
  const legend: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', columnGap: t.space.s3, rowGap: 4 }
  const legendItem: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 5 }
  const legendText: TextStyle = { ...t.type.caption, color: t.color.tinte2 }
  const swatch: ViewStyle = { width: 10, height: 10, borderRadius: 3, borderWidth: 1, borderColor: t.color.linie }
  const swatchLine: ViewStyle = { width: 14, height: 0, borderWidth: 0, borderTopWidth: 2, borderTopColor: t.color.tinte, borderRadius: 0, backgroundColor: 'transparent' }
  const tiers: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.s2, borderTopWidth: 1, borderTopColor: t.color.linieWeich, paddingTop: t.space.s2 }
  const tableToggle: ViewStyle = { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' }
  const link: TextStyle = { ...t.type.small, color: t.color.kiTinte }
  const dataRow: ViewStyle = { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.color.linieWeich }
  const dataCell: TextStyle = { ...t.type.meta, color: t.color.tinte, width: 112, paddingHorizontal: t.space.s2, paddingVertical: 6, fontVariant: ['tabular-nums'] }
  const dataHead: TextStyle = { color: t.color.tinte2, fontWeight: t.weight.schwer }
  const openDiff: ViewStyle = { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: t.space.s2, borderWidth: t.space.kontur, borderColor: t.color.linie, backgroundColor: t.color.karte, borderRadius: t.radius.pille, paddingHorizontal: t.space.s3, paddingVertical: 6, minHeight: 36, ...t.shadow.hartS }
  const counter: TextStyle = { ...t.type.captionStrong, color: t.color.karte, borderRadius: t.radius.pille, paddingHorizontal: 7, overflow: 'hidden' }
  const counterBad: TextStyle = { backgroundColor: t.color.fehler }
  const counterOk: TextStyle = { backgroundColor: t.color.ok }
  return {
    ...base, section, chips, wrap, chip, chipActive, chipText, chipTextActive, kpis, kpi, kpiActive, kpiValue, raster, rasterMain, rasterSide, legend, legendItem, legendText, swatch,
    swatchLine, tiers, tableToggle, link, dataRow, dataCell, dataHead, openDiff, counter, counterBad, counterOk,
  }
}
