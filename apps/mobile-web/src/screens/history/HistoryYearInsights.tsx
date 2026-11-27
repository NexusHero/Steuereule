import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { FLOW_CONTENT_MAX_WIDTH, Button, useTheme, type UiTheme } from '@steuereule/ui'
import type { RecurringChecklistDto, YearHistoryResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { historyStyles } from './historyStyles'
import { joinList } from './historyFormat'
import { coupleCopy, cutsOfYear, recurringLine, repeatedCutSentence, repeatedCutTitle } from './historyInsights'
import { usePositionLabel } from './positionLabels'

/**
 * „Kommt jedes Jahr wieder“ on the open year's page (ADR-0099 §2, mock idea 2): the items of the last two
 * years, done or open, last year's amount as a hint (never prefilled), the receipt's state and the cuts
 * that came again (§5). Receipts go up through the one Beleg pipeline of the Belege tab.
 */
export function RecurringChecklist({ checklist, onOpenReceipts }: { readonly checklist: RecurringChecklistDto; readonly onOpenReceipts?: (() => void) | undefined }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [doneOpen, setDoneOpen] = useState(false)
  const year = checklist.year
  // A done item the Finanzamt cut before stays in sight: its warning is the reason to look again.
  const folded = (i: RecurringChecklistDto['items'][number]) => i.status === 'erledigt' && i.cutInYears.length === 0
  const open = checklist.items.filter((i) => !folded(i))
  const done = checklist.items.filter(folded)
  const row = (item: RecurringChecklistDto['items'][number]) => {
    const isDone = item.status === 'erledigt'
    const line = recurringLine(item, year, tr)
    const state = tr(isDone ? 'verlauf.wiederkehrend.erledigt' : 'verlauf.wiederkehrend.offen')
    return (
      <View key={item.id} style={s.item} accessible accessibilityLabel={tr('verlauf.wiederkehrend.a11y', { label: item.label, stand: state, text: line })} testID={`verlauf-wiederkehrend-${year}-${item.id}`}>
        <View style={[s.check, isDone ? s.checkDone : null]}>
          <Text style={s.checkMark}>{isDone ? '✓' : ''}</Text>
        </View>
        <View style={s.itemBody}>
          <Text style={s.strong}>{item.label}</Text>
          {line !== '' ? <RecurringDetail line={line} cut={cutPart(item, tr)} muted={s.muted} cutStyle={s.cut} /> : null}
        </View>
      </View>
    )
  }
  return (
    <View style={s.card} testID={`verlauf-wiederkehrend-${year}`}>
      <Text style={s.cardTitle} accessibilityRole="header">
        {tr('verlauf.wiederkehrend.titel')}
      </Text>
      <View style={s.items}>{open.map(row)}</View>
      {done.length > 0 ? (
        <Pressable accessibilityRole="button" aria-expanded={doneOpen} onPress={() => setDoneOpen((v) => !v)} style={s.lineHead} testID={`verlauf-wiederkehrend-${year}-erledigt`}>
          <Text style={s.muted}>{`${doneOpen ? '▾' : '▸'} ${tr('verlauf.wiederkehrend.erledigtZahl', { count: done.length })}`}</Text>
        </Pressable>
      ) : null}
      {doneOpen ? <View style={s.itemsPlain}>{done.map(row)}</View> : null}
      {onOpenReceipts ? (
        <Button variant="ghost" onPress={onOpenReceipts} testID={`verlauf-wiederkehrend-${year}-belege`}>
          {tr('verlauf.wiederkehrend.belege')}
        </Button>
      ) : null}
    </View>
  )
}

/** The warning part of a checklist line („⚠ 2023 und 2024 gekürzt“), or '' when the item was never cut. */
function cutPart(item: RecurringChecklistDto['items'][number], tr: TFunction): string {
  return item.cutInYears.length > 0 ? tr('verlauf.wiederkehrend.gekuerzt', { jahre: joinList(item.cutInYears.map(String), tr) }) : ''
}

/** The checklist line in muted text, only its cut warning at the end in the error colour. */
function RecurringDetail({ line, cut, muted, cutStyle }: { readonly line: string; readonly cut: string; readonly muted: TextStyle; readonly cutStyle: TextStyle }) {
  if (cut === '' || !line.endsWith(cut)) return <Text style={muted}>{line}</Text>
  return (
    <Text style={muted}>
      {line.slice(0, line.length - cut.length)}
      <Text style={cutStyle}>{cut}</Text>
    </Text>
  )
}

/** One quiet line under the Abgleich; with a detail it opens on a tap. No coloured box: the Abgleich above carries the colour. */
function NoteLine({ title, detail, testID, detailTestID }: { readonly title: string; readonly detail: readonly string[]; readonly testID: string; readonly detailTestID?: string | undefined }) {
  const t = useTheme()
  const s = makeStyles(t)
  const [open, setOpen] = useState(false)
  if (detail.length === 0) {
    return (
      <View style={s.line} testID={testID}>
        <Text style={s.body}>{title}</Text>
      </View>
    )
  }
  return (
    <View style={s.line} testID={testID}>
      <Pressable accessibilityRole="button" aria-expanded={open} onPress={() => setOpen((v) => !v)} style={s.lineHead}>
        <Text style={[s.body, s.lineTitle]}>{title}</Text>
        <Text style={s.muted}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open ? (
        <View style={s.lineDetail} testID={detailTestID}>
          {detail.map((d) => (
            <Text key={d} style={s.muted}>
              {d}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  )
}

/** „Zum zweiten Mal gekürzt: Homeoffice-Pauschale“ under the Abgleich of a Bescheid year (ADR-0099 §5); years, amounts and the hint on a tap. */
export function RepeatedCutNotes({ data, year }: { readonly data: YearHistoryResponseDto; readonly year: number }) {
  const { t: tr } = useTranslation(APP_NS)
  const label = usePositionLabel()
  const cuts = cutsOfYear(data.repeatedCuts, year)
  if (cuts.length === 0) return null
  return (
    <View testID={`verlauf-muster-${year}`}>
      {cuts.map((c) => {
        const name = label(c.position, c.label)
        const hint = c.hint ? tr(`verlauf.lehre.hinweis.${c.position.replace(/[AB]$/, '')}`, { defaultValue: c.hint }) : null
        return (
          <NoteLine
            key={c.position}
            title={tr('verlauf.muster.kurz', { titel: repeatedCutTitle(c, tr), position: name })}
            detail={[repeatedCutSentence(c, name, tr), hint].filter((x): x is string => x !== null)}
            testID={`verlauf-muster-${year}-${c.position}`}
            detailTestID={`verlauf-muster-${year}-${c.position}-detail`}
          />
        )
      })}
    </View>
  )
}

/** Joint against single filing for a couple's Bescheid year (ADR-0099 §6), in both directions; how the app got there on a tap. */
export function CoupleNote({ data, year }: { readonly data: YearHistoryResponseDto; readonly year: number }) {
  const { t: tr } = useTranslation(APP_NS)
  const comparison = data.couples.find((c) => c.year === year)
  // A year the app has no tariff for says nothing: a sentence about what the app cannot do helps nobody.
  if (comparison === undefined || comparison.status === 'tarif-fehlt') return null
  const copy = coupleCopy(comparison, tr)
  return <NoteLine title={copy.text} detail={[copy.approximate, copy.note].filter((x): x is string => x !== null)} testID={`verlauf-paare-${year}`} detailTestID={`verlauf-paare-${year}-etwa`} />
}

/** A Nachzahlung laut Bescheid: „Vorauszahlungen anpassen lassen“ (ADR-0099 §3), no saving tips. */
export function PrepaymentNote({ data, year }: { readonly data: YearHistoryResponseDto; readonly year: number }) {
  const { t: tr } = useTranslation(APP_NS)
  if (data.prepayments.years.find((p) => p.year === year)?.adjustPrepayments !== true) return null
  return <NoteLine title={tr('verlauf.vorauszahlung.hinweis')} detail={[]} testID={`verlauf-vorauszahlung-${year}`} />
}

function makeStyles(t: UiTheme) {
  const base = historyStyles(t)
  const items: ViewStyle = { gap: t.space.s2, borderTopWidth: 1, borderTopColor: t.color.linieWeich, paddingTop: t.space.s3 }
  const item: ViewStyle = { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.s3 }
  const itemBody: ViewStyle = { flex: 1, minWidth: 0, gap: 2 }
  const check: ViewStyle = { width: 22, height: 22, borderRadius: 11, borderWidth: t.space.kontur, borderColor: t.color.linie, alignItems: 'center', justifyContent: 'center', marginTop: 1 }
  const checkDone: ViewStyle = { backgroundColor: t.color.okWeich, borderColor: t.color.ok }
  const checkMark: TextStyle = { ...t.type.captionStrong, color: t.color.ok }
  const cut: TextStyle = { color: t.color.tinte, fontWeight: t.weight.schwer }
  const itemsPlain: ViewStyle = { gap: t.space.s2 }
  const line: ViewStyle = { width: '100%', maxWidth: FLOW_CONTENT_MAX_WIDTH, borderTopWidth: 1, borderTopColor: t.color.linieWeich, paddingVertical: t.space.s1 }
  const lineHead: ViewStyle = { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const lineTitle: TextStyle = { flex: 1, minWidth: 0 }
  const lineDetail: ViewStyle = { gap: 4, paddingBottom: t.space.s2 }
  return { ...base, items, itemsPlain, item, itemBody, check, checkDone, checkMark, cut, line, lineHead, lineTitle, lineDetail }
}
