import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { roundAnswersToMessage, type AdvisorQuestionRound, type AdvisorRoundQuestion } from '@steuereule/core'
import { Button, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'

export interface QuestionRoundProps {
  readonly round: AdvisorQuestionRound
  /** Called with the answers as one message: "1: Ja" per line, "1: A, B" for several. */
  readonly onSubmit: (message: string) => void
  /** False once the conversation has moved on: the round is history then. */
  readonly open: boolean
}

/** The owl's pick counts only on a decision; a recommended fact would be claimed with one tap. */
function recommendationOf(question: AdvisorRoundQuestion): string | undefined {
  return question.kind === 'decision' ? question.recommended : undefined
}

/**
 * One round of the Berater-Interview (#495): a few questions, each with answers to tap. A fact is
 * asked without a recommendation; a decision shows the owl's pick and why. Where several answers
 * can apply, more than one can be ticked. The answers go out as one ordinary message, so nothing
 * about the conversation or its drafts is special.
 */
export function QuestionRound({ round, onSubmit, open }: QuestionRoundProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [picked, setPicked] = useState<readonly (readonly string[])[]>(() => round.questions.map(() => []))
  const complete = picked.every((p) => p.length > 0)
  const hasRecommendation = round.questions.some((q) => recommendationOf(q) !== undefined)

  const toggle = (qi: number, option: string, multiple: boolean) =>
    setPicked((prev) =>
      prev.map((p, i) => {
        if (i !== qi) return p
        if (!multiple) return [option]
        return p.includes(option) ? p.filter((o) => o !== option) : [...p, option]
      }),
    )

  return (
    <View style={styles.box} testID="advisor-question-round">
      {round.questions.map((question, qi) => {
        const multiple = question.multiple === true
        const recommended = recommendationOf(question)
        return (
          <View key={`${qi}-${question.text}`} style={styles.question} testID="advisor-question">
            <Text style={styles.text}>{`${qi + 1}. ${question.text}`}</Text>
            {multiple ? <Text style={styles.hint}>{tr('advisor.chat.round.multiple')}</Text> : null}
            <View style={styles.options}>
              {question.options.map((option) => {
                const selected = picked[qi]!.includes(option)
                return (
                  <Pressable
                    key={option}
                    accessibilityRole={multiple ? 'checkbox' : 'radio'}
                    accessibilityState={{ checked: selected, disabled: !open }}
                    aria-checked={selected}
                    disabled={!open}
                    onPress={() => toggle(qi, option, multiple)}
                    style={[styles.option, selected && styles.optionOn]}
                    testID="advisor-question-option"
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextOn]}>{multiple ? `${selected ? '☑' : '☐'} ${option}` : option}</Text>
                    {recommended === option ? <Text style={styles.recommended}>{tr('advisor.chat.round.recommended')}</Text> : null}
                  </Pressable>
                )
              })}
            </View>
            {recommended !== undefined && question.reason ? (
              <Text style={styles.hint} testID="advisor-question-reason">{question.reason}</Text>
            ) : null}
          </View>
        )
      })}
      {open ? (
        <View style={styles.actions}>
          {hasRecommendation ? (
            <Button
              variant="leise"
              onPress={() => setPicked((prev) => round.questions.map((q, i) => { const pick = recommendationOf(q); return pick !== undefined ? [pick] : prev[i]! }))}
              testID="advisor-question-take-recommended"
            >
              {tr('advisor.chat.round.takeRecommended')}
            </Button>
          ) : null}
          <Button onPress={() => onSubmit(roundAnswersToMessage(round, picked))} disabled={!complete} testID="advisor-question-submit">
            {tr('advisor.chat.round.submit')}
          </Button>
        </View>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    box: { gap: t.space.s3, padding: t.space.s3, borderRadius: t.radius.m, borderWidth: 1, borderColor: t.color.ki, backgroundColor: t.color.kiWeich } as ViewStyle,
    question: { gap: t.space.s2 } as ViewStyle,
    text: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.m, color: t.color.tinte } as TextStyle,
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 } as ViewStyle,
    // A long answer wraps inside the round instead of running past its edge on a phone.
    option: { minHeight: 44, maxWidth: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: t.space.s2, paddingVertical: 6, paddingHorizontal: t.space.s3, borderRadius: t.radius.m, borderWidth: 1, borderColor: t.color.linie, backgroundColor: t.color.karte } as ViewStyle,
    optionOn: { borderColor: t.color.ki, backgroundColor: t.color.ki } as ViewStyle,
    optionText: { flexShrink: 1, fontFamily: t.font.text, fontSize: t.size.m, color: t.color.tinte } as TextStyle,
    optionTextOn: { color: t.color.karte, fontWeight: t.weight.fett } as TextStyle,
    recommended: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.kiTinte } as TextStyle,
    hint: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.kiTinte } as TextStyle,
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 } as ViewStyle,
  }
}
