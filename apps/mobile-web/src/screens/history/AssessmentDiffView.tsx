import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme, type UiTheme } from '@steuereule/ui'
import type { AppealDeadlineDto, AssessmentDiffDto, AssessmentDiffRowDto, AssessmentLessonDto } from '@steuereule/api-client'
import { formatEuro, formatNumber } from '@steuereule/core'
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
  /** The open year whose masks show the lessons again (the mask pill), when known. */
  readonly maskYear?: number | null | undefined
  /** „Einspruch vorbereiten“: the existing Einspruch flow; without it the button stays away. */
  readonly onPrepareAppeal?: (() => void) | undefined
  readonly onClose?: (() => void) | undefined
  readonly testID?: string | undefined
}

/**
 * Erklärung ↔ Bescheid, line by line (ADR-0098 §8, mock `diffHtml`): first only what the Finanzamt
 * changed, ordered by the effect on the refund and coloured by what it means for the user; the
 * follow-on changes as one chain; the form view collapsed; the Einspruchsfrist beside it; and the
 * lessons for next time. The same view in the Verlauf and in „Bescheid prüfen“.
 */
export function AssessmentDiffView({ diff, deadline, submittedOn, assessmentDate, person = null, lessons = [], maskYear = null, onPrepareAppeal, onClose, testID = 'bescheid-abgleich' }: AssessmentDiffViewProps) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const label = usePositionLabel()
  const [formOpen, setFormOpen] = useState(false)
  const year = diff.year
  const own = [...diff.ownDeviations].sort((a, b) => Math.abs(b.refundEffect ?? 0) - Math.abs(a.refundEffect ?? 0))
  const refundRow = diff.groups.flatMap((g) => g.rows).find((r) => r.position === 'erstattung') ?? null
  const total = diff.totalRefundEffect

  const meta = [
    submittedOn ? tr('verlauf.abgleich.eingereicht', { datum: germanDate(submittedOn) }) : null,
    assessmentDate ? tr('verlauf.abgleich.bescheidVom', { datum: germanDate(assessmentDate) }) : null,
  ].filter((x): x is string => x !== null)

  return (
    <View style={s.card} testID={testID} accessibilityLiveRegion="polite">
      <View style={s.head}>
        <View style={s.flex}>
          <Text style={s.eyebrow}>{tr('verlauf.abgleich.eyebrow')}</Text>
          <Text style={s.title} accessibilityRole="header">
            {person === null ? tr('verlauf.abgleich.titel', { jahr: year }) : tr('verlauf.abgleich.titelPerson', { jahr: year, person: tr(`verlauf.person.${person}`) })}
          </Text>
        </View>
        {onClose ? (
          <Pressable accessibilityRole="button" accessibilityLabel={tr('verlauf.abgleich.schliessen')} onPress={onClose} style={s.close} testID={`${testID}-schliessen`}>
            <Text style={s.closeGlyph}>×</Text>
          </Pressable>
        ) : null}
      </View>
      {meta.length > 0 ? <Text style={s.muted}>{meta.join(' · ')}</Text> : null}

      {diff.counts.deviations === 0 ? (
        <>
          <View style={s.chipRow}>
            <Text style={[s.pill, s.pillOk]}>{tr('verlauf.abgleich.wieErklaert')}</Text>
          </View>
          <Text style={s.muted} testID={`${testID}-gleich`}>
            {tr(diff.filingType === 'einzel' && person !== null ? 'verlauf.abgleich.gleichEinzeln' : 'verlauf.abgleich.gleich', { count: diff.counts.same })}
          </Text>
          {diff.counts.notRead > 0 ? <Text style={s.muted}>{tr('verlauf.abgleich.nichtGelesenHinweis', { count: diff.counts.notRead })}</Text> : null}
          <AppealDeadline deadline={deadline} onPrepareAppeal={onPrepareAppeal} testID={testID} />
        </>
      ) : (
        <>
          <View style={s.chipRow}>
            <Text style={[s.pill, s.pillBad]} testID={`${testID}-anzahl`}>
              {tr('verlauf.abgleich.abweichungen', { count: diff.counts.deviations })}
            </Text>
            {refundRow && refundRow.declared !== null && refundRow.assessed !== null && total !== null ? (
              <Text style={s.pill}>
                {tr('verlauf.abgleich.erstattungChip', { erklaert: formatEuro(refundRow.declared), festgesetzt: formatEuro(refundRow.assessed), differenz: signedEuro(total) })}
              </Text>
            ) : null}
          </View>
          <AppealDeadline deadline={deadline} onPrepareAppeal={onPrepareAppeal} testID={testID} />

          <View style={s.table}>
            <View style={[s.row, s.headerRow]}>
              <Text style={[s.pos, s.headerText]}>{tr('verlauf.abgleich.spalteGeaendert')}</Text>
              <Text style={[s.values, s.headerText]}>{tr('verlauf.abgleich.spalteWerte')}</Text>
              <Text style={[s.effect, s.headerText]}>{tr('verlauf.abgleich.spalteWirkung')}</Text>
            </View>
            {own.map((d) => {
              const effect = d.refundEffect
              const tone = effect === null || effect === 0 ? null : effect < 0 ? 'bad' : 'good'
              return (
                <View key={d.position} testID={`${testID}-zeile-${d.position}`}>
                  <View style={[s.row, tone === 'bad' ? s.rowBad : tone === 'good' ? s.rowGood : null]}>
                    <Text style={s.pos}>{label(d.position, d.label)}</Text>
                    {/* Value and effect wrap as one unit, so every row breaks the same way on a phone. */}
                    <View style={s.valueGroup}>
                    <Text style={s.values}>
                      <Text style={s.struck}>{d.declared === null ? '–' : formatNumber(d.declared)}</Text>
                      {` → ${d.assessed === null ? '–' : formatEuro(d.assessed)}`}
                    </Text>
                    <Text style={[s.effect, s.effectStrong, tone === 'bad' ? s.textBad : tone === 'good' ? s.textGood : null]} accessibilityLabel={effect === null ? tr('verlauf.abgleich.wirkungUnbekannt') : tr('verlauf.abgleich.wirkungA11y', { wert: signedEuro(effect) })}>
                      {effect === null ? '–' : signedEuro(effect)}
                    </Text>
                    </View>
                  </View>
                  {d.explanation ? (
                    <Text style={s.quote}>
                      {tr('verlauf.abgleich.erlaeuterung')} <Text style={s.quoteText}>„{d.explanation}“</Text>
                    </Text>
                  ) : null}
                </View>
              )
            })}
            {diff.generalExplanations.map((text) => (
              <Text key={text} style={s.quote}>
                {tr('verlauf.abgleich.erlaeuterung')} <Text style={s.quoteText}>„{text}“</Text>
              </Text>
            ))}
            {diff.followOnChain.length > 0 ? (
              <View style={s.chain} testID={`${testID}-kette`}>
                <Text style={s.chainText}>
                  <Text style={s.followTag}>{tr('verlauf.abgleich.folge')}</Text>
                  {'  '}
                  {diff.followOnChain.map((link, i) => (
                    <Text key={link.position}>
                      {i > 0 ? ' → ' : ''}
                      <Text style={s.chainLink}>{`${label(link.position, link.label)} ${signedEuro(link.difference)}`}</Text>
                    </Text>
                  ))}
                </Text>
              </View>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: formOpen }} onPress={() => setFormOpen((v) => !v)} style={s.more} testID={`${testID}-formular`}>
              <Text style={s.moreText}>
                {formOpen ? `▾ ${tr('verlauf.abgleich.formularZu')}` : `▸ ${tr('verlauf.abgleich.formularAuf', { count: diff.counts.positions, gleich: diff.counts.same })}`}
              </Text>
            </Pressable>
            {formOpen ? (
              <View testID={`${testID}-formularansicht`}>
                {diff.groups.map((g) => (
                  <View key={g.group}>
                    <Text style={s.group}>{tr(`verlauf.abgleich.gruppe.${g.group}`)}</Text>
                    {g.rows.map((r) => (
                      <FormRow key={r.position} row={r} label={label(r.position, r.label)} totalTone={total === null ? null : total < 0 ? 'bad' : total > 0 ? 'good' : null} />
                    ))}
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {diff.effectsDifferFromTotal && diff.singleEffectsSum !== null && total !== null ? (
            <Text style={s.foot} testID={`${testID}-nichtlinear`}>
              {tr('verlauf.abgleich.nichtLinear', { summe: signedEuro(diff.singleEffectsSum), abstand: formatEuro(Math.abs(diff.singleEffectsSum - total)), gesamt: signedEuro(total) })}
            </Text>
          ) : (
            <Text style={s.foot}>{tr('verlauf.abgleich.wirkungErklaert')}</Text>
          )}

          {lessons.length > 0 ? <Lessons lessons={lessons} year={year} maskYear={maskYear} testID={testID} /> : null}

          {total !== null && total !== 0 ? (
            <View style={s.owl}>
              <Text style={s.owlLabel}>{tr('verlauf.eule.label')}</Text>
              <Text style={s.owlText}>
                {tr(total < 0 ? 'verlauf.abgleich.euleKostet' : 'verlauf.abgleich.euleNuetzt', { count: diff.counts.deviations, betrag: formatEuro(Math.abs(total)) })}
                {own[0] && own[0].refundEffect !== null ? ` ${tr('verlauf.abgleich.euleGroesste', { position: label(own[0].position, own[0].label), wirkung: signedEuro(own[0].refundEffect) })}` : ''}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  )
}

function FormRow({ row, label, totalTone }: { readonly row: AssessmentDiffRowDto; readonly label: string; readonly totalTone: 'bad' | 'good' | null }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const follow = row.role === 'followOn' ? <Text style={s.followTag}>{` ${tr('verlauf.abgleich.folge')}`}</Text> : null
  if (row.status === 'same') {
    return (
      <View style={s.row}>
        <Text style={[s.pos, s.mutedText]}>{label}</Text>
        <Text style={[s.values, s.mutedText]}>{row.assessed === null ? '–' : formatEuro(row.assessed)}</Text>
        <Text style={s.effect} />
      </View>
    )
  }
  if (row.status === 'not_read') {
    return (
      <View style={s.row}>
        <Text style={[s.pos, s.mutedText]}>{label}</Text>
        <Text style={[s.values, s.mutedText]}>{`${row.declared === null ? '–' : formatEuro(row.declared)} · ${tr('verlauf.abgleich.nichtGelesen')}`}</Text>
        <Text style={s.effect} />
      </View>
    )
  }
  return (
    <View style={[s.row, totalTone === 'bad' ? s.rowBad : totalTone === 'good' ? s.rowGood : null]}>
      <Text style={s.pos}>
        {label}
        {follow}
      </Text>
      <Text style={s.values}>
        <Text style={s.struck}>{row.declared === null ? tr('verlauf.abgleich.nichtErklaert') : formatNumber(row.declared)}</Text>
        {` → ${row.assessed === null ? '–' : formatEuro(row.assessed)}`}
      </Text>
      <Text style={s.effect} />
    </View>
  )
}

/** The Einspruchsfrist beside the diff: end, days left and the way into the Einspruch, or only the date once it passed. */
function AppealDeadline({ deadline, onPrepareAppeal, testID }: { readonly deadline: AppealDeadlineDto | null; readonly onPrepareAppeal?: (() => void) | undefined; readonly testID: string }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  if (deadline === null) return null
  if (!deadline.running) {
    return (
      <View style={[s.deadline, s.deadlinePast]} testID={`${testID}-frist-vorbei`}>
        <Text style={s.mutedText}>{tr('verlauf.frist.vorbei', { datum: germanDate(deadline.endsOn) })}</Text>
      </View>
    )
  }
  return (
    <View style={s.deadline} testID={`${testID}-frist`}>
      <Text style={s.deadlineText}>
        <Text style={s.strong}>{tr('verlauf.frist.bis', { datum: germanDate(deadline.endsOn) })}</Text>
        {` · ${tr('verlauf.frist.resttage', { count: deadline.remainingDays })}`}
      </Text>
      {onPrepareAppeal ? (
        <Button onPress={onPrepareAppeal} testID={`${testID}-einspruch`}>
          {tr('verlauf.frist.einspruch')}
        </Button>
      ) : null}
    </View>
  )
}

/** „Fürs nächste Mal“: what was recognised, whether the next year declared it again, and the catalogue's hint. */
function Lessons({ lessons, year, maskYear, testID }: { readonly lessons: readonly AssessmentLessonDto[]; readonly year: number; readonly maskYear: number | null; readonly testID: string }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const label = usePositionLabel()
  return (
    <View style={s.lessons} testID={`${testID}-lehren`}>
      <Text style={s.lessonsTitle} accessibilityRole="header">
        {tr('verlauf.lehre.titel')}
      </Text>
      {lessons.map((l) => (
        <View key={l.position} style={s.lesson}>
          <Text style={s.strong}>{tr('verlauf.lehre.anerkannt', { position: label(l.position, l.label), festgesetzt: formatEuro(l.recognised.assessed), erklaert: formatEuro(l.recognised.declared) })}</Text>
          {l.nextYear ? <Text style={s.body}>{nextYearText(l, year, tr)}</Text> : null}
          {l.hint ? <Text style={s.body}>{tr(`verlauf.lehre.hinweis.${l.position.replace(/[AB]$/, '')}`, { defaultValue: l.hint })}</Text> : null}
          {l.mask ? (
            <Text style={s.lessonPill}>
              {maskYear === null ? tr('verlauf.lehre.maskeNaechstes', { maske: tr(`verlauf.maske.${l.mask.field}`, { defaultValue: l.mask.label }) }) : tr('verlauf.lehre.maske', { jahr: maskYear, maske: tr(`verlauf.maske.${l.mask.field}`, { defaultValue: l.mask.label }) })}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  )
}

function nextYearText(l: AssessmentLessonDto, year: number, tr: ReturnType<typeof useTranslation>['t']): string {
  const next = l.nextYear!
  if (next.declared === null) return tr('verlauf.lehre.folgejahrNicht', { jahr: next.year })
  const key = next.source === 'filed' ? 'verlauf.lehre.folgejahrEingereicht' : 'verlauf.lehre.folgejahrAngaben'
  const again = next.declaredAboveRecognised === true ? ` ${tr('verlauf.lehre.wiederMehr', { jahr: year })}` : ''
  const pending = next.source === 'filed' ? ` ${tr('verlauf.lehre.bescheidAus', { jahr: next.year })}` : ''
  return `${tr(key, { jahr: next.year, betrag: formatEuro(next.declared) })}${again}${pending}`
}

function makeStyles(t: UiTheme) {
  const card: ViewStyle = {
    backgroundColor: t.color.karte,
    borderWidth: t.space.kontur,
    borderColor: t.color.linie,
    borderRadius: t.radius.m,
    padding: t.space.s4,
    gap: t.space.s3,
    ...t.shadow.hart,
  }
  const head: ViewStyle = { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: t.space.s3 }
  const flex: ViewStyle = { flex: 1, minWidth: 0 }
  const eyebrow: TextStyle = { ...t.type.meta, color: t.color.tinte2, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs }
  const title: TextStyle = { ...t.type.subhead, color: t.color.tinte }
  const close: ViewStyle = { width: 36, height: 36, borderRadius: t.radius.pille, borderWidth: t.space.kontur, borderColor: t.color.linie, alignItems: 'center', justifyContent: 'center', backgroundColor: t.color.karte }
  const closeGlyph: TextStyle = { ...t.type.bodyStrong, color: t.color.tinte }
  const muted: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const mutedText: TextStyle = { color: t.color.tinte2 }
  const chipRow: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }
  const pill: TextStyle = { ...t.type.captionStrong, color: t.color.tinte, borderWidth: 1, borderColor: t.color.linie, borderRadius: t.radius.pille, paddingHorizontal: t.space.s2, paddingVertical: 2, overflow: 'hidden' }
  const pillOk: TextStyle = { backgroundColor: t.color.okWeich }
  const pillBad: TextStyle = { backgroundColor: t.color.fehlerWeich }
  const table: ViewStyle = { borderWidth: 1, borderColor: t.color.linieWeich, borderRadius: t.radius.s, overflow: 'hidden' }
  const row: ViewStyle = { flexDirection: 'row', alignItems: 'baseline', gap: t.space.s2, paddingHorizontal: t.space.s3, paddingVertical: 6, flexWrap: 'wrap' }
  const headerRow: ViewStyle = { borderBottomWidth: 1, borderBottomColor: t.color.linieWeich }
  const headerText: TextStyle = { ...t.type.caption, color: t.color.tinte2 }
  const pos: TextStyle = { ...t.type.small, color: t.color.tinte, flexGrow: 1, flexShrink: 1, flexBasis: 140 }
  const values: TextStyle = { ...t.type.metaLarge, color: t.color.tinte, fontVariant: ['tabular-nums'] }
  const valueGroup: ViewStyle = { flexDirection: 'row', alignItems: 'baseline', gap: t.space.s2, marginLeft: 'auto' }
  const effect: TextStyle = { ...t.type.metaLarge, color: t.color.tinte, minWidth: 64, textAlign: 'right', fontVariant: ['tabular-nums'] }
  const effectStrong: TextStyle = { fontWeight: t.weight.schwer }
  const rowBad: ViewStyle = { backgroundColor: t.color.fehlerWeich }
  const rowGood: ViewStyle = { backgroundColor: t.color.okWeich }
  const textBad: TextStyle = { color: t.color.fehler }
  const textGood: TextStyle = { color: t.color.ok }
  const struck: TextStyle = { textDecorationLine: 'line-through', color: t.color.tinte2 }
  const quote: TextStyle = { ...t.type.small, color: t.color.tinte2, paddingHorizontal: t.space.s3, paddingBottom: t.space.s2 }
  const quoteText: TextStyle = { fontStyle: 'italic', color: t.color.tinte }
  const chain: ViewStyle = { paddingHorizontal: t.space.s3, paddingVertical: t.space.s2, borderTopWidth: 1, borderTopColor: t.color.linieWeich }
  const chainText: TextStyle = { ...t.type.caption, color: t.color.tinte2, lineHeight: 20 }
  const chainLink: TextStyle = { ...t.type.captionStrong, color: t.color.tinte }
  const followTag: TextStyle = { ...t.type.meta, color: t.color.tinte2, borderWidth: 1, borderColor: t.color.tinte2, borderRadius: 4, paddingHorizontal: 4 }
  const more: ViewStyle = { borderTopWidth: 1, borderTopColor: t.color.linieWeich, borderStyle: 'dashed', paddingHorizontal: t.space.s3, paddingVertical: t.space.s2, minHeight: 44, justifyContent: 'center' }
  const moreText: TextStyle = { ...t.type.small, color: t.color.kiTinte }
  const group: TextStyle = { ...t.type.captionStrong, color: t.color.tinte2, textTransform: 'uppercase', letterSpacing: 0.04 * t.size.xs, backgroundColor: t.color.grund, paddingHorizontal: t.space.s3, paddingVertical: 4, borderTopWidth: 1, borderTopColor: t.color.linieWeich }
  const foot: TextStyle = { ...t.type.caption, color: t.color.tinte2 }
  const deadline: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: t.space.s2, backgroundColor: t.color.warnWeich, borderWidth: t.space.kontur, borderColor: t.color.warn, borderRadius: t.radius.s, paddingHorizontal: t.space.s3, paddingVertical: t.space.s2 }
  const deadlinePast: ViewStyle = { backgroundColor: t.color.grund, borderColor: t.color.linieWeich }
  const deadlineText: TextStyle = { ...t.type.small, color: t.color.tinte, flexShrink: 1 }
  const strong: TextStyle = { ...t.type.labelStrong, color: t.color.tinte }
  const body: TextStyle = { ...t.type.small, color: t.color.tinte }
  const lessons: ViewStyle = { backgroundColor: t.color.funkeWeich, borderWidth: t.space.kontur, borderColor: t.color.linie, borderRadius: t.radius.s, padding: t.space.s3, gap: t.space.s2 }
  const lessonsTitle: TextStyle = { ...t.type.itemTitle, color: t.color.tinte }
  const lesson: ViewStyle = { gap: 3, borderTopWidth: 1, borderTopColor: t.color.linieWeich, paddingTop: t.space.s2 }
  const lessonPill: TextStyle = { ...pill, alignSelf: 'flex-start', backgroundColor: t.color.karte }
  const owl: ViewStyle = { flexDirection: 'row', gap: t.space.s2, backgroundColor: t.color.kiWeich, borderRadius: t.radius.s, paddingHorizontal: t.space.s3, paddingVertical: t.space.s2 }
  const owlLabel: TextStyle = { ...t.type.meta, color: t.color.kiTinte, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs, paddingTop: 2 }
  const owlText: TextStyle = { ...t.type.small, color: t.color.kiTinte, flex: 1 }
  return {
    card, head, flex, eyebrow, title, close, closeGlyph, muted, mutedText, chipRow, pill, pillOk, pillBad, table, row, headerRow, headerText, pos, values, valueGroup, effect,
    effectStrong, rowBad, rowGood, textBad, textGood, struck, quote, quoteText, chain, chainText, chainLink, followTag, more, moreText, group, foot, deadline,
    deadlinePast, deadlineText, strong, body, lessons, lessonsTitle, lesson, lessonPill, owl, owlLabel, owlText,
  }
}
