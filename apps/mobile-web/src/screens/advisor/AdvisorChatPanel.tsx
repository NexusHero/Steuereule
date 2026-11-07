import { useState } from 'react'
import { Linking, Pressable, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AiChip, Button, Card, useTheme, type UiTheme } from '@steuereule/ui'
import {
  ADVISOR_LEGAL_SOURCES,
  formatEuro,
  type AdvisorActionProposal,
  type AdvisorChatMessageView,
  type AdvisorLegalSource,
  type AdvisorTwoPathsProposal,
  type OwlSourceId,
} from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import type { Tr } from '../shared/tr'

export interface AdvisorChatPanelProps {
  readonly greeting?: string | undefined
  readonly messages: readonly AdvisorChatMessageView[]
  readonly quickChips?: readonly string[] | undefined
  readonly isSending?: boolean | undefined
  readonly onSendMessage: (text: string) => Promise<void> | void
  readonly onApplyAction?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onUndoAction?: ((actionId: string) => Promise<void> | void) | undefined
  readonly compact?: boolean | undefined
}

const SOURCE_TAG_REGEX = /\[(estg-[a-z0-9-]+|ao-355)\]/g

function renderMessageWithLawChips(
  content: string,
  onSelectSource: (source: AdvisorLegalSource) => void,
  styles: ReturnType<typeof makeStyles>,
  tr: Tr,
) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  const rx = new RegExp(SOURCE_TAG_REGEX.source, 'g')
  while ((match = rx.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }
    const sourceId = match[1] as OwlSourceId
    const legalSource = ADVISOR_LEGAL_SOURCES[sourceId]
    if (legalSource) {
      parts.push(
        <Pressable
          key={`${sourceId}-${match.index}`}
          accessibilityRole="button"
          accessibilityLabel={tr('advisor.chat.legalSourceAria', {
            paragraph: legalSource.paragraph,
            defaultValue: `Rechtsquelle ${legalSource.paragraph}`,
          })}
          onPress={() => onSelectSource(legalSource)}
          style={styles.inlineLawChip}
          testID={`law-chip-${sourceId}`}
        >
          <Text style={styles.inlineLawChipText}>{`§ ${legalSource.paragraph.replace(/^§\s*/, '')}`}</Text>
        </Pressable>,
      )
    } else {
      parts.push(match[0])
    }
    lastIndex = rx.lastIndex
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return <Text style={styles.assistantText}>{parts}</Text>
}

function ActionProposalCardView({
  action,
  onApply,
  onUndo,
  onSelectSource,
  styles,
  testIDPrefix = 'advisor-action',
}: {
  readonly action: AdvisorActionProposal
  readonly onApply?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onUndo?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onSelectSource: (source: AdvisorLegalSource) => void
  readonly styles: ReturnType<typeof makeStyles>
  readonly testIDPrefix?: string
}) {
  const { t: tr } = useTranslation(APP_NS)
  const [busy, setBusy] = useState(false)
  const legalSource = ADVISOR_LEGAL_SOURCES[action.sourceId]

  async function handleApply() {
    if (!onApply || busy) return
    setBusy(true)
    try {
      await onApply(action.actionId)
    } finally {
      setBusy(false)
    }
  }

  async function handleUndo() {
    if (!onUndo || busy) return
    setBusy(true)
    try {
      await onUndo(action.actionId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.actionCard} testID={`${testIDPrefix}-card`}>
      <View style={styles.actionHeader}>
        <Text style={styles.actionLabel}>{action.label}</Text>
        {action.deltaEur > 0 ? (
          <Text style={styles.actionDeltaBadge} testID={`${testIDPrefix}-delta`}>
            {tr('advisor.chat.taxEffect', {
              amount: formatEuro(action.deltaEur),
              defaultValue: `+${formatEuro(action.deltaEur)} Steuer-Effekt`,
            })}
          </Text>
        ) : null}
      </View>

      <View style={styles.diffBox}>
        <View style={styles.diffRow}>
          <Text style={styles.diffCaption}>{tr('advisor.chat.entryLabel', 'Eintrag:')}</Text>
          <Text style={styles.diffValues}>
            {`${action.previousValue ?? tr('advisor.chat.notRecorded', 'Nicht erfasst')} → `}
            <Text style={styles.diffNewValue}>{action.newValue}</Text>
          </Text>
        </View>
        <View style={styles.diffRow}>
          <Text style={styles.diffCaption}>{tr('advisor.chat.refundSimulation', 'Erstattung (Simulation):')}</Text>
          <Text style={styles.diffValues}>
            {`${formatEuro(action.beforeRefundEur)} → `}
            <Text style={styles.diffNewValue}>{formatEuro(action.afterRefundEur)}</Text>
          </Text>
        </View>
      </View>

      <Text style={styles.actionReason}>{action.reason}</Text>

      {legalSource ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelectSource(legalSource)}
          style={styles.sourcePill}
        >
          <Text style={styles.sourcePillText}>
            {tr('advisor.chat.legalStatusDate', {
              paragraph: legalSource.paragraph,
              date: legalSource.legalStatusDate,
              defaultValue: `${legalSource.paragraph} · Rechtsstand ${legalSource.legalStatusDate}`,
            })}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.actionFooter}>
        {action.status === 'applied' ? (
          <View style={styles.appliedRow}>
            <Text style={styles.appliedBadge} testID={`${testIDPrefix}-applied-badge`}>
              {tr('advisor.chat.appliedBadge', '✓ Übernommen & bestätigt (SteuerEule)')}
            </Text>
            {onUndo ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('advisor.chat.undoAria', 'Rückgängig machen')}
                disabled={busy}
                onPress={() => void handleUndo()}
                style={styles.undoButton}
                testID={`${testIDPrefix}-undo-btn`}
              >
                <Text style={styles.undoButtonText}>{tr('advisor.chat.undoButton', '↩ Rückgängig machen')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Button
            onPress={() => void handleApply()}
            disabled={busy}
            testID={`${testIDPrefix}-apply-btn`}
          >
            {action.status === 'undone'
              ? tr('advisor.chat.applyAgain', '✓ Erneut übernehmen')
              : tr('advisor.chat.applyNow', '✓ Jetzt übernehmen')}
          </Button>
        )}
      </View>
    </View>
  )
}

function TwoPathsCardView({
  twoPaths,
  onApply,
  onUndo,
  onSelectSource,
  styles,
}: {
  readonly twoPaths: AdvisorTwoPathsProposal
  readonly onApply?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onUndo?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onSelectSource: (source: AdvisorLegalSource) => void
  readonly styles: ReturnType<typeof makeStyles>
}) {
  return (
    <View style={styles.twoPathsContainer} testID="advisor-two-paths-card">
      <Text style={styles.twoPathsTitle}>{twoPaths.title}</Text>
      <ActionProposalCardView
        action={twoPaths.safePath}
        onApply={onApply}
        onUndo={onUndo}
        onSelectSource={onSelectSource}
        styles={styles}
        testIDPrefix="advisor-path-safe"
      />
      <View style={styles.maxPathWrapper}>
        <Text style={styles.evidenceHintText}>{twoPaths.maxPath.evidenceHint}</Text>
        <ActionProposalCardView
          action={twoPaths.maxPath}
          onApply={onApply}
          onUndo={onUndo}
          onSelectSource={onSelectSource}
          styles={styles}
          testIDPrefix="advisor-path-max"
        />
      </View>
    </View>
  )
}

export function AdvisorChatPanel({
  greeting,
  messages,
  quickChips = [],
  isSending = false,
  onSendMessage,
  onApplyAction,
  onUndoAction,
}: AdvisorChatPanelProps) {
  const theme = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(theme)
  const [inputText, setInputText] = useState('')
  const [selectedSource, setSelectedSource] = useState<AdvisorLegalSource | null>(null)

  async function handleSubmit(rawText?: string) {
    const text = (rawText ?? inputText).trim()
    if (!text || isSending) return
    if (rawText === undefined) {
      setInputText('')
    }
    await onSendMessage(text)
  }

  return (
    <View style={styles.container} testID="advisor-chat-panel">
      <View style={styles.chatHeader}>
        <AiChip style={styles.sender} testID="eule-sender-chat">
          {tr('advisor.chat.sender', 'Die Eule')}
        </AiChip>
        <Text style={styles.heading}>{tr('advisor.chat.heading', 'Steuer-Assistent')}</Text>
        <Text style={styles.help}>
          {greeting ??
            tr(
              'advisor.chat.help',
              'Stelle Fragen zu deinen Werbungskosten, Freibeträgen oder Belegen. Antworten erfolgen transparent mit Angabe der Rechtsgrundlage.',
            )}
        </Text>
      </View>

      {/* Quick-Starter Chips */}
      {quickChips.length > 0 && messages.length === 0 ? (
        <View style={styles.quickChipsRow} testID="advisor-quick-chips">
          {quickChips.map((chip) => (
            <Pressable
              key={chip}
              accessibilityRole="button"
              onPress={() => void handleSubmit(chip)}
              style={styles.quickChipButton}
            >
              <Text style={styles.quickChipText}>{chip}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Conversation History */}
      <View style={styles.messagesList}>
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <View key={msg.id} style={styles.userBubble} testID="advisor-user-message">
              <Text style={styles.userBubbleText}>{msg.content}</Text>
            </View>
          ) : (
            <Card key={msg.id} style={styles.assistantBubble} testID="advisor-assistant-message">
              <View style={styles.assistantBubbleHeader}>
                <AiChip>{tr('advisor.chat.sender', 'Die Eule')}</AiChip>
              </View>
              {renderMessageWithLawChips(msg.content, setSelectedSource, styles, tr)}

              {/* Source Pills when sources are in meta */}
              {msg.meta?.sources && msg.meta.sources.length > 0 ? (
                <View style={styles.sourcesRow}>
                  {msg.meta.sources.map((srcId) => {
                    const src = ADVISOR_LEGAL_SOURCES[srcId]
                    if (!src) return null
                    return (
                      <Pressable
                        key={srcId}
                        accessibilityRole="button"
                        onPress={() => setSelectedSource(src)}
                        style={styles.sourcePill}
                        testID={`meta-source-chip-${srcId}`}
                      >
                        <Text style={styles.sourcePillText}>{src.paragraph}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              ) : null}

              {/* Mandanten-Anamnese Follow-up Choice Pills */}
              {msg.meta?.choices && msg.meta.choices.length > 0 ? (
                <View style={styles.choicesContainer} testID="advisor-followup-choices">
                  <Text style={styles.choicesCaption}>{tr('advisor.chat.choicesCaption', 'Schnellantwort wählen:')}</Text>
                  <View style={styles.choicesRow}>
                    {msg.meta.choices.map((choice) => (
                      <Pressable
                        key={choice}
                        accessibilityRole="button"
                        onPress={() => void handleSubmit(choice)}
                        style={styles.choicePill}
                        testID="advisor-choice-pill"
                      >
                        <Text style={styles.choicePillText}>{choice}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Single Action Proposal Card */}
              {msg.meta?.action ? (
                <ActionProposalCardView
                  action={msg.meta.action}
                  onApply={onApplyAction}
                  onUndo={onUndoAction}
                  onSelectSource={setSelectedSource}
                  styles={styles}
                />
              ) : null}

              {/* Two-Paths Comparison Card */}
              {msg.meta?.twoPaths ? (
                <TwoPathsCardView
                  twoPaths={msg.meta.twoPaths}
                  onApply={onApplyAction}
                  onUndo={onUndoAction}
                  onSelectSource={setSelectedSource}
                  styles={styles}
                />
              ) : null}
            </Card>
          ),
        )}

        {isSending ? (
          <View style={styles.thinkingBox} testID="advisor-thinking">
            <Text style={styles.thinkingText}>{tr('advisor.chat.thinking', 'Eule prüft deine Akte & Paragraphen …')}</Text>
          </View>
        ) : null}
      </View>

      {/* Interactive Law Source Popover / Modal */}
      {selectedSource ? (
        <Card style={styles.lawModal} testID="law-source-modal">
          <View style={styles.lawModalHeader}>
            <View>
              <Text style={styles.lawModalParagraph}>{selectedSource.paragraph}</Text>
              <Text style={styles.lawModalTitle}>{selectedSource.title}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('advisor.chat.legalSourceCloseAria', 'Rechtsquelle schließen')}
              onPress={() => setSelectedSource(null)}
              style={styles.lawModalCloseBtn}
              testID="law-source-close"
            >
              <Text style={styles.lawModalCloseText}>{tr('advisor.chat.legalSourceClose', '✕ Schließen')}</Text>
            </Pressable>
          </View>
          <Text style={styles.lawModalSummary}>{selectedSource.summary}</Text>
          <View style={styles.lawModalFooter}>
            <Text style={styles.lawModalDate}>
              {tr('advisor.chat.legalStatus', {
                date: selectedSource.legalStatusDate,
                defaultValue: `Rechtsstand: ${selectedSource.legalStatusDate}`,
              })}
            </Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(selectedSource.url)}
            >
              <Text style={styles.lawModalLink}>{tr('advisor.chat.officialLawLink', 'Offizieller Gesetzestext ↗')}</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {/* Chat Input Bar */}
      <View style={styles.inputRow}>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder={tr(
            'advisor.chat.inputPlaceholder',
            'Frag deine Eule (z. B. Fortbildung, Laptop, Spenden, Endprüfung) …',
          )}
          placeholderTextColor={theme.color.tinte2}
          style={styles.textInput}
          onSubmitEditing={() => void handleSubmit()}
          testID="advisor-chat-input"
        />
        <Button
          onPress={() => void handleSubmit()}
          disabled={isSending || inputText.trim().length === 0}
          testID="advisor-chat-send"
        >
          {tr('advisor.chat.sendButton', 'Fragen')}
        </Button>
      </View>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    container: {
      marginTop: t.space.s2,
      marginBottom: t.space.s4,
    } as ViewStyle,
    chatHeader: {
      marginBottom: t.space.s3,
    } as ViewStyle,
    sender: {
      marginBottom: t.space.s2,
    } as ViewStyle,
    heading: {
      fontFamily: t.font.display,
      fontWeight: t.weight.schwer,
      fontSize: t.size.xl,
      color: t.color.tinte,
      marginBottom: t.space.s1,
    } as TextStyle,
    help: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte2,
      lineHeight: 21,
    } as TextStyle,
    quickChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: t.space.s2,
      marginBottom: t.space.s4,
    } as ViewStyle,
    quickChipButton: {
      paddingVertical: t.space.s2,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.pille,
      backgroundColor: t.color.kiWeich,
      borderWidth: 1,
      borderColor: t.color.ki,
    } as ViewStyle,
    quickChipText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.ki,
    } as TextStyle,
    messagesList: {
      gap: t.space.s3,
      marginBottom: t.space.s4,
    } as ViewStyle,
    userBubble: {
      alignSelf: 'flex-end',
      maxWidth: '85%',
      backgroundColor: t.color.tinte,
      paddingVertical: t.space.s3,
      paddingHorizontal: t.space.s4,
      borderRadius: t.radius.m,
    } as ViewStyle,
    userBubbleText: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.grund,
    } as TextStyle,
    assistantBubble: {
      padding: t.space.s4,
      borderRadius: t.radius.m,
      backgroundColor: t.color.karte,
      borderWidth: 1,
      borderColor: '#DDD6FE',
    } as ViewStyle,
    assistantBubbleHeader: {
      marginBottom: t.space.s2,
    } as ViewStyle,
    assistantText: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte,
      lineHeight: 22,
    } as TextStyle,
    inlineLawChip: {
      backgroundColor: t.color.kiWeich,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: t.radius.s,
      marginHorizontal: 2,
    } as ViewStyle,
    inlineLawChipText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.ki,
    } as TextStyle,
    sourcesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: t.space.s2,
      marginTop: t.space.s3,
    } as ViewStyle,
    sourcePill: {
      alignSelf: 'flex-start',
      backgroundColor: t.color.kiWeich,
      paddingHorizontal: t.space.s2,
      paddingVertical: 4,
      borderRadius: t.radius.s,
      marginTop: t.space.s2,
    } as ViewStyle,
    sourcePillText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.ki,
    } as TextStyle,
    choicesContainer: {
      marginTop: t.space.s3,
      paddingTop: t.space.s3,
      borderTopWidth: 1,
      borderTopColor: t.color.linie,
    } as ViewStyle,
    choicesCaption: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.tinte2,
      marginBottom: t.space.s2,
    } as TextStyle,
    choicesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: t.space.s2,
    } as ViewStyle,
    choicePill: {
      paddingVertical: t.space.s2,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.pille,
      backgroundColor: t.color.grund,
      borderWidth: 1,
      borderColor: t.color.ki,
    } as ViewStyle,
    choicePillText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    actionCard: {
      marginTop: t.space.s3,
      padding: t.space.s4,
      borderRadius: t.radius.m,
      backgroundColor: t.color.kiWeich,
      borderWidth: 1.5,
      borderColor: t.color.ki,
    } as ViewStyle,
    actionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: t.space.s2,
      marginBottom: t.space.s2,
    } as ViewStyle,
    actionLabel: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
    actionDeltaBadge: {
      fontFamily: t.font.display,
      fontWeight: t.weight.schwer,
      fontSize: t.size.m,
      color: t.color.ok,
    } as TextStyle,
    diffBox: {
      backgroundColor: t.color.karte,
      borderRadius: t.radius.s,
      padding: t.space.s3,
      marginBottom: t.space.s2,
      gap: 4,
    } as ViewStyle,
    diffRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
    } as ViewStyle,
    diffCaption: {
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte2,
    } as TextStyle,
    diffValues: {
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    diffNewValue: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      color: t.color.ki,
    } as TextStyle,
    actionReason: {
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte2,
      marginTop: t.space.s1,
    } as TextStyle,
    actionFooter: {
      marginTop: t.space.s3,
    } as ViewStyle,
    appliedRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: t.space.s2,
    } as ViewStyle,
    appliedBadge: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.ok,
    } as TextStyle,
    undoButton: {
      paddingVertical: t.space.s1,
      paddingHorizontal: t.space.s2,
      borderRadius: t.radius.s,
      borderWidth: 1,
      borderColor: t.color.linie,
      backgroundColor: t.color.karte,
    } as ViewStyle,
    undoButtonText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    twoPathsContainer: {
      marginTop: t.space.s3,
      gap: t.space.s2,
    } as ViewStyle,
    twoPathsTitle: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
    maxPathWrapper: {
      marginTop: t.space.s2,
    } as ViewStyle,
    evidenceHintText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.warn,
      marginBottom: 4,
    } as TextStyle,
    thinkingBox: {
      padding: t.space.s3,
      borderRadius: t.radius.m,
      backgroundColor: t.color.kiWeich,
      alignItems: 'center',
    } as ViewStyle,
    thinkingText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.ki,
    } as TextStyle,
    lawModal: {
      padding: t.space.s4,
      borderRadius: t.radius.m,
      backgroundColor: t.color.karte,
      borderWidth: 2,
      borderColor: t.color.ki,
      marginBottom: t.space.s4,
    } as ViewStyle,
    lawModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: t.space.s2,
    } as ViewStyle,
    lawModalParagraph: {
      fontFamily: t.font.display,
      fontWeight: t.weight.schwer,
      fontSize: t.size.l,
      color: t.color.ki,
    } as TextStyle,
    lawModalTitle: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
    lawModalCloseBtn: {
      padding: t.space.s1,
    } as ViewStyle,
    lawModalCloseText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.tinte2,
    } as TextStyle,
    lawModalSummary: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte,
      lineHeight: 21,
      marginBottom: t.space.s3,
    } as TextStyle,
    lawModalFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: t.color.linie,
      paddingTop: t.space.s2,
    } as ViewStyle,
    lawModalDate: {
      fontFamily: t.font.text,
      fontSize: t.size.xs,
      color: t.color.tinte2,
    } as TextStyle,
    lawModalLink: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.ki,
    } as TextStyle,
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.s2,
    } as ViewStyle,
    textInput: {
      flex: 1,
      backgroundColor: t.color.karte,
      borderWidth: 1,
      borderColor: t.color.linie,
      borderRadius: t.radius.m,
      paddingHorizontal: t.space.s3,
      paddingVertical: t.space.s3,
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
  }
}
