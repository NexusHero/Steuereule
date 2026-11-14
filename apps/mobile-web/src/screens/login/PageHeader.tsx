import { View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { type UiTheme } from '@steuereule/ui'
import type { Tr } from '../shared/tr'
import { OwlMark } from '../../marks/OwlMark'
import { useOwlEntrance } from '../../marks/useOwlEntrance'

interface PageHeaderProps {
  readonly tr: Tr
  readonly t: UiTheme
  readonly showDivider: boolean
}

export function PageHeader({ tr, t, showDivider }: PageHeaderProps) {
  const styles = makeStyles(t)
  const owl = useOwlEntrance()
  // Wordmark as a splash: "Steuer" + the animated owl in place of the word "Eule", centred and
  // large, so the owl greets you before anything else. The word stays in the heading, visually
  // hidden, so the h1 still reads "SteuerEule".
  return (
    <View style={styles.header}>
      <View style={styles.wordmarkRow} role="heading" aria-level={1} testID="login-splash">
        <Text style={styles.wordmark}>{tr('brand.steuer')}</Text>
        <OwlMark variant="tinte" size={OWL_SIZE} {...owl} />
        <Text style={styles.visuallyHidden}>{tr('brand.eule')}</Text>
      </View>
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

const OWL_SIZE = 84

function makeStyles(t: UiTheme) {
  const header: ViewStyle = { width: '100%' }
  const wordmarkRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: t.space.s1,
    paddingTop: t.space.s4,
    marginBottom: t.space.s5,
  }
  const wordmark: TextStyle = {
    ...t.type.hero,
    letterSpacing: -0.03 * t.size.held,
    color: t.color.tinte,
  }
  const visuallyHidden: TextStyle = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }
  const subheading: TextStyle = { ...t.type.emphasis, color: t.color.tinte, marginBottom: t.space.s1 }
  const subtitle: TextStyle = { ...t.type.body, color: t.color.tinte2 }
  const headerDivider: ViewStyle = { height: 2, backgroundColor: t.color.linieWeich, borderRadius: 1, marginTop: t.space.s5, marginBottom: t.space.s5, width: '100%' }
  return { header, wordmarkRow, wordmark, visuallyHidden, subheading, subtitle, headerDivider }
}
