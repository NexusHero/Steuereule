import { Fragment, useRef, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, Text, View, type ScrollViewInstance, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button, Card, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import type { OpenItemDto, YearHistoryResponseDto, YearListItemDto } from '@steuereule/api-client'
import { formatEuro } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { makeStyles as cockpitStyles } from '../cockpit/CockpitScreen.styles'
import { AssessmentUploadEntry } from './AssessmentUploadEntry'
import { HistoryGate, HistoryHeader, historyScreenStyles } from './HistoryGate'
import { historyStyles } from './historyStyles'
import { germanDate, newestFirst, signedEuro } from './historyFormat'
import { asksFiledElsewhere, eventsByYear } from './historyInsights'
import { FiledElsewhereQuestion } from './FiledElsewhereQuestion'
import { declaredAmount, missingShort, urgentFirst, yearAmount, yearStatus } from './historyTimeline'

export interface HistoryScreenProps {
  readonly isGuest: boolean
  /** The year open in the app (the upload's context). */
  readonly openYear: number
  readonly onRegister?: (() => void) | undefined
  readonly onLogin?: (() => void) | undefined
  /** Opens the year's page: its Abgleich, its deadline, what it lacks. */
  readonly onOpenYearDetail?: ((year: number) => void) | undefined
  /** Opens „Entwicklung über die Jahre“ with the four charts. */
  readonly onOpenDevelopment?: (() => void) | undefined
  /** The owl's waiting drafts after an upload. */
  readonly onOpenDrafts?: (() => void) | undefined
  /** „Unterlagen“: the Bescheide, the time to them and the Einsprüche (ADR-0099 §9). */
  readonly onOpenDocuments?: (() => void) | undefined
  /** „2022 anfangen“: the cockpit of a year that can still be filed (ADR-0099 §1). */
  readonly onStartYear?: ((year: number) => void) | undefined
}

/**
 * The tab „Verlauf“ as a timeline (ADR-0098 §1, alternative A): what matters now in the cockpit's
 * dark block, one row per year, then the way to the development and to older years. One phone screen.
 */
export function HistoryScreen(props: HistoryScreenProps) {
  return (
    <HistoryGate isGuest={props.isGuest} onRegister={props.onRegister} onLogin={props.onLogin}>
      {(data) => <HistoryLoaded {...props} data={data} />}
    </HistoryGate>
  )
}

function HistoryLoaded({ data, openYear, onOpenYearDetail, onOpenDevelopment, onOpenDrafts, onOpenDocuments, onStartYear }: HistoryScreenProps & { readonly data: YearHistoryResponseDto }) {
  const bp = useBreakpoint()
  const wide = bp !== 's'
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const scroll = useRef<ScrollViewInstance>(null)
  const timelineY = useRef(0)
  const [olderOpen, setOlderOpen] = useState(false)
  const years = data.years
  const range = years.length > 0 ? `${years[0]!.year}–${years[years.length - 1]!.year}` : undefined
  const openDetail = (year: number) => onOpenYearDetail?.(year)

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

  const links = <LinksRow onOpenDevelopment={onOpenDevelopment} onOpenDocuments={onOpenDocuments} />

  if (years.length === 0) {
    return (
      <ScrollView contentContainerStyle={wide ? s.wideScreen : s.screen} testID="screen-container">
        <HistoryHeader />
        <View style={s.card} testID="verlauf-leer">
          <Text style={s.cardTitle}>{tr('verlauf.leer.titel')}</Text>
          <Text style={s.muted}>{tr('verlauf.leer.text')}</Text>
        </View>
        {upload}
      </ScrollView>
    )
  }

  return (
    <ScrollView ref={scroll} contentContainerStyle={wide ? s.wideScreen : s.screen} testID="screen-container">
      <HistoryHeader range={range} />
      <NowCard data={data} onOpen={openDetail} onStart={(year) => (onStartYear ? onStartYear(year) : openDetail(year))} onMore={() => scroll.current?.scrollTo?.({ y: timelineY.current, animated: true })} />
      <View
        onLayout={(e) => {
          timelineY.current = e.nativeEvent.layout.y
        }}
      >
        {wide ? <YearTable data={data} onPick={openDetail} links={links} /> : <YearList data={data} onPick={openDetail} links={links} />}
      </View>
      <View style={s.older}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: olderOpen }} onPress={() => setOlderOpen((v) => !v)} style={s.quietLink} testID="verlauf-aeltere">
          <Text style={s.quietLinkText}>{`${olderOpen ? '▾' : '▸'} ${tr('verlauf.links.aeltere')}`}</Text>
        </Pressable>
        {olderOpen ? upload : null}
      </View>
    </ScrollView>
  )
}

interface NowCopy {
  readonly label: string
  /** The cockpit's large lime figure; only an amount the Finanzamt changed. */
  readonly figure: string | null
  readonly headline: string | null
  readonly text: string
  readonly a11y: string
  /** What the block offers: open the year, start a year without data, or ask „Schon abgegeben?“. */
  readonly action: 'ansehen' | 'anfangen' | 'frage'
}

function nowCopy(item: OpenItemDto, data: YearHistoryResponseDto, tr: TFunction): NowCopy {
  const year = item.year
  if (item.kind === 'einspruchsfrist') {
    const days = item.deadline?.running ? tr('verlauf.jetzt.frist', { count: item.deadline.remainingDays }) : ''
    const diff = item.refundDifference ?? null
    if (diff !== null && diff !== 0) {
      const key = diff < 0 ? 'gekuerzt' : 'mehr'
      return { label: tr(`verlauf.jetzt.${key}`, { jahr: year }), figure: signedEuro(diff), headline: null, text: days, a11y: `${tr(`verlauf.jetzt.${key}A11y`, { jahr: year, betrag: formatEuro(Math.abs(diff)) })}. ${days}`, action: 'ansehen' }
    }
    const headline = tr('verlauf.jetzt.aenderungen', { jahr: year, count: item.deviations ?? 0 })
    return { label: tr('verlauf.jetzt.label'), figure: null, headline, text: days, a11y: `${headline}. ${days}`, action: 'ansehen' }
  }
  if (item.kind === 'wartet-auf-bescheid') {
    const cuts = item.repeatedCuts ?? []
    const headline = tr('verlauf.jetzt.wartet', { jahr: year })
    const text = cuts.length > 0 ? tr('verlauf.jetzt.wartetText', { count: cuts.length, vorjahr: year - 1 }) : tr('verlauf.jetzt.wartetOhne')
    return { label: tr('verlauf.jetzt.label'), figure: null, headline, text, a11y: `${headline}. ${text}`, action: 'ansehen' }
  }
  const listItem = data.list.find((l) => l.year === year)
  if (listItem !== undefined && !listItem.hasData) {
    // A year of the Festsetzungsfrist without data (ADR-0099 §1): asked once, else open with its deadline. No amount.
    const datum = germanDate(item.filingDeadline ?? listItem.deadline.endsOn)
    if (item.askFiledElsewhere === true) {
      const headline = tr('verlauf.frage.titel', { jahr: year })
      const text = tr('verlauf.frage.text', { datum })
      return { label: tr('verlauf.jetzt.label'), figure: null, headline, text, a11y: `${headline} ${text}`, action: 'frage' }
    }
    const headline = tr('verlauf.jetzt.nichtAbgegeben', { jahr: year })
    const text = tr('verlauf.jetzt.bisMoeglich', { datum })
    return { label: tr('verlauf.jetzt.label'), figure: null, headline, text, a11y: `${headline}, ${text}`, action: 'anfangen' }
  }
  const entry = data.years.find((y) => y.year === year)
  const headline = tr('verlauf.jetzt.offen', { jahr: year })
  const missing = missingShort(item.missing ?? entry?.missing ?? [], tr)
  const until = item.filingDeadline ? tr('verlauf.jetzt.bisMoeglich', { datum: germanDate(item.filingDeadline) }) : ''
  const text = [missing, until].filter((p) => p !== '').join(' · ')
  return { label: tr('verlauf.jetzt.label'), figure: null, headline, text, a11y: text === '' ? headline : `${headline}. ${text}`, action: 'ansehen' }
}

/** „Jetzt wichtig“ in the cockpit's dark block: only the most urgent item, the rest as one quiet line. */
function NowCard({ data, onOpen, onStart, onMore }: { readonly data: YearHistoryResponseDto; readonly onOpen: (year: number) => void; readonly onStart: (year: number) => void; readonly onMore: () => void }) {
  const t = useTheme()
  const s = makeStyles(t)
  const c = cockpitStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [first, ...rest] = urgentFirst(data.openItems, data.today)
  if (first === undefined) {
    return (
      <Card variant="nacht" style={s.hero} testID="verlauf-jetzt">
        <Text style={c.heroLabel}>{tr('verlauf.jetzt.label')}</Text>
        <Text style={c.gatedHeading} testID="verlauf-jetzt-erledigt">
          {tr('verlauf.jetzt.erledigt')}
        </Text>
        <Text style={s.heroText}>{tr('verlauf.jetzt.erledigtText')}</Text>
      </Card>
    )
  }
  const copy = nowCopy(first, data, tr)
  return (
    <Card variant="nacht" style={s.hero} testID="verlauf-jetzt">
      {/* One element reads as the whole statement („2024: Das Finanzamt hat 92 € gekürzt. Einspruch noch 19 Tage möglich“). */}
      <View accessible accessibilityLabel={copy.a11y} testID="verlauf-jetzt-inhalt">
        {copy.figure !== null ? (
          <>
            <Text style={c.heroLabel}>{tr('verlauf.jetzt.label')}</Text>
            <Text style={c.refundLabel}>{copy.label}</Text>
            <Text style={c.heroValue}>{copy.figure}</Text>
          </>
        ) : (
          <>
            <Text style={c.heroLabel}>{copy.label}</Text>
            <Text style={c.gatedHeading}>{copy.headline}</Text>
          </>
        )}
        {copy.text !== '' ? <Text style={copy.figure !== null ? c.effectLine : s.heroText}>{copy.text}</Text> : null}
      </View>
      {copy.action === 'frage' ? (
        <View style={s.heroQuestion}>
          <FiledElsewhereQuestion year={first.year} tone="nacht" testID="verlauf-jetzt-frage" />
        </View>
      ) : null}
      {/* The button and the quiet line share a row, so the block stays the height of the cockpit's. */}
      <View style={s.heroActions}>
        {copy.action === 'anfangen' ? (
          <Button onPress={() => onStart(first.year)} style={s.heroButton} testID="verlauf-jetzt-anfangen">
            {tr('verlauf.jetzt.anfangen', { jahr: first.year })}
          </Button>
        ) : copy.action === 'ansehen' ? (
          <Button onPress={() => onOpen(first.year)} style={s.heroButton} testID="verlauf-jetzt-ansehen">
            {tr('verlauf.jetzt.ansehen')}
          </Button>
        ) : null}
        {rest.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={onMore} style={s.heroMore} testID="verlauf-jetzt-weitere">
            <Text style={s.heroMoreText}>{tr('verlauf.jetzt.weitere', { count: rest.length })}</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  )
}

/** The year the hero asks „Schon abgegeben?“ for, so its row does not ask a second time. */
function heroQuestionYear(data: YearHistoryResponseDto): number | null {
  const first = urgentFirst(data.openItems, data.today)[0]
  return first?.kind === 'offen' && first.askFiledElsewhere === true ? first.year : null
}

/** A life event between the rows (ADR-0099 §4, mock: violet dot and a short label). */
function EventMarker({ year, phrase }: { readonly year: number; readonly phrase: string }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  return (
    <View style={s.event} accessible accessibilityLabel={tr('verlauf.ereignis.a11y', { jahr: year, was: phrase })} testID={`verlauf-ereignis-${year}`}>
      <View style={s.eventDot} />
      <Text style={s.eventText}>{tr('verlauf.ereignis.zeile', { jahr: year, was: phrase })}</Text>
    </View>
  )
}

/** „Schon abgegeben?“ under a row of a year without data, unless the hero asks it already. */
function RowQuestion({ item, heroYear }: { readonly item: YearListItemDto; readonly heroYear: number | null }) {
  const t = useTheme()
  const s = makeStyles(t)
  if (!asksFiledElsewhere(item) || item.year === heroYear) return null
  return (
    <View style={s.rowQuestion}>
      <FiledElsewhereQuestion year={item.year} tone="hell" testID={`verlauf-frage-${item.year}`} />
    </View>
  )
}

/** The timeline on the phone: newest first, one bordered row per year with one phrase and one amount, the life events between the rows. */
function YearList({ data, onPick, links }: { readonly data: YearHistoryResponseDto; readonly onPick: (year: number) => void; readonly links: ReactNode }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const events = eventsByYear(data.events, tr)
  const heroYear = heroQuestionYear(data)
  return (
    <View style={s.list} accessibilityLabel={tr('verlauf.zeile.liste')} testID="verlauf-jahre">
      {newestFirst(data.list).map((item, i) => {
        const entry = data.years.find((y) => y.year === item.year)
        const status = yearStatus(item, entry, tr)
        const amount = yearAmount(item, entry)
        const phrase = events.get(item.year)
        return (
          <Fragment key={item.year}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('verlauf.zeile.a11y', { jahr: item.year, stand: status.text, betrag: amount === '–' ? tr('verlauf.nochOffenKurz') : amount })}
              accessibilityHint={tr('verlauf.zeile.oeffnen')}
              onPress={() => onPick(item.year)}
              style={[s.row, i === 0 ? null : s.rowLine]}
              testID={`verlauf-jahr-${item.year}`}
            >
              <View style={s.rowTop}>
                <Text style={s.rowYear}>{item.year}</Text>
                <Text style={s.amount}>{amount}</Text>
              </View>
              <Text style={[s.rowStatus, status.tone === 'bad' ? s.textBad : null]}>{status.text}</Text>
            </Pressable>
            <RowQuestion item={item} heroYear={heroYear} />
            {phrase !== undefined ? <EventMarker year={item.year} phrase={phrase} /> : null}
          </Fragment>
        )
      })}
      {links}
    </View>
  )
}

/** „Entwicklung ansehen“ and „Unterlagen“ side by side at the end of the timeline (ADR-0099 §9). */
function LinksRow({ onOpenDevelopment, onOpenDocuments }: { readonly onOpenDevelopment?: (() => void) | undefined; readonly onOpenDocuments?: (() => void) | undefined }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  return (
    <View style={[s.rowLine, s.links]}>
      <Pressable accessibilityRole="button" onPress={() => onOpenDevelopment?.()} style={[s.row, s.linkRow, s.flex]} testID="verlauf-entwicklung">
        <Text style={[s.strong, s.flex]}>{tr('verlauf.links.entwicklung')}</Text>
        <Text style={s.chevron}>→</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => onOpenDocuments?.()} style={[s.row, s.linkRow, s.linkSplit]} testID="verlauf-unterlagen">
        <Text style={s.strong}>{tr('verlauf.links.unterlagen')}</Text>
        <Text style={s.chevron}>→</Text>
      </Pressable>
    </View>
  )
}

const COLUMNS = [{ width: 72 }, { flex: 1 }, { width: 160 }, { width: 140 }] as const

/** The timeline on tablet and desktop: the same rows as a table of four columns, no horizontal scroll. */
function YearTable({ data, onPick, links }: { readonly data: YearHistoryResponseDto; readonly onPick: (year: number) => void; readonly links: ReactNode }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const events = eventsByYear(data.events, tr)
  const heroYear = heroQuestionYear(data)
  const heads = [tr('verlauf.tabelle.jahr'), tr('verlauf.tabelle.stand'), tr('verlauf.tabelle.erklaert'), tr('verlauf.tabelle.lautBescheid')]
  return (
    <View style={s.list} testID="verlauf-tabelle">
      <View role="table" accessibilityLabel={tr('verlauf.zeile.liste')}>
        <View role="row" style={s.tableHead}>
          {heads.map((h, i) => (
            <Text key={h} role="columnheader" style={[s.th, COLUMNS[i], i > 1 ? s.right : null]}>
              {h}
            </Text>
          ))}
        </View>
        {newestFirst(data.list).map((item) => {
          const entry = data.years.find((y) => y.year === item.year)
          const status = yearStatus(item, entry, tr)
          const cells = [
            <Text style={s.rowYear}>{item.year}</Text>,
            <Text style={[s.rowStatus, status.tone === 'bad' ? s.textBad : null]}>{status.text}</Text>,
            <Text style={[s.amount, s.right]}>{declaredAmount(item, entry)}</Text>,
            <Text style={[s.amount, s.right]}>{item.assessedRefund === null || !item.hasData ? '–' : signedEuro(item.assessedRefund)}</Text>,
          ]
          const phrase = events.get(item.year)
          return (
            <Fragment key={item.year}>
              <Pressable role="row" accessibilityHint={tr('verlauf.zeile.oeffnen')} onPress={() => onPick(item.year)} style={s.tableRow} testID={`verlauf-tabelle-${item.year}`}>
                {cells.map((cell, i) => (
                  <View key={heads[i]} role="cell" style={[s.cell, COLUMNS[i]]}>
                    {cell}
                  </View>
                ))}
              </Pressable>
              {asksFiledElsewhere(item) && item.year !== heroYear ? (
                <View role="row" style={s.tableExtra}>
                  <View role="cell" style={s.flex}>
                    <RowQuestion item={item} heroYear={heroYear} />
                  </View>
                </View>
              ) : null}
              {phrase !== undefined ? (
                <View role="row">
                  <View role="cell" style={s.flex}>
                    <EventMarker year={item.year} phrase={phrase} />
                  </View>
                </View>
              ) : null}
            </Fragment>
          )
        })}
      </View>
      {links}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const base = historyStyles(t)
  const frame = historyScreenStyles(t)
  // The Card's own bottom margin would double the screen's gap.
  const hero: ViewStyle = { marginBottom: 0, gap: 0 }
  const heroText: TextStyle = { ...t.type.small, color: t.color.nachtText, opacity: 0.85 }
  const heroActions: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, marginTop: t.space.s3 }
  const heroButton: ViewStyle = { width: 'auto', flexShrink: 0 }
  const heroMore: ViewStyle = { flex: 1, minHeight: 44, justifyContent: 'center' }
  const heroMoreText: TextStyle = { ...t.type.small, color: t.color.nachtText, opacity: 0.75, textDecorationLine: 'underline' }
  const list: ViewStyle = { backgroundColor: t.color.karte, borderWidth: t.space.kontur, borderColor: t.color.linie, borderRadius: t.radius.m, overflow: 'hidden' }
  const row: ViewStyle = { paddingHorizontal: t.space.s4, paddingVertical: 6, minHeight: 44, justifyContent: 'center', gap: 2 }
  const rowLine: ViewStyle = { borderTopWidth: 1, borderTopColor: t.color.linieWeich }
  const rowTop: ViewStyle = { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: t.space.s3 }
  const rowYear: TextStyle = { ...t.type.itemTitle, color: t.color.tinte }
  const rowStatus: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const amount: TextStyle = { ...t.type.labelStrong, color: t.color.tinte, fontVariant: ['tabular-nums'] }
  const textBad: TextStyle = { color: t.color.fehler }
  const linkRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3 }
  const flex: TextStyle = { flex: 1, minWidth: 0 }
  const chevron: TextStyle = { ...t.type.bodyStrong, color: t.color.tinte }
  const tableHead: ViewStyle = { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.color.linieWeich, paddingHorizontal: t.space.s2 }
  const th: TextStyle = { ...t.type.captionStrong, color: t.color.tinte2, paddingHorizontal: t.space.s2, paddingVertical: t.space.s2 }
  const right: TextStyle = { textAlign: 'right' }
  const tableRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: t.color.linieWeich, paddingHorizontal: t.space.s2, minHeight: 44 }
  const cell: ViewStyle = { paddingHorizontal: t.space.s2, paddingVertical: t.space.s2, minWidth: 0 }
  const older: ViewStyle = { gap: t.space.s3 }
  const heroQuestion: ViewStyle = { marginTop: t.space.s3 }
  const event: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, paddingHorizontal: t.space.s4, paddingVertical: 4, backgroundColor: t.color.kiWeich }
  const eventDot: ViewStyle = { width: 8, height: 8, borderRadius: 4, backgroundColor: t.color.ki }
  const eventText: TextStyle = { ...t.type.caption, color: t.color.kiTinte, flexShrink: 1 }
  const rowQuestion: ViewStyle = { paddingHorizontal: t.space.s4, paddingBottom: t.space.s2 }
  const links: ViewStyle = { flexDirection: 'row' }
  const linkSplit: ViewStyle = { borderLeftWidth: 1, borderLeftColor: t.color.linieWeich }
  const tableExtra: ViewStyle = { flexDirection: 'row', paddingHorizontal: t.space.s2 }
  const quietLink: ViewStyle = { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }
  const quietLinkText: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  return {
    ...base, ...frame, hero, heroText, heroActions, heroButton, heroMore, heroMoreText, list, row, rowLine, rowTop, rowYear, rowStatus, amount, textBad, linkRow, flex, chevron,
    tableHead, th, right, tableRow, cell, older, quietLink, quietLinkText, heroQuestion, event, eventDot, eventText, rowQuestion, links, linkSplit, tableExtra,
  }
}
