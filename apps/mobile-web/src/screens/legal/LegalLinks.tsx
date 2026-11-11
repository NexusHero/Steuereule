import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { LEGAL_PAGES, PAGE_TITLES, type LegalPage } from './texts'

export interface LegalLinksProps {
  readonly onPage: (page: LegalPage) => void
  readonly current?: LegalPage
}

export function LegalLinks({ onPage, current }: LegalLinksProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const text = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2 }

  return (
    <View
      role="navigation"
      accessibilityLabel={tr('rechtliches.links')}
      style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: t.space.s3, marginTop: t.space.s5 }}
    >
      {LEGAL_PAGES.map((page) =>
        page === current ? (
          <Text key={page} style={text}>
            {PAGE_TITLES[page]}
          </Text>
        ) : (
          <Pressable key={page} accessibilityRole="link" onPress={() => onPage(page)} testID={`rechtliches-link-${page}`}>
            <Text style={{ ...text, textDecorationLine: 'underline' }}>{PAGE_TITLES[page]}</Text>
          </Pressable>
        ),
      )}
    </View>
  )
}
