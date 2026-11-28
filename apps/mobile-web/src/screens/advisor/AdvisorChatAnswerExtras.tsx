import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ADVISOR_LEGAL_SOURCES, type AdvisorChatMessageView } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { NoteChangeHints } from './chat/ProjectNotes'
import { QuestionRound } from './chat/QuestionRound'
import { SituationSuggestions } from './chat/Situation'
import { TurboSummary } from './chat/TurboToggle'
import { ModelFailureNotice } from './chat/ModelFailureNotice'
import { PersonalDataConsentCard } from './chat/PersonalDataConsentCard'
import { ActionProposalCardView, ScannedCertificateCardView, TwoPathsCardView } from './chat/ProposalCards'
import type { makeStyles } from './AdvisorChatPanel.styles'
import type { AdvisorChatDrafts, AdvisorChatLiveStream, AdvisorChatModel } from './AdvisorChat.types'
import type { AdvisorChatState } from './useAdvisorChat'
import { turboAppliedCount } from './AdvisorChatHelpers'

interface AdvisorChatAnswerExtrasProps {
  readonly msg: AdvisorChatMessageView
  readonly isLast: boolean
  readonly chat: AdvisorChatState
  readonly drafts: AdvisorChatDrafts
  readonly model: AdvisorChatModel
  readonly stream: AdvisorChatLiveStream
  readonly styles: ReturnType<typeof makeStyles>
}

/** Everything an answer's meta adds under its text: sources, questions, drafts, notices. */
export function AdvisorChatAnswerExtras({ msg, isLast, chat, drafts, model, stream, styles }: AdvisorChatAnswerExtrasProps) {
  const { t: tr } = useTranslation(APP_NS)
  const { setSelectedSource, send, handleSubmit, canReplace, continueAfterConsent, regenerate } = chat
  const { onInspectMask, receiptLinkedActionIds, onUndoNoteChange, onAcceptSituationSuggestion } = drafts
  return (
    <>
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

      {msg.meta?.questionRound ? (
        <QuestionRound round={msg.meta.questionRound} open={isLast && !stream.isSending} onSubmit={(text) => void send(text)} />
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
          drafts={drafts}
          receiptLinked={receiptLinkedActionIds?.has(msg.meta.action.actionId)}
          onSelectSource={setSelectedSource}
          styles={styles}
        />
      ) : null}

      {/* Several drafts in one answer: one card each, applied one by one or together */}
      {!msg.meta?.lstbScan
        ? (msg.meta?.actions ?? []).map((action) => (
            <ActionProposalCardView
              key={action.actionId}
              action={action}
              drafts={drafts}
              receiptLinked={receiptLinkedActionIds?.has(action.actionId)}
              onSelectSource={setSelectedSource}
              styles={styles}
            />
          ))
        : null}

      {/* What the owl tried to prepare and could not: said by the app, not left to the model */}
      {msg.meta?.notStaged && msg.meta.notStaged.length > 0 ? (
        <View style={styles.notStagedBox} testID="advisor-not-staged" accessibilityRole="alert">
          <Text style={styles.notStagedTitle}>{tr('advisor.chat.notStaged.title', 'Nicht vorbereitet')}</Text>
          {msg.meta.notStaged.map((item, i) => (
            <View key={`${item.label}-${i}`} style={styles.notStagedItem}>
              <Text style={styles.notStagedLine}>
                {item.label}: {item.reason}
              </Text>
              {item.screen && onInspectMask ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onInspectMask(item.screen!)}
                  style={styles.inspectMaskBtn}
                  testID="advisor-not-staged-open-mask"
                >
                  <Text style={styles.inspectMaskText}>{tr('advisor.chat.notStaged.openMask', 'Maske öffnen')}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {/* The owl needed personal data without consent: ask once, explicitly (ADR-0091) */}
      {msg.meta?.personalDataConsentRequest === true ? <PersonalDataConsentCard provider={model.chatModel?.provider ?? model.models?.standard?.provider ?? null} onGranted={isLast && canReplace ? continueAfterConsent : undefined} /> : null}

      {/* The model did not answer: the rules did, and the reason stays with the answer (#487) */}
      {msg.meta?.modelFailure ? (
        <ModelFailureNotice
          failure={msg.meta.modelFailure}
          answeredByRules
          onRetry={isLast && canReplace ? regenerate : undefined}
        />
      ) : null}

      {/* What the check of the finished answer found: said by the app, the text stays as written */}
      {msg.meta?.notices && msg.meta.notices.length > 0 ? (
        <View style={styles.notStagedBox} testID="advisor-answer-notices" accessibilityRole="alert">
          <Text style={styles.notStagedTitle}>{tr('advisor.chat.notices.title', 'Hinweis der App zu dieser Antwort')}</Text>
          {msg.meta.notices.map((notice) => (
            <Text key={notice.kind} style={styles.notStagedLine} testID={`advisor-answer-notice-${notice.kind}`}>
              {notice.text}
            </Text>
          ))}
        </View>
      ) : null}

      {msg.meta?.turbo ? <TurboSummary count={turboAppliedCount(msg.meta.action, msg.meta.actions)} /> : null}

      {/* What the owl noted, replaced or forgot in this answer; each change can be taken back */}
      {msg.meta?.noteChanges && msg.meta.noteChanges.length > 0 ? (
        <NoteChangeHints changes={msg.meta.noteChanges} onUndo={onUndoNoteChange ? (changeIndex) => onUndoNoteChange(msg.id, changeIndex) : undefined} />
      ) : null}

      {msg.meta?.situationSuggestions && msg.meta.situationSuggestions.length > 0 && onAcceptSituationSuggestion ? (
        <SituationSuggestions suggestions={msg.meta.situationSuggestions} onAccept={onAcceptSituationSuggestion} />
      ) : null}

      {/* Scanned LStB: several staged fields at once */}
      {msg.meta?.lstbScan && msg.meta.actions && msg.meta.actions.length > 0 ? (
        <ScannedCertificateCardView actions={msg.meta.actions} drafts={drafts} styles={styles} />
      ) : null}

      {/* Two-Paths Comparison Card */}
      {msg.meta?.twoPaths ? (
        <TwoPathsCardView
          twoPaths={msg.meta.twoPaths}
          drafts={drafts}
          onSelectSource={setSelectedSource}
          styles={styles}
        />
      ) : null}
    </>
  )
}
