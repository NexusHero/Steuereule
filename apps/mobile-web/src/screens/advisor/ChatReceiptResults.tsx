import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { ReceiptOutcomeLines } from '../receipts/ReceiptOutcomeLines'
import type { ChatReceiptResult } from './CopilotBridgeProvider'

export interface ChatReceiptResultsProps {
  readonly results: readonly ChatReceiptResult[]
  /** The tax year the chat is in: drafts of another year say so, with a switch. */
  readonly openYear: number
  readonly onSwitchYear?: ((year: number) => void) | undefined
  readonly onClose: () => void
}

/**
 * The end of a chat upload (ADR-0097 §3): one line per file, from the server's state, that stays when the
 * next file is read — „spende-2024.pdf: 1 Wert wartet auf dich · liegt im Steuerjahr 2024“,
 * „waage-2025.pdf: Nichts für die Erklärung: nicht absetzbar“. No file ends without a word.
 */
export function ChatReceiptResults({ results, openYear, onSwitchYear, onClose }: ChatReceiptResultsProps) {
  const theme = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  if (results.length === 0) return null
  return (
    <View style={{ gap: theme.space.s2 }} testID="advisor-receipt-results">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.space.s2 }}>
        <Text style={{ ...theme.type.labelStrong, color: theme.color.tinte }} role="heading" aria-level={3}>
          {tr('advisor.chat.receiptResults')}
        </Text>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12} testID="advisor-receipt-results-close">
          <Text style={{ ...theme.type.label, color: theme.color.tinte2, textDecorationLine: 'underline' }}>{tr('advisor.chat.receiptResultsClose')}</Text>
        </Pressable>
      </View>
      {results.map((result, i) => (
        <ReceiptOutcomeLines
          key={result.key}
          outcome={result.outcome}
          openYear={openYear}
          fileName={result.fileName}
          asking={result.asking}
          explain={false}
          testIDPrefix={`advisor-receipt-result-${i}`}
          onSwitchYear={onSwitchYear}
        />
      ))}
    </View>
  )
}
