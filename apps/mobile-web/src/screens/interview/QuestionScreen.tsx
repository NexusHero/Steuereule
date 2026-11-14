import { useState } from 'react'
import { ScrollView, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Chip, Option, useTheme, type Breakpoint } from '@steuereule/ui'
import {
  JOB_VALUES,
  FOREIGN_VALUES,
  MARITAL_STATUS_VALUES,
  KINDER_VALUES,
  PARTNER_JOB_VALUES,
  PARTNER_FOREIGN_VALUES,
  QUESTION_ORDER,
  type QuestionId,
} from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { SELECTABLE_TAX_YEARS, isRunningTaxYear } from '../../config/taxYear'
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
const FOREIGN_OPTIONS: ReadonlyArray<OptionSpec<(typeof FOREIGN_VALUES)[number]>> = [
  { value: 'Ja, in die Schweiz', labelKey: 'interview.ausland.options.schweiz' },
  { value: 'In ein anderes Land', labelKey: 'interview.ausland.options.andereLand' },
  { value: 'Nein', labelKey: 'interview.ausland.options.nein' },
]
const KINDER_OPTIONS: ReadonlyArray<OptionSpec<(typeof KINDER_VALUES)[number]>> = [
  { value: 'Nein', labelKey: 'interview.kinder.options.nein' },
  { value: '1 Kind', labelKey: 'interview.kinder.options.einKind' },
  { value: '2 oder mehr', labelKey: 'interview.kinder.options.mehrere' },
]
const MARITAL_STATUS_OPTIONS: ReadonlyArray<OptionSpec<(typeof MARITAL_STATUS_VALUES)[number]>> = [
  { value: 'Ledig', labelKey: 'interview.familienstand.options.ledig' },
  { value: 'Verheiratet', labelKey: 'interview.familienstand.options.verheiratet' },
  { value: 'Geschieden oder getrennt', labelKey: 'interview.familienstand.options.geschieden' },
  { value: 'Verwitwet', labelKey: 'interview.familienstand.options.verwitwet' },
]

const PARTNER_JOB_OPTIONS: ReadonlyArray<OptionSpec<(typeof PARTNER_JOB_VALUES)[number]>> = [
  { value: 'Angestellt', labelKey: 'interview.partnerJob.options.angestellt' },
  { value: 'Rente', labelKey: 'interview.partnerJob.options.rente' },
  { value: 'Nicht berufstätig', labelKey: 'interview.partnerJob.options.keine' },
]
const PARTNER_FOREIGN_OPTIONS: ReadonlyArray<OptionSpec<(typeof PARTNER_FOREIGN_VALUES)[number]>> = [
  { value: 'Ja, in die Schweiz', labelKey: 'interview.partnerAusland.options.schweiz' },
  { value: 'Nein', labelKey: 'interview.partnerAusland.options.nein' },
]

const QUESTION_COPY: Record<QuestionId, { readonly titleKey: string; readonly helpKey: string; readonly options: ReadonlyArray<OptionSpec<string>> }> = {
  job: { titleKey: 'interview.job', helpKey: 'interview.job.help', options: JOB_OPTIONS },
  ausland: { titleKey: 'interview.ausland', helpKey: 'interview.ausland.help', options: FOREIGN_OPTIONS },
  kinder: { titleKey: 'interview.kinder', helpKey: 'interview.kinder.help', options: KINDER_OPTIONS },
  familienstand: { titleKey: 'interview.familienstand', helpKey: 'interview.familienstand.help', options: MARITAL_STATUS_OPTIONS },
  'partner-job': { titleKey: 'interview.partnerJob', helpKey: 'interview.partnerJob.help', options: PARTNER_JOB_OPTIONS },
  'partner-ausland': { titleKey: 'interview.partnerAusland', helpKey: 'interview.partnerAusland.help', options: PARTNER_FOREIGN_OPTIONS },
}

interface QuestionScreenProps {
  readonly questionId: QuestionId
  readonly canGoBack: boolean
  readonly onAnswer: (value: string) => void
  readonly onBack: () => void
  readonly bp: Breakpoint
  readonly notice: PostErrorKind | null
  readonly taxYear: number
  /** K2: lets the user switch the tax year from the first question; absent → no switch. */
  readonly onChangeYear?: (year: number) => void
}

export function QuestionScreen({ questionId, canGoBack, onAnswer, onBack, bp, notice, taxYear, onChangeYear }: QuestionScreenProps) {
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
        {tr(`${copy.titleKey}.titleAfter`, { taxYear })}
      </Text>
      <Text style={styles.help}>{tr(copy.helpKey)}</Text>
      {questionId === 'job' && onChangeYear ? <YearSwitch taxYear={taxYear} onChangeYear={onChangeYear} /> : null}

      {copy.options.map((opt) => (
        <Option key={opt.value} onPress={() => onAnswer(opt.value)} testID={`interview-option-${questionId}-${opt.value}`}>
          {tr(opt.labelKey)}
        </Option>
      ))}
    </ScrollView>
  )
}

/** K2: a quiet "Anderes Jahr" link under the first question that unfolds the other selectable years. */
function YearSwitch({ taxYear, onChangeYear }: { readonly taxYear: number; readonly onChangeYear: (year: number) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <View style={{ alignSelf: 'flex-start', marginBottom: t.space.s3 }}>
        <Button variant="ghost" onPress={() => setOpen(true)} testID="interview-anderes-jahr">
          {tr('interview.anderesJahr')}
        </Button>
      </View>
    )
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, marginBottom: t.space.s3 }} accessibilityLabel={tr('cockpit.jahrAuswahl')}>
      {SELECTABLE_TAX_YEARS.filter((year) => year !== taxYear).map((year) => (
        <Chip key={year} active={false} onPress={() => onChangeYear(year)} testID={`interview-jahr-${year}`}>
          {isRunningTaxYear(year) ? tr('cockpit.jahrLaeuft', { jahr: year }) : String(year)}
        </Chip>
      ))}
    </View>
  )
}
