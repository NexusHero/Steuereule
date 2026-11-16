import { Switch, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useExpertMode, writeExpertMode } from '../../lib/expertModePreference'

export function ProfileExpertModeSection() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const enabled = useExpertMode()
  const styles = makeStyles(t)

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.labelCol}>
          <Text style={styles.sectionTitle}>{tr('profil.expertenmodus.titel')}</Text>
          <Text style={styles.description}>{tr('profil.expertenmodus.beschreibung')}</Text>
        </View>
        <Switch
          testID="profil-expertenmodus"
          accessibilityLabel={tr('profil.expertenmodus.titel')}
          value={enabled}
          onValueChange={writeExpertMode}
          trackColor={{ false: t.color.linieWeich, true: t.color.funke }}
          thumbColor={t.color.karte}
        />
      </View>
    </Card>
  )
}

function makeStyles(t: UiTheme) {
  const card: ViewStyle = { marginTop: t.space.s4, padding: t.space.s4 }
  const row: ViewStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.s3 }
  const labelCol: ViewStyle = { flex: 1, gap: t.space.s1 }
  const sectionTitle: TextStyle = { ...t.type.cardTitle, color: t.color.tinte }
  const description: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  return { card, row, labelCol, sectionTitle, description }
}
