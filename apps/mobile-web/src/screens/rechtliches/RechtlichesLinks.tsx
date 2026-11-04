import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { RECHTLICHE_SEITEN, SEITEN_TITEL, type RechtlicheSeite } from './texte'

export interface RechtlichesLinksProps {
  readonly onSeite: (seite: RechtlicheSeite) => void
  readonly aktuell?: RechtlicheSeite
}

export function RechtlichesLinks({ onSeite, aktuell }: RechtlichesLinksProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const text = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2 }

  return (
    <View
      role="navigation"
      accessibilityLabel={tr('rechtliches.links')}
      style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: t.space.s3, marginTop: t.space.s5 }}
    >
      {RECHTLICHE_SEITEN.map((seite) =>
        seite === aktuell ? (
          <Text key={seite} style={text}>
            {SEITEN_TITEL[seite]}
          </Text>
        ) : (
          <Pressable key={seite} accessibilityRole="link" onPress={() => onSeite(seite)}>
            <Text style={{ ...text, textDecorationLine: 'underline' }}>{SEITEN_TITEL[seite]}</Text>
          </Pressable>
        ),
      )}
    </View>
  )
}
