import { useContext } from 'react'
import { Pressable, Text, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { NavigationContext } from '@react-navigation/native'
import type { Screen } from '@steuereule/core'
import { useTheme, type UiTheme, controlLine } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { formLineForField } from '../shared/formLineMapping'

/** The Vordruck a mask fills, so the form screen opens on the right one. */
const FORM_FOR_SCREEN: Partial<Record<Screen, string>> = {
  lstb: 'anlage-n',
  commute: 'anlage-n',
  chLohnausweis: 'anlage-n-gre',
  kind: 'anlage-kind',
  vermietung: 'anlage-v',
  kapital: 'anlage-kap',
  rente: 'anlage-r',
}

export interface OfficialFormLinkProps {
  readonly screen: Screen
  readonly taxYear: number
}

/**
 * A mask's way to its official Vordruck, opened on its own wide screen. Renders nothing outside a
 * navigator (e.g. a mask rendered standalone in a test or preview).
 */
export function OfficialFormLink({ screen, taxYear }: OfficialFormLinkProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const navigation = useContext(NavigationContext)
  if (!navigation) return null

  const form = FORM_FOR_SCREEN[screen] ?? 'est-1-a'
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => navigation.navigate('Cockpit', { screen: 'OfficialForm', params: { year: taxYear, form } })}
      style={styles.link}
      testID="official-form-link"
    >
      <Text style={styles.text}>{`📄 ${tr('formular.oeffnen', { form: formLineForField(screen).form })} →`}</Text>
    </Pressable>
  )
}

function makeStyles(t: UiTheme) {
  const link: ViewStyle = {
    alignSelf: 'flex-start',
    paddingVertical: t.space.s3,
    paddingHorizontal: t.space.s4,
    borderRadius: t.radius.m,
    borderWidth: t.space.kontur,
    borderColor: controlLine(t),
    backgroundColor: t.color.karte,
    marginTop: t.space.s4,
    maxWidth: '100%',
  }
  const text: TextStyle = { ...t.type.small, fontWeight: t.weight.fett, color: t.color.tinte, flexShrink: 1 }
  return { link, text }
}
