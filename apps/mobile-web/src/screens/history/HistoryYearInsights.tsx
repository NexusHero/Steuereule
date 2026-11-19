import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button, useTheme, type UiTheme } from '@steuereule/ui'
import type { RecurringChecklistDto, YearHistoryResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { historyStyles } from './historyStyles'
import { joinList } from './historyFormat'
import { coupleCopy, cutsOfYear, recurringLine, repeatedCutSentence } from './historyInsights'
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
  const year = checklist.year
  return (
    <View style={s.card} testID={`verlauf-wiederkehrend-${year}`}>
      <Text style={s.cardTitle} accessibilityRole="header">
        {tr('verlauf.wiederkehrend.titel')}
      </Text>
      <Text style={s.muted}>{tr('verlauf.wiederkehrend.satz', { count: checklist.items.length, erledigt: checklist.done })}</Text>
      <View style={s.items}>
        {checklist.items.map((item) => {
          const done = item.status === 'erledigt'
          const line = recurringLine(item, year, tr)
          const state = tr(done ? 'verlauf.wiederkehrend.erledigt' : 'verlauf.wiederkehrend.offen')
          return (
            <View key={item.id} style={s.item} accessible accessibilityLabel={tr('verlauf.wiederkehrend.a11y', { label: item.label, stand: state, text: line })} testID={`verlauf-wiederkehrend-${year}-${item.id}`}>
              <View style={[s.check, done ? s.checkDone : null]}>
                <Text style={s.checkMark}>{done ? '✓' : ''}</Text>
              </View>
              <View style={s.itemBody}>
                <Text style={s.strong}>{item.label}</Text>
                {line !== '' ? <RecurringDetail line={line} cut={cutPart(item, tr)} muted={s.muted} cutStyle={s.cut} /> : null}
              </View>
              {done ? null : <Text style={[s.pill, s.pillOffen]}>{state}</Text>}
            </View>
          )
        })}
      </View>
      <Text style={s.muted}>{tr('verlauf.wiederkehrend.hinweis')}</Text>
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

/** „Zum zweiten Mal gekürzt …“ under the receipt of a Bescheid year (ADR-0099 §5). */
export function RepeatedCutNotes({ data, year }: { readonly data: YearHistoryResponseDto; readonly year: number }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const label = usePositionLabel()
  const cuts = cutsOfYear(data.repeatedCuts, year)
  if (cuts.length === 0) return null
  return (
    <View style={s.notes} testID={`verlauf-muster-${year}`}>
      {cuts.map((c) => (
        <View key={c.position} style={s.note} testID={`verlauf-muster-${year}-${c.position}`}>
          <Text style={s.body}>{repeatedCutSentence(c, label(c.position, c.label), tr)}</Text>
          {c.hint ? <Text style={s.muted}>{tr(`verlauf.lehre.hinweis.${c.position.replace(/[AB]$/, '')}`, { defaultValue: c.hint })}</Text> : null}
        </View>
      ))}
    </View>
  )
}

/** Joint against single filing for a couple's Bescheid year (ADR-0099 §6), in both directions, honest about the approximation. */
export function CoupleNote({ data, year }: { readonly data: YearHistoryResponseDto; readonly year: number }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const comparison = data.couples.find((c) => c.year === year)
  if (comparison === undefined) return null
  const copy = coupleCopy(comparison, tr)
  return (
    <View style={s.couple} testID={`verlauf-paare-${year}`}>
      <Text style={s.body}>{copy.text}</Text>
      {copy.approximate !== null ? (
        <Text style={s.muted} testID={`verlauf-paare-${year}-etwa`}>
          {copy.approximate}
        </Text>
      ) : null}
      {copy.note !== null ? <Text style={s.muted}>{copy.note}</Text> : null}
    </View>
  )
}

/** A Nachzahlung laut Bescheid: „Vorauszahlungen anpassen lassen“ (ADR-0099 §3), no saving tips. */
export function PrepaymentNote({ data, year }: { readonly data: YearHistoryResponseDto; readonly year: number }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  if (data.prepayments.years.find((p) => p.year === year)?.adjustPrepayments !== true) return null
  return (
    <Text style={s.hint} testID={`verlauf-vorauszahlung-${year}`}>
      {tr('verlauf.vorauszahlung.hinweis')}
    </Text>
  )
}

function makeStyles(t: UiTheme) {
  const base = historyStyles(t)
  const items: ViewStyle = { gap: t.space.s2, borderTopWidth: 1, borderTopColor: t.color.linieWeich, paddingTop: t.space.s3 }
  const item: ViewStyle = { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.s3 }
  const itemBody: ViewStyle = { flex: 1, minWidth: 0, gap: 2 }
  const check: ViewStyle = { width: 22, height: 22, borderRadius: 11, borderWidth: t.space.kontur, borderColor: t.color.linie, alignItems: 'center', justifyContent: 'center', marginTop: 1 }
  const checkDone: ViewStyle = { backgroundColor: t.color.okWeich, borderColor: t.color.ok }
  const checkMark: TextStyle = { ...t.type.captionStrong, color: t.color.ok }
  const cut: TextStyle = { color: t.color.fehler }
  const notes: ViewStyle = { gap: t.space.s2 }
  const note: ViewStyle = { backgroundColor: t.color.warnWeich, borderRadius: t.radius.s, paddingHorizontal: t.space.s3, paddingVertical: t.space.s2, gap: 4 }
  const couple: ViewStyle = { backgroundColor: t.color.kiWeich, borderRadius: t.radius.s, paddingHorizontal: t.space.s3, paddingVertical: t.space.s2, gap: 4 }
  return { ...base, items, item, itemBody, check, checkDone, checkMark, cut, notes, note, couple }
}
