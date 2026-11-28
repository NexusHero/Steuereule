import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, OwlGlyph, useTheme, type UiTheme } from '@steuereule/ui'
import type { TFunction } from 'i18next'
import type { MaskedSpan } from '@steuereule/core'
import { MaskedNote, MaskedText } from '../chat/MaskedText'
import { APP_NS } from '../../../i18n/resources'
import type { AnswerUpdate, ConversationDeps, ConversationProblem, ConversationState } from '../../../lib/conversation/conversation'
import { useConversation } from './useConversation'
import { VoiceLine } from './VoiceLine'

export interface ConversationModeProps {
  readonly deps: ConversationDeps
  /** The chat's view of the answer to what was said. */
  readonly answer: AnswerUpdate
  /**
   * The user's latest message as the chat holds it, with where the model read something else (ADR-0091). Shown
   * on the caption once it is the same text.
   */
  readonly said?: { readonly text: string; readonly masked?: readonly MaskedSpan[] | null | undefined } | null | undefined
  /** Back to the chat; the conversation is ended first. */
  readonly onClose: () => void
}

function stateText(state: ConversationState, tr: TFunction): string {
  switch (state) {
    case 'starting':
      return tr('advisor.conversation.state.starting')
    case 'listening':
      return tr('advisor.conversation.state.listening')
    case 'hearing':
      return tr('advisor.conversation.state.hearing')
    case 'understanding':
      return tr('advisor.conversation.state.understanding')
    case 'thinking':
      return tr('advisor.conversation.state.thinking')
    case 'speaking':
      return tr('advisor.conversation.state.speaking')
    case 'off':
      return ''
  }
}

function problemText(problem: ConversationProblem, tr: TFunction): string {
  switch (problem) {
    case 'microphone':
      return tr('advisor.conversation.problem.microphone')
    case 'understanding':
      return tr('advisor.conversation.problem.understanding')
    case 'answer':
      return tr('advisor.conversation.problem.answer')
    case 'voice':
      return tr('advisor.conversation.problem.voice')
  }
}

/**
 * Speaking with the owl (ADR-0115): the chat steps back, a line shows who is speaking, and what is said
 * stands under it. Everything said and answered is an ordinary chat message, there when this closes.
 * It starts with a press, which is also where it says what leaves the device.
 */
export function ConversationMode({ deps, answer, said, onClose }: ConversationModeProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const { snapshot, conversation } = useConversation(deps, answer)
  const { state, level, caption, captionBy, problem } = snapshot
  // Only for the very words that stand there: the ranges are positions in that text.
  const masked = captionBy === 'user' && said?.text === caption ? said.masked : undefined
  const close = (): void => {
    conversation.stop()
    onClose()
  }

  if (state === 'off') {
    return (
      <View style={styles.root} testID="eule-gespraech">
        <View style={styles.column}>
          <OwlGlyph size={28} ink={t.color.tinte} ground={t.color.grund} />
          <Text style={styles.title} role="heading" aria-level={2}>
            {tr('advisor.conversation.title')}
          </Text>
          <Text style={styles.notice} testID="eule-gespraech-hinweis">
            {tr('advisor.conversation.notice')}
          </Text>
          {problem ? (
            <Text style={styles.problem} role="alert" testID="eule-gespraech-problem">
              {problemText(problem, tr)}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button variant="tinte" onPress={() => void conversation.start()} testID="eule-gespraech-start">
              {tr('advisor.conversation.start')}
            </Button>
            <Button variant="ghost" onPress={close} testID="eule-gespraech-ende">
              {tr('advisor.conversation.back')}
            </Button>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root} testID="eule-gespraech">
      <View style={styles.column}>
        <OwlGlyph size={28} ink={t.color.tinte} ground={t.color.grund} />
        <VoiceLine state={state} level={level} />
        <Text style={styles.state} aria-live="polite" testID="eule-gespraech-zustand">
          {stateText(state, tr)}
        </Text>
        <View testID="eule-gespraech-text">
          <MaskedText text={caption} spans={masked} style={[styles.caption, captionBy === 'user' && styles.captionUser]} />
        </View>
        <MaskedNote spans={masked} style={styles.notice} conversation />
        {problem ? (
          <Text style={styles.problem} role="alert" testID="eule-gespraech-problem">
            {problemText(problem, tr)}
          </Text>
        ) : null}
        <View style={styles.actions}>
          {state === 'hearing' ? (
            <Button variant="tinte" onPress={conversation.endUtterance} testID="eule-gespraech-fertig">
              {tr('advisor.conversation.done')}
            </Button>
          ) : null}
          {state === 'thinking' || state === 'speaking' ? (
            <Button variant="tinte" onPress={conversation.interrupt} testID="eule-gespraech-unterbrechen">
              {tr('advisor.conversation.interrupt')}
            </Button>
          ) : null}
          <Button variant="ghost" onPress={close} testID="eule-gespraech-ende">
            {tr('advisor.conversation.end')}
          </Button>
        </View>
      </View>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    root: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 5,
      backgroundColor: t.color.grund,
      alignItems: 'center',
      justifyContent: 'center',
      padding: t.space.s4,
    } as ViewStyle,
    column: { width: '100%', maxWidth: 560, alignItems: 'center', gap: t.space.s3 } as ViewStyle,
    title: { ...t.type.bodyStrong, color: t.color.tinte, textAlign: 'center' } as TextStyle,
    notice: { ...t.type.small, color: t.color.tinte2, textAlign: 'center' } as TextStyle,
    state: { ...t.type.bodyStrong, color: t.color.tinte, textAlign: 'center' } as TextStyle,
    // Two lines are kept free, so the buttons do not jump when a caption comes and goes.
    caption: { ...t.type.body, color: t.color.tinte, textAlign: 'center', minHeight: 48 } as TextStyle,
    captionUser: { color: t.color.tinte2 } as TextStyle,
    problem: { ...t.type.small, color: t.color.tinte, textAlign: 'center' } as TextStyle,
    actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: t.space.s2, marginTop: t.space.s2 } as ViewStyle,
  }
}
