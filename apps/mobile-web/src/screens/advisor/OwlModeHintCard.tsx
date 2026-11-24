import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AiChip, Button, Card, Chip } from '@steuereule/ui'
import { formatEuro } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import type { makeStyles } from './OwlModeScreen.styles'
import type { OwlModeScreenProps } from './OwlModeScreen'
import type { OwlModeScreenState } from './useOwlModeScreen'

interface OwlModeHintCardProps {
  readonly owl: OwlModeScreenState
  readonly onAcceptPath: OwlModeScreenProps['onAcceptPath']
  readonly styles: ReturnType<typeof makeStyles>
}

/** The owl's open hints, one card at a time, or the note that nothing is open. */
export function OwlModeHintCard({ owl, onAcceptPath, styles }: OwlModeHintCardProps) {
  const { t: tr } = useTranslation(APP_NS)
  const { cards, activeCard, activeIndex, setActiveIndex, handleDismiss, handleClarifyCardWithEule } = owl
  return (
    <>
      {cards.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{tr('eule.emptyTitle', 'Alles geprüft. Keine offenen Fragen!')}</Text>
          <Text style={styles.emptyHelp}>{tr('eule.emptyHelp')}</Text>
          <Text style={styles.rechtsstand}>{tr('eule.rechtsstand')}</Text>
        </Card>
      ) : activeCard ? (
        <View>
          <Text style={styles.counter}>
            {tr('eule.counter', { current: activeIndex + 1, total: cards.length, defaultValue: `Frage ${activeIndex + 1} von ${cards.length}` })}
          </Text>
          <Card style={styles.kiCard}>
            <AiChip style={styles.sender} testID="eule-sender-card">{tr('eule.sender', 'Die Eule')}</AiChip>
            <View style={styles.cardHeader}>
              <Chip active>{activeCard.title}</Chip>
              {activeCard.amountEur !== null && (
                <Text style={styles.betragBadge}>{`+${formatEuro(activeCard.amountEur)}`}</Text>
              )}
            </View>

            <Text style={styles.botschaft}>{activeCard.message}</Text>
            <Text style={styles.begruendung}>{activeCard.reason}</Text>

            {activeCard.paths && (
              <View style={styles.wegeBlock}>
                <Text style={styles.wegeTitle}>{tr('eule.wegeTitle', 'Empfohlene Vorgehensweise (StBerG-Grenze):')}</Text>
                {activeCard.paths.map((path, idx) => (
                  <Pressable
                    key={path.name}
                    accessibilityRole="button"
                    onPress={() => onAcceptPath?.(activeCard.id, idx)}
                    style={[styles.wegOption, path.risk === 'sicher' ? styles.wegSicher : styles.wegRisiko]}
                  >
                    <View style={styles.wegHeader}>
                      <Text style={styles.wegName}>{path.name}</Text>
                      <Text style={styles.wegBetrag}>{formatEuro(path.amountEur)}</Text>
                    </View>
                    <Text style={styles.wegDesc}>{path.description}</Text>
                    <Text style={styles.wegBadge}>
                      {path.risk === 'sicher' ? '✓ Sicherer Weg' : '⚠ Riskanterer Weg'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.quelleRow}>
              <Text style={styles.quelleText}>{activeCard.sourceTranslated}</Text>
            </View>

            <View style={styles.cardFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stimmt nicht"
                onPress={() => handleDismiss(activeCard.fingerprint)}
                style={styles.dismissButton}
              >
                <Text style={styles.dismissText}>{tr('eule.dismiss', 'Stimmt nicht')}</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mit Eule klären"
                onPress={() => void handleClarifyCardWithEule(activeCard)}
                style={styles.clarifyButton}
                testID="card-clarify-with-eule"
              >
                <Text style={styles.clarifyButtonText}>Mit Eule klären 💬</Text>
              </Pressable>

              {activeIndex < cards.length - 1 && (
                <Button
                  variant="ghost"
                  onPress={() => setActiveIndex(activeIndex + 1)}
                  style={styles.nextButton}
                >
                  {tr('eule.next', 'Nächste Frage →')}
                </Button>
              )}
            </View>
          </Card>
        </View>
      ) : null}
    </>
  )
}
