import { useState } from 'react'
import { ScrollView, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Feld, Option, useTheme, type Breakpoint } from '@steuereule/ui'
import { type EntryQuestionId } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { BackButton } from '../shared/BackButton'
import { makeStyles } from './CrossBorderScreen.styles'

export function ChInterviewStep({
  stepId,
  onAnswer,
  bp,
  onBack,
  partnerName,
}: {
  readonly stepId: EntryQuestionId
  readonly onAnswer: (id: EntryQuestionId, value: string) => void
  readonly bp: Breakpoint
  readonly onBack: () => void
  readonly partnerName?: string
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)

  const topic = stepId === 'ch-wohnsitz' ? 'wohnsitz' : 'tage'
  // For Person B the question names B instead of „du“ (Echtdatentest 18.11.2026).
  const title = partnerName === undefined ? topic : `${topic}Partner`

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        <BackButton accessibilityLabel={tr('grenzgaenger.back')} onPress={onBack} />
      </View>
      <Text style={styles.heading} testID="ch-interview-titel">
        {tr(`grenzgaenger.interview.${title}.titleBefore`, { name: partnerName })}
        <Text style={styles.mark}>{tr(`grenzgaenger.interview.${title}.titleMark`, { name: partnerName })}</Text>
        {tr(`grenzgaenger.interview.${title}.titleAfter`, { name: partnerName })}
      </Text>
      {partnerName !== undefined ? <Text style={styles.help} testID="ch-partner-hinweis">{tr('grenzgaenger.partnerFor', { name: partnerName })}</Text> : null}
      <Text style={styles.help}>{tr(`grenzgaenger.interview.${topic}.help`)}</Text>
      {stepId === 'ch-wohnsitz' ? (
        <>
          <Option onPress={() => onAnswer('ch-wohnsitz', 'Deutschland')} testID="ch-wohnsitz-deutschland">{tr('grenzgaenger.interview.wohnsitz.deutschland')}</Option>
          <Option onPress={() => onAnswer('ch-wohnsitz', 'Schweiz')} testID="ch-wohnsitz-schweiz">{tr('grenzgaenger.interview.wohnsitz.schweiz')}</Option>
        </>
      ) : (
        <DaysInput onAnswer={onAnswer} />
      )}
    </ScrollView>
  )
}

function DaysInput({ onAnswer }: { readonly onAnswer: (id: EntryQuestionId, value: string) => void }) {
  const { t: tr } = useTranslation(APP_NS)
  const [text, setText] = useState('')
  const valid = /^(0|[1-9]\d*)$/.test(text) && Number(text) <= 365
  return (
    <View>
      <Feld label={tr('grenzgaenger.interview.tage.label')}>
        <Input
          type="numeric"
          value={text}
          onChange={setText}
          placeholder={tr('grenzgaenger.interview.tage.placeholder')}
          accessibilityLabel={tr('grenzgaenger.interview.tage.label')}
          onSubmit={() => {
            if (valid) onAnswer('ch-nichtrueckkehrtage', text)
          }}
          testID="ch-tage-input"
        />
      </Feld>
      <Button disabled={!valid} onPress={() => onAnswer('ch-nichtrueckkehrtage', text)} testID="ch-tage-weiter">
        {tr('grenzgaenger.weiter')}
      </Button>
    </View>
  )
}
