import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { AdvisorQuestionRound } from '@steuereule/core'
import { Button, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'

export interface QuestionRoundProps {
  readonly round: AdvisorQuestionRound
  /** Called with the answers as one message: "1: Ja" per line. */
  readonly onSubmit: (message: string) => void
  /** False once the conversation has moved on: the round is history then. */
  readonly open: boolean
}

/** The message a round turns into: one line per question, the number and the chosen answer. */
export function answersToMessage(round: AdvisorQuestionRound, picked: readonly (string | null)[]): string {
  return round.questions.map((_, i) => `${i + 1}: ${picked[i] ?? '—'}`).join('\n')
}

/**
 * One round of the Berater-Interview (#495): a few questions, each with answers to tap and the
 * owl's own pick marked. The answers go out as one ordinary message, so nothing about the
 * conversation or its drafts is special.
 */
export function QuestionRound({ round, onSubmit, open }: QuestionRoundProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [picked, setPicked] = useState<readonly (string | null)[]>(() => round.questions.map(() => null))
  const complete = picked.every((p) => p !== null)

  return (
    <View style={styles.box} testID="advisor-question-round">
      {round.questions.map((question, qi) => (
        <View key={`${qi}-${question.text}`} style={styles.question} testID="advisor-question">
          <Text style={styles.text}>{`${qi + 1}. ${question.text}`}</Text>
          <View style={styles.options}>
            {question.options.map((option) => {
              const selected = picked[qi] === option
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: !open }}
                  aria-checked={selected}
                  disabled={!open}
                  onPress={() => setPicked((prev) => prev.map((p, i) => (i === qi ? option : p)))}
                  style={[styles.option, selected && styles.optionOn]}
                  testID="advisor-question-option"
                >
                  <Text style={[styles.optionText, selected && styles.optionTextOn]}>{option}</Text>
                  {question.recommended === option ? <Text style={styles.recommended}>{tr('advisor.chat.round.recommended')}</Text> : null}
                </Pressable>
              )
            })}
          </View>
        </View>
      ))}
      {open ? (
        <View style={styles.actions}>
          <Button
            variant="leise"
            onPress={() => setPicked(round.questions.map((q) => q.recommended ?? null))}
            disabled={round.questions.every((q) => q.recommended === undefined)}
            testID="advisor-question-take-recommended"
          >
            {tr('advisor.chat.round.takeRecommended')}
          </Button>
          <Button onPress={() => onSubmit(answersToMessage(round, picked))} disabled={!complete} testID="advisor-question-submit">
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
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 } as ViewStyle,
  }
}
