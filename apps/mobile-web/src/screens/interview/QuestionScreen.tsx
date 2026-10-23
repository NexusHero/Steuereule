// The Minimal-Gate's question screen — one question (job | ausland | kinder), its option list,
// and the step header. The option *values* stay the German domain vocabulary the graph persists;
// only the *labels* are translated (see InterviewScreen.tsx's header for the value/label split).
import { ScrollView, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Option, useTheme, type Breakpoint } from '@steuereule/ui'
import {
  JOB_VALUES,
  AUSLAND_VALUES,
  KINDER_VALUES,
  QUESTION_ORDER,
  type QuestionId,
} from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { makeInterviewStyles } from './styles'
import { PostErrorNotice, type PostErrorKind } from './PostErrorNotice'
import { StepIndicator } from '../shared/StepIndicator'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

interface OptionSpec<V extends string> {
  readonly value: V
  readonly labelKey: string
}

const JOB_OPTIONS: ReadonlyArray<OptionSpec<(typeof JOB_VALUES)[number]>> = [
  { value: 'Angestellt', labelKey: 'interview.job.options.angestellt' },
  { value: 'Selbstständig', labelKey: 'interview.job.options.selbststaendig' },
  { value: 'Beides', labelKey: 'interview.job.options.beides' },
  { value: 'Rente', labelKey: 'interview.job.options.rente' },
]
const AUSLAND_OPTIONS: ReadonlyArray<OptionSpec<(typeof AUSLAND_VALUES)[number]>> = [
  { value: 'Ja, in die Schweiz', labelKey: 'interview.ausland.options.schweiz' },
  { value: 'In ein anderes Land', labelKey: 'interview.ausland.options.andereLand' },
  { value: 'Nein', labelKey: 'interview.ausland.options.nein' },
]
const KINDER_OPTIONS: ReadonlyArray<OptionSpec<(typeof KINDER_VALUES)[number]>> = [
  { value: 'Nein', labelKey: 'interview.kinder.options.nein' },
  { value: '1 Kind', labelKey: 'interview.kinder.options.einKind' },
  { value: '2 oder mehr', labelKey: 'interview.kinder.options.mehrere' },
]

const QUESTION_COPY: Record<QuestionId, { readonly titleKey: string; readonly helpKey: string; readonly options: ReadonlyArray<OptionSpec<string>> }> = {
  job: { titleKey: 'interview.job', helpKey: 'interview.job.help', options: JOB_OPTIONS },
  ausland: { titleKey: 'interview.ausland', helpKey: 'interview.ausland.help', options: AUSLAND_OPTIONS },
  kinder: { titleKey: 'interview.kinder', helpKey: 'interview.kinder.help', options: KINDER_OPTIONS },
}

interface QuestionScreenProps {
  readonly questionId: QuestionId
  readonly canGoBack: boolean
  readonly onAnswer: (value: string) => void
  readonly onBack: () => void
  readonly bp: Breakpoint
  readonly notice: PostErrorKind | null
}

export function QuestionScreen({ questionId, canGoBack, onAnswer, onBack, bp, notice }: QuestionScreenProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeInterviewStyles(t)
  const copy = QUESTION_COPY[questionId]
  const stepIndex = QUESTION_ORDER.indexOf(questionId)

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {canGoBack ? (
          <BackButton accessibilityLabel={tr('onboarding.back')} onPress={onBack} />
        ) : (
          <BackButtonSpacer />
        )}
        <StepIndicator step={stepIndex} total={QUESTION_ORDER.length} />
        <View style={styles.stepPill}>
          <Text style={styles.stepPillText}>{`${stepIndex + 1}/${QUESTION_ORDER.length}`}</Text>
        </View>
      </View>

      <PostErrorNotice kind={notice} />

      <Text style={styles.heading}>
        {tr(`${copy.titleKey}.titleBefore`)}
        <Text style={styles.mark}>{tr(`${copy.titleKey}.titleMark`)}</Text>
        {tr(`${copy.titleKey}.titleAfter`)}
      </Text>
      <Text style={styles.help}>{tr(copy.helpKey)}</Text>

      {copy.options.map((opt) => (
        <Option key={opt.value} onPress={() => onAnswer(opt.value)}>
          {tr(opt.labelKey)}
        </Option>
      ))}
    </ScrollView>
  )
}
