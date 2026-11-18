import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { useYearHistoryControllerGet, type AssessmentLessonDto } from '@steuereule/api-client'
import { formatEuro, formatNumber } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { usePositionLabel } from './positionLabels'

export interface MaskLessonHintProps {
  /** The year whose mask this is: lessons show only in the open year the Verlauf names. */
  readonly taxYear: number
  readonly screen: 'commute' | 'interview'
  readonly field: string
  /** Whose mask (a joint household's partner mask shows the partner's lesson). */
  readonly person?: 'A' | 'B' | undefined
  readonly enabled?: boolean | undefined
}

/** Homeoffice days are read from the lump sum (6 € a day since 2023, 5 € before). */
function daysOf(euros: number, year: number): number {
  return Math.round(euros / (year >= 2023 ? 6 : 5))
}

/**
 * A lesson from last year's Bescheid at the mask it concerns (ADR-0098 §8, „Fürs nächste Mal“): what the
 * Finanzamt recognised and the catalogue's hint. No amount for a Bescheid that is still pending.
 */
export function MaskLessonHint({ taxYear, screen, field, person, enabled = true }: MaskLessonHintProps) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const label = usePositionLabel()
  const query = useYearHistoryControllerGet({ query: { enabled, staleTime: 5 * 60_000, retry: false } })
  const data = query.data?.status === 200 ? query.data.data.maskLessons : null
  if (!data || data.year !== taxYear) return null
  const lesson = data.lessons.find((l) => l.mask?.screen === screen && l.mask.field === field && (person === undefined || l.person === null || l.person === person))
  if (!lesson) return null
  return (
    <View style={s.box} accessibilityRole="text" testID={`maske-lehre-${field}`}>
      <Text style={s.label}>{tr('verlauf.maskenHinweis.label', { jahr: data.fromYear })}</Text>
      <Text style={s.text}>
        {recognisedText(lesson, data.fromYear, label, tr)}
        {lesson.hint ? ` ${tr('verlauf.maskenHinweis.tipp', { hinweis: tr(`verlauf.lehre.hinweis.${lesson.position.replace(/[AB]$/, '')}`, { defaultValue: lesson.hint }) })}` : ''}
      </Text>
    </View>
  )
}

function recognisedText(lesson: AssessmentLessonDto, fromYear: number, label: (p: string, f: string) => string, tr: ReturnType<typeof useTranslation>['t']): string {
  const { declared, assessed } = lesson.recognised
  if (lesson.position.startsWith('homeoffice')) {
    return tr('verlauf.maskenHinweis.homeofficeTage', { jahr: fromYear, anerkannt: formatNumber(daysOf(assessed, fromYear)), erklaert: formatNumber(daysOf(declared, fromYear)) })
  }
  return tr('verlauf.maskenHinweis.allgemein', { jahr: fromYear, position: label(lesson.position, lesson.label), anerkannt: formatEuro(assessed), erklaert: formatEuro(declared) })
}

function makeStyles(t: UiTheme) {
  const box: ViewStyle = { backgroundColor: t.color.funkeWeich, borderWidth: 1, borderColor: t.color.linie, borderRadius: t.radius.s, paddingHorizontal: t.space.s3, paddingVertical: t.space.s2, gap: 2, marginTop: t.space.s1 }
  const label: TextStyle = { ...t.type.meta, color: t.color.funkeTinte, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs }
  const text: TextStyle = { ...t.type.small, color: t.color.tinte }
  return { box, label, text }
}
