import { useEffect, useState } from 'react'
import { Pressable, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ADVISOR_SITUATION_MAX_CHARS } from '@steuereule/core'
import { Button, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'
import { makeSidePanelStyles } from './sidePanelStyles'

export interface SituationProps {
  /** The stored description; empty while nothing was written. */
  readonly text: string
  /** Stores the description; rejects when it could not be stored. */
  readonly onSave: (text: string) => Promise<void>
}

/**
 * "Unsere Situation" (#501): what the household is like and what it plans, in the user's own
 * words. The owl reads it at the start of every conversation, in every tax year. The text is the
 * user's: the owl only suggests additions.
 */
export function Situation({ text, onSave }: SituationProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [draft, setDraft] = useState(text)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')

  // A suggestion taken over elsewhere changes the stored text: show it, unless the user is typing.
  useEffect(() => {
    setDraft(text)
  }, [text])

  const changed = draft.trim() !== text.trim()

  async function save() {
    setState('saving')
    try {
      await onSave(draft)
      setState('saved')
    } catch {
      setState('failed')
    }
  }

  return (
    <View style={styles.wrap} testID="eule-situation">
      <Text style={styles.heading} role="heading" aria-level={2}>
        {tr('advisor.chat.situation.title')}
      </Text>
      <Text style={styles.help}>{tr('advisor.chat.situation.help')}</Text>
      <TextInput
        accessibilityLabel={tr('advisor.chat.situation.inputAria')}
        placeholder={tr('advisor.chat.situation.placeholder')}
        placeholderTextColor={t.color.tinte2}
        value={draft}
        onChangeText={(next) => {
          setDraft(next)
          setState('idle')
        }}
        maxLength={ADVISOR_SITUATION_MAX_CHARS}
        multiline
        style={styles.input}
        testID="eule-situation-input"
      />
      <View style={styles.actions}>
        <Button variant="leise" disabled={!changed || state === 'saving'} onPress={() => void save()} testID="eule-situation-save">
          {tr('advisor.chat.situation.save')}
        </Button>
        {state === 'saved' && !changed ? (
          <Text style={styles.meta} testID="eule-situation-saved">
            {tr('advisor.chat.situation.saved')}
          </Text>
        ) : null}
      </View>
      {state === 'failed' ? (
        <Text style={styles.failed} role="alert" testID="eule-situation-failed">
          {tr('advisor.chat.situation.failed')}
        </Text>
      ) : null}
    </View>
  )
}

export interface SituationSuggestionsProps {
  readonly suggestions: readonly string[]
  /** Adds the sentence to the description; rejects when it could not be stored. */
  readonly onAccept: (text: string) => Promise<void>
}

/** Under an answer: what the owl would add to the description. Nothing is stored without a tap. */
export function SituationSuggestions({ suggestions, onAccept }: SituationSuggestionsProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [taken, setTaken] = useState<ReadonlySet<number>>(new Set())
  const [failedAt, setFailedAt] = useState<number | null>(null)

  async function accept(index: number) {
    setFailedAt(null)
    try {
      await onAccept(suggestions[index]!)
      setTaken((prev) => new Set(prev).add(index))
    } catch {
      setFailedAt(index)
    }
  }

  return (
    <View style={styles.hints} testID="advisor-situation-suggestions">
      {suggestions.map((suggestion, index) => (
        <View key={`${index}-${suggestion}`} style={styles.hint} testID="advisor-situation-suggestion">
          <Text style={styles.hintText}>
            {tr('advisor.chat.situation.suggestion')}: {suggestion}
          </Text>
          {taken.has(index) ? (
            <Text style={styles.meta} testID="advisor-situation-suggestion-taken">
              {tr('advisor.chat.situation.taken')}
            </Text>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => void accept(index)} style={styles.link} testID="advisor-situation-suggestion-accept">
              <Text style={styles.linkText}>{tr('advisor.chat.situation.accept')}</Text>
            </Pressable>
          )}
          {failedAt === index ? (
            <Text style={styles.failed} role="alert" testID="advisor-situation-suggestion-failed">
              {tr('advisor.chat.situation.failed')}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    ...makeSidePanelStyles(t),
    input: {
      minHeight: 120,
      padding: t.space.s3,
      borderRadius: t.radius.m,
      borderWidth: 1,
      borderColor: t.color.linie,
      backgroundColor: t.color.grund,
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte,
      textAlignVertical: 'top',
    } as TextStyle,
    actions: { flexDirection: 'row', alignItems: 'center', gap: t.space.s3 } as ViewStyle,
    hints: { gap: t.space.s2 } as ViewStyle,
    hint: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.s3, padding: t.space.s3, borderRadius: t.radius.m, backgroundColor: t.color.kiWeich } as ViewStyle,
    hintText: { flexShrink: 1, fontFamily: t.font.text, fontSize: t.size.s, color: t.color.kiTinte } as TextStyle,
  }
}
