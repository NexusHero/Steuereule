import type { ReactNode } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { ReceiptPickerButton } from '../shared/ReceiptPickerButton'
import type { makeStyles } from './AdvisorChatPanel.styles'
import type { AdvisorChatPanelProps } from './AdvisorChat.types'
import type { AdvisorChatState } from './useAdvisorChat'

interface AdvisorChatReceiptPanelProps {
  readonly chat: AdvisorChatState
  readonly onAttachReceipt: AdvisorChatPanelProps['onAttachReceipt']
  readonly onAttachReceiptFile: AdvisorChatPanelProps['onAttachReceiptFile']
  readonly receiptProgress: string | null
  readonly receiptSources: ReactNode | undefined
  readonly isParsingReceipt: boolean
  readonly styles: ReturnType<typeof makeStyles>
}

/** Receipt attach panel: a PDF or photo first (read on the device, #444), pasted text as fallback. */
export function AdvisorChatReceiptPanel({ chat, onAttachReceipt, onAttachReceiptFile, receiptProgress, receiptSources, isParsingReceipt, styles }: AdvisorChatReceiptPanelProps) {
  const theme = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const {
    fileQueue,
    queueFile,
    unqueueFile,
    receiptTextOpen,
    setReceiptTextOpen,
    receiptFileName,
    setReceiptFileName,
    receiptRawText,
    setReceiptRawText,
    setReceiptOpen,
    handleReceiptSubmit,
  } = chat
  return (
    <Card style={styles.receiptPanel} testID="advisor-receipt-panel">
      {onAttachReceiptFile ? (
        <ReceiptPickerButton
          multiple
          onFile={queueFile}
          disabled={isParsingReceipt}
          testID="advisor-receipt-file"
          inputTestID="advisor-receipt-file-input"
          unsupportedHint={tr('advisor.chat.receiptNativeHint', 'Im Web kannst du ein PDF oder Foto hochladen.')}
        >
          {isParsingReceipt
            ? (receiptProgress ?? tr('advisor.chat.parsingReceipt', 'Beleg wird geprüft …'))
            : tr('advisor.chat.receiptFileCta', 'PDF oder Foto auswählen')}
        </ReceiptPickerButton>
      ) : null}
      {receiptSources ?? null}
      {fileQueue.length > 1 ? (
        <View style={styles.choicesRow} testID="advisor-receipt-queue">
          <Text style={styles.actionReason}>{tr('advisor.chat.receiptQueue', { count: fileQueue.length - 1 })}</Text>
          {fileQueue.slice(1).map((file, i) => (
            <Pressable
              key={`${file.name}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={tr('advisor.chat.receiptQueueRemove', { name: file.name })}
              onPress={() => unqueueFile(file)}
              style={styles.choicePill}
              testID="advisor-receipt-queue-item"
            >
              <Text style={styles.choicePillText}>{`${file.name} ✕`}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={styles.actionReason}>
        {tr('advisor.chat.receiptPrivacy', 'Der Text wird auf deinem Gerät gelesen. Das Bild geht an keine KI; das Original liegt verschlüsselt in deinen Belegen.')}
      </Text>
      {onAttachReceipt ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setReceiptTextOpen((prev) => !prev)}
          testID="advisor-receipt-text-toggle"
        >
          <Text style={styles.actionReason}>{tr('advisor.chat.receiptPasteText', 'Stattdessen Text einfügen')}</Text>
        </Pressable>
      ) : null}
      {onAttachReceipt && (receiptTextOpen || !onAttachReceiptFile) ? (
        <>
          {/* Pasted text is only read: it is no document, so the Belege inbox gets nothing (ADR-0097 §4). */}
          <Text style={styles.actionReason} testID="advisor-receipt-text-hint">
            {tr('advisor.chat.receiptPasteNoReceipt')}
          </Text>
          <TextInput
            accessibilityLabel={tr('advisor.chat.receiptNamePlaceholder', 'Dateiname (z. B. rechnung.pdf)')}
            value={receiptFileName}
            onChangeText={setReceiptFileName}
            placeholder={tr('advisor.chat.receiptNamePlaceholder', 'Dateiname (z. B. rechnung.pdf)')}
            placeholderTextColor={theme.color.tinte2}
            style={styles.textInput}
            testID="advisor-receipt-filename"
          />
          <TextInput
            accessibilityLabel={tr('advisor.chat.receiptTextPlaceholder', 'Belegtext oder Betrag (z. B. Monitor 349 EUR)')}
            value={receiptRawText}
            onChangeText={setReceiptRawText}
            placeholder={tr('advisor.chat.receiptTextPlaceholder', 'Belegtext oder Betrag (z. B. Monitor 349 EUR)')}
            placeholderTextColor={theme.color.tinte2}
            style={styles.textInput}
            multiline
            testID="advisor-receipt-rawtext"
          />
          <View style={styles.receiptActionsRow}>
            <Button
              variant="tinte"
              onPress={() => void handleReceiptSubmit()}
              disabled={isParsingReceipt || receiptRawText.trim().length === 0}
              style={{ flex: 1 }}
              testID="advisor-receipt-submit-btn"
            >
              {isParsingReceipt
                ? tr('advisor.chat.parsingReceipt', 'Beleg wird geprüft …')
                : tr('advisor.chat.receiptSubmit', 'Beleg prüfen')}
            </Button>
            <Button
              variant="ghost"
              onPress={() => setReceiptOpen(false)}
              style={{ flex: 1 }}
              testID="advisor-receipt-cancel-btn"
            >
              {tr('advisor.chat.receiptCancel', 'Abbrechen')}
            </Button>
          </View>
        </>
      ) : null}
      {!onAttachReceipt || !(receiptTextOpen || !onAttachReceiptFile) ? (
        <Button variant="ghost" onPress={() => setReceiptOpen(false)} testID="advisor-receipt-close-btn">
          {tr('advisor.chat.receiptCancel', 'Abbrechen')}
        </Button>
      ) : null}
    </Card>
  )
}

interface AdvisorChatReceiptNoticeProps {
  readonly receiptNotice: string | null
  readonly receiptAssignment: ReactNode | undefined
  readonly receiptResults: ReactNode | undefined
  readonly styles: ReturnType<typeof makeStyles>
}

/** What became of the last selection: one line per file, the reader's own sentence, and „Für wen?“. */
export function AdvisorChatReceiptNotice({ receiptNotice, receiptAssignment, receiptResults, styles }: AdvisorChatReceiptNoticeProps) {
  if (!(receiptNotice || receiptAssignment || receiptResults)) return null
  return (
    <Card style={styles.receiptPanel} testID="advisor-receipt-notice">
      {receiptResults ?? null}
      {receiptNotice ? <Text style={styles.actionReason}>{receiptNotice}</Text> : null}
      {receiptAssignment ?? null}
    </Card>
  )
}
