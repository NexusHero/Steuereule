import { Text, View, type GestureResponderEvent, type TextProps } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { LEGAL_PAGES, PAGE_TITLES, type LegalPage } from './texts'

/** The app's own route of a legal page (`linking.ts`: `rechtliches/:page`). */
export const legalHref = (page: LegalPage): string => `/rechtliches/${page}`

export interface LegalLinkProps {
  readonly page: LegalPage
  /** In-app navigation; without it the link is followed as a plain web link to `legalHref(page)`. */
  readonly onPage?: ((page: LegalPage) => void) | undefined
  readonly style?: TextProps['style']
  readonly children?: string
}

/**
 * One legal page as a real link (WEB-7): on the web an `<a href="/rechtliches/…">`, so it works from
 * every screen and is announced as a link. With `onPage` the click stays inside the app's navigation.
 */
export function LegalLink({ page, onPage, style, children }: LegalLinkProps) {
  const onPress = onPage
    ? (event: GestureResponderEvent) => {
        event.preventDefault()
        onPage(page)
      }
    : undefined
  return (
    <Text
      accessibilityRole="link"
      {...({ href: legalHref(page) } as object)}
      {...(onPress ? { onPress } : {})}
      style={style}
      testID={`rechtliches-link-${page}`}
    >
      {children ?? PAGE_TITLES[page]}
    </Text>
  )
}

export interface LegalLinksProps {
  readonly onPage?: ((page: LegalPage) => void) | undefined
  readonly current?: LegalPage
}

export function LegalLinks({ onPage, current }: LegalLinksProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const text = { ...t.type.caption, color: t.color.tinte2 }

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
          <LegalLink key={page} page={page} onPage={onPage} style={{ ...text, textDecorationLine: 'underline', paddingVertical: t.space.s3 }} />
        ),
      )}
    </View>
  )
}
