import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { ADVISOR_SKILL_COMMANDS } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { ChatComposer } from './chat/ChatComposer'
import { ContextRing } from './chat/ContextRing'
import { SkillsMenu } from './chat/SkillsMenu'
import { TurboToggle } from './chat/TurboToggle'
import { MaxToggle, ModelPicker } from './chat/ModelControls'
import { DictationBar } from './chat/DictationBar'
import { ChatIcon } from '../../icons/ChatIcon'
import type { makeStyles } from './AdvisorChatPanel.styles'
import type { AdvisorChatLiveStream, AdvisorChatModel, AdvisorChatPanelProps, AdvisorChatReceipts } from './AdvisorChat.types'
import type { AdvisorChatState } from './useAdvisorChat'
import { NARROW_COMPOSER_WIDTH, appendTranscript, slashCommandList } from './AdvisorChatHelpers'

type AdvisorChatComposerProps = Pick<AdvisorChatPanelProps, 'situationChip' | 'context' | 'onSummarize' | 'onOpenConversation'> & {
  readonly chat: AdvisorChatState
  readonly model: AdvisorChatModel
  readonly stream: Pick<AdvisorChatLiveStream, 'isSending' | 'onStop'>
  readonly receipts: Pick<AdvisorChatReceipts, 'onAttachReceipt' | 'onAttachReceiptFile'>
  readonly compact: boolean
  readonly dictationEngine: NonNullable<AdvisorChatPanelProps['dictationEngine']>
  readonly styles: ReturnType<typeof makeStyles>
}

/** The input with its edit banner, slash menu, switches, attach button, context ring and microphone. */
export function AdvisorChatComposer({
  chat,
  model: { models, chatModel, onPickModel },
  stream: { isSending, onStop },
  receipts: { onAttachReceipt, onAttachReceiptFile },
  situationChip,
  context,
  onSummarize,
  onOpenConversation,
  compact,
  dictationEngine,
  styles,
}: AdvisorChatComposerProps) {
  const theme = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const {
    inputText,
    setInputText,
    editingId,
    cancelEdit,
    slashCommands,
    runCommand,
    unknownCommand,
    skill,
    setSkill,
    turbo,
    setTurbo,
    chatModelOption,
    maxDepth,
    maxOffered,
    setMaxDepth,
    sendFromComposer,
    composerNarrow,
    setComposerNarrow,
    setReceiptOpen,
    dictationSupported,
  } = chat
  const inputBar = (microphone?: ReactNode) => (
    <View style={styles.composer} onLayout={(event) => setComposerNarrow(event.nativeEvent.layout.width < NARROW_COMPOSER_WIDTH)}>
      {editingId !== null ? (
        <View style={styles.editBanner} testID="advisor-edit-banner">
          <Text style={styles.messageActionText}>{tr('advisor.chat.editing')}</Text>
          <Pressable accessibilityRole="button" onPress={cancelEdit} testID="advisor-edit-cancel">
            <Text style={styles.messageActionText}>{tr('advisor.chat.editCancel')}</Text>
          </Pressable>
        </View>
      ) : null}
      {slashCommands.length > 0 ? (
        <View style={styles.choicesRow} testID="advisor-slash-menu">
          {slashCommands.map((command) => (
            <Pressable key={command} accessibilityRole="button" onPress={() => runCommand(`/${command}`)} style={styles.choicePill} testID="advisor-slash-item">
              <Text style={styles.choicePillText}>{`/${command} · ${tr(`advisor.chat.skills.items.${ADVISOR_SKILL_COMMANDS[command]!}.title`)}`}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {unknownCommand !== null ? (
        <Text style={styles.actionReason} role="alert" testID="advisor-slash-unknown">
          {tr('advisor.chat.skills.unknownCommand', { command: unknownCommand, commands: slashCommandList(ADVISOR_SKILL_COMMANDS) })}
        </Text>
      ) : null}
      {/* The switches sit above the input, not in it: inside they squeezed the text into two clipped lines. */}
      <View style={styles.switchRow} testID="advisor-composer-switches">
        {situationChip ? <View style={styles.situationSlot}>{situationChip}</View> : null}
        <SkillsMenu active={skill} onChange={setSkill} disabled={isSending} />
        <TurboToggle on={turbo} onChange={setTurbo} disabled={isSending} />
        {models && onPickModel ? <ModelPicker models={models} picked={chatModel} onPick={onPickModel} disabled={isSending} /> : null}
        <MaxToggle model={chatModelOption} on={maxDepth && maxOffered} onChange={setMaxDepth} disabled={isSending} />
      </View>
      <ChatComposer
        value={inputText}
        onChangeText={setInputText}
        onSend={sendFromComposer}
        onStop={onStop}
        sending={isSending}
        placeholder={
          compact || composerNarrow
            ? tr('advisor.chat.inputPlaceholderShort')
            : tr('advisor.chat.inputPlaceholder', 'Frag deine Eule (z. B. Fortbildung, Laptop, Spenden, Endprüfung) …')
        }
        inputTestID="advisor-chat-input"
        sendTestID="advisor-chat-send"
        leading={
          onAttachReceipt || onAttachReceiptFile ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('advisor.chat.attachReceiptAria', 'Beleg anhängen')}
              onPress={() => setReceiptOpen((prev) => !prev)}
              style={styles.attachButton}
              testID="advisor-receipt-attach-btn"
            >
              <ChatIcon name="attach" color={theme.color.tinte} />
            </Pressable>
          ) : undefined
        }
        trailing={
          <>
            {context ? <ContextRing context={context} onSummarize={onSummarize} busy={isSending} /> : null}
            {microphone}
            {onOpenConversation ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('advisor.conversation.openAria')}
                accessibilityState={{ disabled: isSending }}
                disabled={isSending}
                onPress={onOpenConversation}
                style={styles.attachButton}
                testID="advisor-conversation-open"
              >
                <ChatIcon name="conversation" color={theme.color.tinte} />
              </Pressable>
            ) : null}
          </>
        }
      />
    </View>
  )
  // With dictation the microphone sits inside the input; its consent and status show above it.
  return dictationSupported ? (
    <DictationBar
      engine={dictationEngine}
      disabled={isSending}
      onTranscript={(text) => setInputText((prev) => appendTranscript(prev, text))}
    >
      {inputBar}
    </DictationBar>
  ) : (
    inputBar()
  )
}
