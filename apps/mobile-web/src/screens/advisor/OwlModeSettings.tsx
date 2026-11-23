import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Option } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { ProfessionPicker } from './ProfessionPicker'
import type { makeStyles } from './OwlModeScreen.styles'
import type { OwlModeScreenProps } from './OwlModeScreen'
import type { OwlModeScreenState } from './useOwlModeScreen'

type OwlModeSettingsProps = Pick<OwlModeScreenProps, 'profession' | 'onChooseProfession' | 'onToggleOptIn' | 'onClearConversation'> & {
  readonly owl: OwlModeScreenState
  readonly optInEnabled: boolean
  readonly styles: ReturnType<typeof makeStyles>
}

/** The settings sheet's body: occupation, the owl's opt-in, and clearing the conversation. */
export function OwlModeSettings({ owl, optInEnabled, styles, profession, onChooseProfession, onToggleOptIn, onClearConversation }: OwlModeSettingsProps) {
  const { t: tr } = useTranslation(APP_NS)
  const { clearState, setClearState, confirmClear, effectiveSending, displayedMessages } = owl
  return (
    <View style={styles.sheetBody}>
      <Text style={styles.sheetTitle} role="heading" aria-level={2}>
        {tr('eule.workspace.topbar.settingsTitle')}
      </Text>
      {profession !== undefined && onChooseProfession ? (
        <ProfessionPicker profession={profession} onChoose={onChooseProfession} />
      ) : null}

      {onToggleOptIn ? (
        <Option selected={optInEnabled} onPress={() => void onToggleOptIn(!optInEnabled)} testID="eulen-modus-opt-in">
          {tr('eule.optInLabel', 'Eulen-Modus aktivieren (proaktive Hinweise ab 50 €, keine personenbezogenen Daten an KI)')}
        </Option>
      ) : null}

      {onClearConversation ? (
        clearState === 'closed' ? (
          <Button
            variant="leise"
            onPress={() => setClearState('confirm')}
            disabled={effectiveSending || displayedMessages.length === 0}
            testID="eule-clear-conversation-btn"
          >
            {tr('advisor.chat.clear.button')}
          </Button>
        ) : (
          <Card style={styles.clearCard} testID="eule-clear-confirm">
            <Text style={styles.clearTitle}>{tr('advisor.chat.clear.confirmTitle')}</Text>
            <Text style={styles.help}>{tr('advisor.chat.clear.confirmBody')}</Text>
            {clearState === 'failed' ? (
              <Text style={styles.conflictText} role="alert" testID="eule-clear-failed">
                {tr('advisor.chat.clear.failed')}
              </Text>
            ) : null}
            <View style={styles.conflictActions}>
              <Button onPress={() => void confirmClear()} disabled={clearState === 'clearing'} style={{ flex: 1 }} testID="eule-clear-confirm-btn">
                {tr('advisor.chat.clear.confirm')}
              </Button>
              <Button variant="ghost" onPress={() => setClearState('closed')} style={{ flex: 1 }} testID="eule-clear-cancel-btn">
                {tr('advisor.chat.clear.cancel')}
              </Button>
            </View>
          </Card>
        )
      ) : null}
    </View>
  )
}
