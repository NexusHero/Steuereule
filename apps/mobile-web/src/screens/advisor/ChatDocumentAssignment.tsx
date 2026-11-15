import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { AlsoForOffers, DocumentAssignmentCard, useHolderName } from '../receipts/DocumentAssignmentCard'
import type { CopilotBridgeContextValue } from './CopilotBridgeProvider'

/**
 * The chat's part of the document assignment (ADR-0092): „Für wen?“ before a document is read, and after
 * it „für: <Name>“ with „auch für … übernehmen?“ for a multi-person document. Null when there is nothing.
 */
export function ChatDocumentAssignment({ bridge }: { readonly bridge: CopilotBridgeContextValue }) {
  const { t: tr } = useTranslation(APP_NS)
  const theme = useTheme()
  const name = useHolderName()
  if (bridge.documentQuestion !== null) {
    return (
      <DocumentAssignmentCard
        question={bridge.documentQuestion.question}
        printed={bridge.documentQuestion.printed}
        busy={bridge.assignmentBusy || bridge.parsingReceipt}
        error={bridge.assignmentError}
        onChoose={(holder) => void bridge.chooseDocumentHolder(holder)}
        onCreate={(role, details) => void bridge.createDocumentHolder(role, details)}
        onConfirmSelf={(takeName) => void bridge.confirmDocumentSelf(takeName)}
      />
    )
  }
  if (bridge.documentHolder === null) return null
  return (
    <View style={{ gap: theme.space.s2 }}>
      <Text style={{ ...theme.type.label, color: theme.color.tinte2 }} testID="beleg-fuer">
        {tr('belegZuordnung.fuer', { name: name(bridge.documentHolder.holder) })}
      </Text>
      <AlsoForOffers people={bridge.documentHolder.alsoFor} busy={bridge.assignmentBusy || bridge.parsingReceipt} onTake={(holder) => void bridge.takeDocumentAlsoFor(holder)} />
    </View>
  )
}
