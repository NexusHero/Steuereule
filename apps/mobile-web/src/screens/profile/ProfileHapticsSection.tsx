import { useState } from 'react'
import { Platform, Switch, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card, hapticSelection, setHapticsEnabled, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { readHapticsPreference, writeHapticsPreference } from '../../lib/hapticsPreference'

export function ProfileHapticsSection() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const [enabled, setEnabled] = useState<boolean>(() => readHapticsPreference())
  const styles = makeStyles(t)

  if (Platform.OS === 'web') {
    return null
  }

  function handleChange(next: boolean) {
    setEnabled(next)
    writeHapticsPreference(next)
    setHapticsEnabled(next)
    if (next) {
      void hapticSelection()
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.labelCol}>
          <Text style={styles.sectionTitle}>{tr('profil.haptik.titel')}</Text>
          <Text style={styles.description}>{tr('profil.haptik.beschreibung')}</Text>
        </View>
        <Switch
          testID="profil-haptik"
          accessibilityLabel={tr('profil.haptik.titel')}
          value={enabled}
          onValueChange={handleChange}
          trackColor={{ false: t.color.linieWeich, true: t.color.funke }}
          thumbColor={t.color.karte}
        />
      </View>
    </Card>
  )
}

function makeStyles(t: UiTheme) {
  const card: ViewStyle = { marginTop: t.space.s4, padding: t.space.s4 }
  const row: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.space.s3,
  }
  const labelCol: ViewStyle = { flex: 1, gap: t.space.s1 }
  const sectionTitle: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.tinte,
  }
  const description: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
  }
  return { card, row, labelCol, sectionTitle, description }
}
