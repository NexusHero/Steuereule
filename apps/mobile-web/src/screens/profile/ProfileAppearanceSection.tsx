import { Text, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card, Option, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useAppearance, type AppearancePreference } from '../../lib/appearance'

const OPTIONS: ReadonlyArray<{ readonly value: AppearancePreference; readonly labelKey: string; readonly testID: string }> = [
  { value: 'system', labelKey: 'profil.darstellung.system', testID: 'profil-darstellung-system' },
  { value: 'light', labelKey: 'profil.darstellung.hell', testID: 'profil-darstellung-hell' },
  { value: 'dark', labelKey: 'profil.darstellung.dunkel', testID: 'profil-darstellung-dunkel' },
]

export function ProfileAppearanceSection() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const { preference, setPreference } = useAppearance()
  const styles = makeStyles(t)

  return (
    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>{tr('profil.darstellung.titel')}</Text>
      {OPTIONS.map((opt, index) => (
        <Option
          key={opt.value}
          selected={preference === opt.value}
          onPress={() => setPreference(opt.value)}
          testID={opt.testID}
          style={index === OPTIONS.length - 1 ? styles.lastOption : undefined}
        >
          {tr(opt.labelKey)}
        </Option>
      ))}
    </Card>
  )
}

function makeStyles(t: UiTheme) {
  const card: ViewStyle = { marginTop: t.space.s4, padding: t.space.s4 }
  const sectionTitle: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.l,
    color: t.color.tinte,
    marginBottom: t.space.s3,
  }
  const lastOption: ViewStyle = { marginBottom: 0 }
  return { card, sectionTitle, lastOption }
}
