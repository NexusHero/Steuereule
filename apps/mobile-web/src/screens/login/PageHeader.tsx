// The Login screen's page header — the wordmark as the page's real title (C2, #283), the demoted
// greeting subheading, the subtitle, and the shared divider. Extracted from LoginScreen.tsx so
// the header's heading-semantics decision (Musti's #298 review, F8) lives in one small file
// instead of riding inside a 700-line screen.
import { View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { type UiTheme } from '@steuereule/ui'
import type { Tr } from '../shared/tr'

interface PageHeaderProps {
  readonly tr: Tr
  readonly t: UiTheme
  /** C1/C2 (#283, stakeholder ruling) — the wordmark is the page's title, sitting above both
   *  columns, with a shared divider underneath when there actually are two columns to share it.
   *  At `s` (one column) or on the unverified stage there is nothing to divide. */
  readonly showDivider: boolean
}

export function PageHeader({ tr, t, showDivider }: PageHeaderProps) {
  const styles = makeStyles(t)
  return (
    <View style={styles.header}>
      {/* C2 — the wordmark is the page's real title now (level 1); the former greeting is
          visually a subheading and, per Musti's #298 review (F8), must be one semantically
          too — `role="heading"`/`aria-level` (react-native-web forwards both straight through,
          RN's own `accessibilityRole="header"` alone maps to `role="heading"` but carries no
          level, which the DOM/ARIA default to 2 regardless — explicit here so it's not an
          accident of a spec default). */}
      <Text style={styles.wordmark} role="heading" aria-level={1}>
        {tr('brand.steuer')}
        <Text style={{ color: t.color.funkeTinte }}>{tr('brand.eule')}</Text>
      </Text>
      <Text style={styles.subheading} role="heading" aria-level={2}>
        {tr('login.greetingBefore')}
        <Text style={{ color: t.color.funkeTinte }}>{tr('login.greetingMark')}</Text>
        {tr('login.greetingAfter')}
      </Text>
      <Text style={styles.subtitle}>{tr('login.subtitle')}</Text>
      {showDivider ? <View style={styles.headerDivider} /> : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const header: ViewStyle = { width: '100%' }
  const wordmark: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['3xl'], color: t.color.tinte, marginBottom: t.space.s2 }
  const subheading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.l, color: t.color.tinte, marginBottom: t.space.s1 }
  const subtitle: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m }
  const headerDivider: ViewStyle = { height: 2, backgroundColor: t.color.linieWeich, borderRadius: 1, marginTop: t.space.s5, marginBottom: t.space.s5, width: '100%' }
  return { header, wordmark, subheading, subtitle, headerDivider }
}
