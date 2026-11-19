import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { FLOW_CONTENT_MAX_WIDTH, useTheme, type UiTheme } from '@steuereule/ui'
import type { AppealDeadlineDto, AssessmentDiffDto, AssessmentDiffRowDto, AssessmentLessonDto, AssessmentOwnDeviationDto } from '@steuereule/api-client'
import { formatEuro, formatNumber, nextYearRepeat } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { germanDate, signedEuro } from './historyFormat'
import { usePositionLabel } from './positionLabels'

export interface AssessmentDiffViewProps {
  readonly diff: AssessmentDiffDto
  readonly deadline: AppealDeadlineDto | null
  readonly submittedOn?: string | null | undefined
  readonly assessmentDate?: string | null | undefined
  /** Whose single return this Abgleich is; null for the joint one. */
  readonly person?: 'A' | 'B' | null | undefined
  readonly lessons?: readonly AssessmentLessonDto[] | undefined
  /** The open year whose masks show the lessons again, when known. */
  readonly maskYear?: number | null | undefined
  /** The deadline chip leads into the existing Einspruch flow; without it the chip only informs. */
  readonly onPrepareAppeal?: (() => void) | undefined
  /** False on the year page, whose own title already names the year. */
  readonly yearInTitle?: boolean | undefined
  readonly testID?: string | undefined
}

type Tone = 'bad' | 'good' | null
const toneOf = (n: number | null): Tone => (n === null || n === 0 ? null : n < 0 ? 'bad' : 'good')

/**
 * Erklärung ↔ Bescheid as a receipt (ADR-0098 §8): one figure for what the Bescheid did to the refund,
 * the deadline beside it, one line per own deviation like a diff (sign, position, effect), and the form
 * view one tap away. Each line opens to its values, the reason, the Finanzamt's quote and the lesson. The same view in the
 * Verlauf and in „Bescheid prüfen“.
 */
export function AssessmentDiffView({ diff, deadline, submittedOn, assessmentDate, person = null, lessons = [], maskYear = null, onPrepareAppeal, yearInTitle = true, testID = 'bescheid-abgleich' }: AssessmentDiffViewProps) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const label = usePositionLabel()
  const [formOpen, setFormOpen] = useState(false)
  const [whyOpen, setWhyOpen] = useState(false)
  const own = [...diff.ownDeviations].sort((a, b) => Math.abs(b.refundEffect ?? 0) - Math.abs(a.refundEffect ?? 0))
  const refundRow = diff.groups.flatMap((g) => g.rows).find((r) => r.position === 'erstattung') ?? null
  const total = diff.totalRefundEffect
  const personName = person === null ? null : tr(`verlauf.person.${person}`)
  const title = yearInTitle
    ? personName === null
      ? tr('verlauf.abgleich.titel', { jahr: diff.year })
      : tr('verlauf.abgleich.titelPerson', { jahr: diff.year, person: personName })
    : personName

  const footnote = [
    submittedOn ? tr('verlauf.abgleich.eingereicht', { datum: germanDate(submittedOn) }) : null,
    assessmentDate ? tr('verlauf.abgleich.bescheidVom', { datum: germanDate(assessmentDate) }) : null,
  ]
    .filter((x): x is string => x !== null)
    .join(' · ')

  return (
    <View style={s.card} testID={testID} accessibilityLiveRegion="polite">
      {title !== null ? (
        <Text style={s.title} accessibilityRole="header">
          {title}
        </Text>
      ) : null}

      {diff.counts.deviations === 0 ? (
        <>
          <Text style={s.body} testID={`${testID}-gleich`}>
            {tr(diff.filingType === 'einzel' && person !== null ? 'verlauf.abgleich.gleichEinzeln' : 'verlauf.abgleich.gleich', { count: diff.counts.same })}
          </Text>
          {diff.counts.notRead > 0 ? <Text style={s.muted}>{tr('verlauf.abgleich.nichtGelesenHinweis', { count: diff.counts.notRead })}</Text> : null}
          {deadline !== null ? (
            <View style={s.chipLine}>
              <DeadlineChip deadline={deadline} onPrepareAppeal={onPrepareAppeal} testID={testID} />
            </View>
          ) : null}
          {/* No form view to carry the dates when nothing changed, so they stay here. */}
          {footnote !== '' ? <Text style={s.foot}>{footnote}</Text> : null}
        </>
      ) : (
        <>
          <View style={s.head}>
            <View style={s.flex}>
              <View style={s.figureLine}>
                <Text
                  style={[s.figure, total === null ? null : toneText(s, toneOf(total))]}
                  accessibilityLabel={total === null ? tr('verlauf.abgleich.wirkungUnbekannt') : tr('verlauf.abgleich.wirkungGesamtA11y', { wert: signedEuro(total) })}
                  testID={`${testID}-wirkung`}
                >
                  {total === null ? '–' : signedEuro(total)}
                </Text>
                {diff.effectsDifferFromTotal && diff.singleEffectsSum !== null && total !== null ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={tr('verlauf.abgleich.warumSumme')}
                    aria-expanded={whyOpen}
                    onPress={() => setWhyOpen((v) => !v)}
                    style={s.info}
                    testID={`${testID}-nichtlinear-umschalten`}
                  >
                    <Text style={s.infoGlyph}>ⓘ</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            {deadline !== null ? <DeadlineChip deadline={deadline} onPrepareAppeal={onPrepareAppeal} testID={testID} /> : null}
          </View>
          {/* Under the figure across the full width: beside the deadline chip it broke into two lines on a phone. */}
          {refundRow && refundRow.declared !== null && refundRow.assessed !== null && refundRow.declared !== refundRow.assessed ? (
            <Text style={s.muted}>{tr('verlauf.abgleich.erstattung', { erklaert: formatNumber(refundRow.declared), festgesetzt: formatEuro(refundRow.assessed) })}</Text>
          ) : null}
          {whyOpen && diff.singleEffectsSum !== null && total !== null ? (
            <Text style={s.muted} testID={`${testID}-nichtlinear`}>
              {tr('verlauf.abgleich.nichtLinear', { summe: signedEuro(diff.singleEffectsSum), abstand: formatEuro(Math.abs(diff.singleEffectsSum - total)), gesamt: signedEuro(total) })}
            </Text>
          ) : null}

          <View style={s.rows}>
            {own.map((d) => (
              <DeviationRow key={d.position} row={d} lesson={lessons.find((l) => l.position === d.position) ?? null} maskYear={maskYear} testID={testID} />
            ))}
          </View>

          <Pressable accessibilityRole="button" aria-expanded={formOpen} onPress={() => setFormOpen((v) => !v)} style={s.more} testID={`${testID}-formular`}>
            <Text style={s.moreText}>
              {formOpen
                ? tr('verlauf.abgleich.formularZu')
                : diff.counts.same > 0
                  ? tr('verlauf.abgleich.weitere', { count: diff.counts.same })
                  : tr('verlauf.abgleich.alleAnsehen')}
            </Text>
          </Pressable>
          {formOpen ? (
            <View style={s.form} testID={`${testID}-formularansicht`}>
              {footnote !== '' ? <Text style={[s.foot, s.formQuote]}>{footnote}</Text> : null}
              {diff.generalExplanations.map((text) => (
                <Text key={text} style={[s.quote, s.formQuote]}>{`„${text}“`}</Text>
              ))}
              {diff.groups.map((g) => (
                <View key={g.group}>
                  <Text style={s.group}>{tr(`verlauf.abgleich.gruppe.${g.group}`)}</Text>
                  {g.rows.map((r) => (
                    <FormRow key={r.position} row={r} label={label(r.position, r.label)} totalTone={toneOf(total)} />
                  ))}
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  )
}

/** The muted line under a row: the short reason, and whether the next year declared more again. */
function reasonParts(row: AssessmentOwnDeviationDto, lesson: AssessmentLessonDto | null, tr: TFunction): { readonly reason: string | null; readonly again: string | null } {
  const repeat = lesson ? nextYearRepeat(row.position, lesson.nextYear) : null
  const again =
    repeat === null
      ? null
      : 'days' in repeat
        ? tr('verlauf.abgleich.wiederTage', { jahr: repeat.year, tage: formatNumber(repeat.days) })
        : tr('verlauf.abgleich.wiederBetrag', { jahr: repeat.year, betrag: formatEuro(repeat.amount) })
  return { reason: row.shortReason, again }
}

/** A change as one line, like a diff: sign, position, effect on the refund. The values, the reason and the lesson open on a tap. */
function DeviationRow({ row, lesson, maskYear, testID }: { readonly row: AssessmentOwnDeviationDto; readonly lesson: AssessmentLessonDto | null; readonly maskYear: number | null; readonly testID: string }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const label = usePositionLabel()
  const [open, setOpen] = useState(false)
  const effect = row.refundEffect
  const tone = toneOf(effect)
  const name = label(row.position, row.label)
  const { reason, again } = reasonParts(row, lesson, tr)
  const maskName = lesson?.mask ? tr(`verlauf.maske.${lesson.mask.field}`, { defaultValue: lesson.mask.label }) : null
  const hint = lesson?.hint ? tr(`verlauf.lehre.hinweis.${row.position.replace(/[AB]$/, '')}`, { defaultValue: lesson.hint }) : null
  const values = tr('verlauf.abgleich.werte', { erklaert: row.declared === null ? '–' : formatNumber(row.declared), festgesetzt: row.assessed === null ? '–' : formatNumber(row.assessed) })
  const a11y = [
    tr('verlauf.abgleich.zeileA11y', {
      position: name,
      erklaert: row.declared === null ? '–' : formatEuro(row.declared),
      festgesetzt: row.assessed === null ? '–' : formatEuro(row.assessed),
      wirkung: effect === null ? tr('verlauf.abgleich.wirkungUnbekannt') : signedEuro(effect),
    }),
    reason,
    again,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <View style={s.row} testID={`${testID}-zeile-${row.position}`}>
      <Pressable accessibilityRole="button" accessibilityLabel={a11y} aria-expanded={open} onPress={() => setOpen((v) => !v)} style={s.rowPress}>
        <Text style={[s.sign, toneText(s, tone)]}>{tone === 'bad' ? '−' : tone === 'good' ? '+' : '±'}</Text>
        <Text style={s.pos} numberOfLines={open ? undefined : 1}>
          {name}
          {again !== null && !open ? <Text style={s.warnGlyph}>{' ⚠'}</Text> : null}
        </Text>
        <Text style={[s.effect, toneText(s, tone)]}>{effect === null ? '–' : formatEuro(Math.abs(effect))}</Text>
      </Pressable>
      {open ? (
        <View style={s.detail} testID={`${testID}-detail-${row.position}`}>
          <Text style={s.reason}>{[values, reason].filter(Boolean).join(' · ')}</Text>
          {again !== null ? (
            <Text style={s.reason}>
              <Text style={s.warnGlyph}>⚠ </Text>
              {again}
            </Text>
          ) : null}
          {row.explanation !== null ? <Text style={s.quote}>{`„${row.explanation}“`}</Text> : null}
          {hint !== null ? <Text style={s.body}>{hint}</Text> : null}
          {maskName !== null ? (
            <Text style={s.muted}>{maskYear === null ? tr('verlauf.lehre.maskeNaechstes', { maske: maskName }) : tr('verlauf.lehre.maske', { jahr: maskYear, maske: maskName })}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function FormRow({ row, label, totalTone }: { readonly row: AssessmentDiffRowDto; readonly label: string; readonly totalTone: Tone }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  if (row.status === 'same' || row.status === 'not_read') {
    const value = row.status === 'same' ? (row.assessed === null ? '–' : formatEuro(row.assessed)) : `${row.declared === null ? '–' : formatEuro(row.declared)} · ${tr('verlauf.abgleich.nichtGelesen')}`
    return (
      <View style={s.formRow}>
        <Text style={[s.pos, s.mutedText]}>{label}</Text>
        <Text style={[s.values, s.mutedText]}>{value}</Text>
      </View>
    )
  }
  return (
    <View style={[s.formRow, row.role === 'followOn' ? (totalTone === 'bad' ? s.rowBad : totalTone === 'good' ? s.rowGood : null) : null]}>
      <Text style={s.pos}>
        {label}
        {row.role === 'followOn' ? <Text style={s.followTag}>{` ${tr('verlauf.abgleich.folge')}`}</Text> : null}
      </Text>
      <Text style={s.values}>
        <Text style={s.struck}>{row.declared === null ? tr('verlauf.abgleich.nichtErklaert') : formatNumber(row.declared)}</Text>
        {` → ${row.assessed === null ? '–' : formatEuro(row.assessed)}`}
      </Text>
    </View>
  )
}

/** „Einspruch · 19 Tage“ while the Einspruchsfrist runs (into the Einspruch when it can), muted once it passed. */
function DeadlineChip({ deadline, onPrepareAppeal, testID }: { readonly deadline: AppealDeadlineDto; readonly onPrepareAppeal?: (() => void) | undefined; readonly testID: string }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const datum = germanDate(deadline.endsOn)
  if (!deadline.running) {
    return (
      <Text style={[s.chip, s.chipPast]} accessibilityLabel={tr('verlauf.abgleich.fristVorbeiA11y', { datum })} testID={`${testID}-frist-vorbei`}>
        {tr('verlauf.abgleich.fristVorbei')}
      </Text>
    )
  }
  const text = deadline.remainingDays === 0 ? tr('verlauf.abgleich.einspruchHeute') : tr('verlauf.abgleich.einspruch', { count: deadline.remainingDays })
  if (!onPrepareAppeal) {
    return (
      <Text style={[s.chip, s.chipRunning]} accessibilityLabel={tr('verlauf.abgleich.fristA11y', { datum, count: deadline.remainingDays })} testID={`${testID}-frist`}>
        {text}
      </Text>
    )
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('verlauf.abgleich.einspruchA11y', { datum, count: deadline.remainingDays })}
      onPress={onPrepareAppeal}
      style={s.chipPress}
      testID={`${testID}-einspruch`}
    >
      <Text style={[s.chip, s.chipRunning]}>{`${text} ›`}</Text>
    </Pressable>
  )
}

function toneText(s: ReturnType<typeof makeStyles>, tone: Tone): TextStyle | null {
  return tone === 'bad' ? s.textBad : tone === 'good' ? s.textGood : null
}

function makeStyles(t: UiTheme) {
  const card: ViewStyle = {
    backgroundColor: t.color.karte,
    borderWidth: t.space.kontur,
    borderColor: t.color.linie,
    borderRadius: t.radius.m,
    padding: t.space.s4,
    gap: t.space.s3,
    width: '100%',
    maxWidth: FLOW_CONTENT_MAX_WIDTH,
    ...t.shadow.hart,
  }
  const title: TextStyle = { ...t.type.itemTitle, color: t.color.tinte }
  const head: ViewStyle = { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: t.space.s3 }
  const flex: ViewStyle = { flex: 1, minWidth: 0 }
  const figureLine: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s1 }
  const figure: TextStyle = { ...t.type.headline, color: t.color.tinte, fontVariant: ['tabular-nums'] }
  const info: ViewStyle = { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }
  const infoGlyph: TextStyle = { ...t.type.body, color: t.color.kiTinte }
  const muted: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const mutedText: TextStyle = { color: t.color.tinte2 }
  const body: TextStyle = { ...t.type.small, color: t.color.tinte }
  const chipLine: ViewStyle = { flexDirection: 'row' }
  const chipPress: ViewStyle = { minHeight: 44, justifyContent: 'center' }
  const chip: TextStyle = { ...t.type.captionStrong, borderWidth: t.space.kontur, borderRadius: t.radius.pille, paddingHorizontal: t.space.s3, paddingVertical: 6, overflow: 'hidden' }
  const chipRunning: TextStyle = { color: t.color.tinte, backgroundColor: t.color.warnWeich, borderColor: t.color.warn }
  const chipPast: TextStyle = { color: t.color.tinte2, backgroundColor: t.color.grund, borderColor: t.color.linieWeich, alignSelf: 'flex-start' }
  const rows: ViewStyle = { borderTopWidth: 1, borderTopColor: t.color.linieWeich }
  const row: ViewStyle = { borderBottomWidth: 1, borderBottomColor: t.color.linieWeich }
  const rowPress: ViewStyle = { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const sign: TextStyle = { ...t.type.metaLarge, fontWeight: t.weight.schwer, color: t.color.tinte2, width: 14, textAlign: 'center' }
  const pos: TextStyle = { ...t.type.label, color: t.color.tinte, flex: 1, minWidth: 0 }
  const values: TextStyle = { ...t.type.metaLarge, color: t.color.tinte, fontVariant: ['tabular-nums'] }
  const effect: TextStyle = { ...t.type.metaLarge, fontWeight: t.weight.schwer, color: t.color.tinte, minWidth: 64, textAlign: 'right', fontVariant: ['tabular-nums'] }
  const struck: TextStyle = { textDecorationLine: 'line-through', color: t.color.tinte2 }
  const reason: TextStyle = { ...t.type.caption, color: t.color.tinte2 }
  const warnGlyph: TextStyle = { color: t.color.warn }
  const textBad: TextStyle = { color: t.color.fehler }
  const textGood: TextStyle = { color: t.color.ok }
  const detail: ViewStyle = { gap: t.space.s1, paddingBottom: t.space.s3 }
  const quote: TextStyle = { ...t.type.small, fontStyle: 'italic', color: t.color.tinte }
  const more: ViewStyle = { minHeight: 44, justifyContent: 'center' }
  const moreText: TextStyle = { ...t.type.small, color: t.color.kiTinte }
  const form: ViewStyle = { borderWidth: 1, borderColor: t.color.linieWeich, borderRadius: t.radius.s, overflow: 'hidden' }
  const formQuote: TextStyle = { paddingHorizontal: t.space.s3, paddingVertical: t.space.s2 }
  const formRow: ViewStyle = { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: t.space.s2, paddingHorizontal: t.space.s3, paddingVertical: 6 }
  const rowBad: ViewStyle = { backgroundColor: t.color.fehlerWeich }
  const rowGood: ViewStyle = { backgroundColor: t.color.okWeich }
  const followTag: TextStyle = { ...t.type.meta, color: t.color.tinte2 }
  const group: TextStyle = { ...t.type.captionStrong, color: t.color.tinte2, textTransform: 'uppercase', letterSpacing: 0.04 * t.size.xs, backgroundColor: t.color.grund, paddingHorizontal: t.space.s3, paddingVertical: 4, borderTopWidth: 1, borderTopColor: t.color.linieWeich }
  const foot: TextStyle = { ...t.type.caption, color: t.color.tinte2 }
  return {
    card, title, head, flex, figureLine, figure, info, infoGlyph, muted, mutedText, body, chipLine, chipPress, chip, chipRunning, chipPast, rows, row, rowPress, sign,
    pos, values, effect, struck, reason, warnGlyph, textBad, textGood, detail, quote, more, moreText, form, formQuote, formRow, rowBad, rowGood, followTag, group, foot,
  }
}
