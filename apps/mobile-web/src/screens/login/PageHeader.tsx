import { useState } from 'react'
import { View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { type UiTheme } from '@steuereule/ui'
import type { Tr } from '../shared/tr'
import { OwlMark } from '../../marks/OwlMark'
import { useOwlEntrance } from '../../marks/useOwlEntrance'
import { BetaBadge, BetaNotice } from '../shared/BetaNotice'

interface PageHeaderProps {
  readonly tr: Tr
  readonly t: UiTheme
  readonly showDivider: boolean
}

export function PageHeader({ tr, t, showDivider }: PageHeaderProps) {
  const styles = makeStyles(t)
  const owl = useOwlEntrance()
  const [betaOpen, setBetaOpen] = useState(false)
  // The lockup (Graphit): the animated owl as the symbol, the name written out, the BETA mark beside
  // it. The heading reads "SteuerEule" as one word; the mark is not part of the name. Pressing the mark
  // shows the written-out beta notice under the lockup.
  return (
    <View style={styles.header}>
      <View style={styles.lockup}>
        <View style={styles.wordmarkRow} role="heading" aria-level={1} testID="login-splash">
          <OwlMark variant="tinte" size={OWL_SIZE} {...owl} />
          <Text style={styles.wordmark}>{`${tr('brand.steuer')}${tr('brand.eule')}`}</Text>
        </View>
        <BetaBadge open={betaOpen} onToggle={() => setBetaOpen((open) => !open)} />
      </View>
      {betaOpen ? <BetaNotice /> : null}
      {showDivider ? <View style={styles.headerDivider} /> : null}
    </View>
  )
}

const OWL_SIZE = 52

function makeStyles(t: UiTheme) {
  const header: ViewStyle = { width: '100%' }
  const lockup: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.s3,
    paddingTop: t.space.s4,
    marginBottom: t.space.s5,
  }
  const wordmarkRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3 }
  const wordmark: TextStyle = {
    ...t.type.title,
    letterSpacing: -0.03 * t.size['3xl'],
    color: t.color.tinte,
  }
  const headerDivider: ViewStyle = { height: 2, backgroundColor: t.color.linieWeich, borderRadius: 1, marginTop: t.space.s5, marginBottom: t.space.s5, width: '100%' }
  return { header, lockup, wordmarkRow, wordmark, headerDivider }
}
