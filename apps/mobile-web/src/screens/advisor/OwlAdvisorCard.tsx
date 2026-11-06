import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { OwlMark } from '../../marks/OwlMark'
import { useOwlEntrance } from '../../marks/useOwlEntrance'

export interface OwlAdvisorCardProps {
  readonly onOpen: () => void
  readonly testID?: string
}

/**
 * The advisor up front: the owl as the face of the Berater, right under the Cockpit's next step.
 * A held card (2px ink contour, hard shadow) with the ink owl — the brand mark, never violet:
 * this is an invitation to advice, not AI output itself, so it carries no ki colour. Its button
 * is `leise`, so the screen keeps exactly one primary action.
 */
export function OwlAdvisorCard({ onOpen, testID = 'cockpit-eulen-modus' }: OwlAdvisorCardProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const owl = useOwlEntrance()
  return (
    <Card style={styles.card} testID="cockpit-berater">
      <View style={styles.row}>
        <OwlMark variant="tinte" size={OWL_SIZE} {...owl} />
        <View style={styles.copy}>
          <Text style={styles.title} role="heading" aria-level={2}>
            {tr('cockpit.berater.title')}
          </Text>
          <Text style={styles.body}>{tr('cockpit.berater.body')}</Text>
        </View>
      </View>
      <Button variant="leise" onPress={onOpen} style={styles.cta} testID={testID}>
        {tr('cockpit.berater.cta')}
      </Button>
    </Card>
  )
}

const OWL_SIZE = 64

function makeStyles(t: UiTheme) {
  const card: ViewStyle = { borderWidth: 2, borderColor: t.color.tinte, ...t.shadow.hart }
  const row: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s4 }
  const copy: ViewStyle = { flex: 1, flexShrink: 1 }
  const title: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.xl,
    color: t.color.tinte,
    marginBottom: t.space.s1,
  }
  const body: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return { card, row, copy, title, body, cta }
}
