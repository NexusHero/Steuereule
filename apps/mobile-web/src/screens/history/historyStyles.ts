import type { TextStyle, ViewStyle } from 'react-native'
import type { UiTheme } from '@steuereule/ui'

/** The Verlauf's shared pieces (mock: `.karte`, `.pille`, `.eule`, `.detail`), in the Funke tokens. */
export function historyStyles(t: UiTheme) {
  const card: ViewStyle = { backgroundColor: t.color.karte, borderWidth: t.space.kontur, borderColor: t.color.linie, borderRadius: t.radius.m, padding: t.space.s4, gap: t.space.s3, minWidth: 0 }
  const cardTitle: TextStyle = { ...t.type.subhead, color: t.color.tinte }
  const sub: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const eyebrow: TextStyle = { ...t.type.meta, color: t.color.tinte2, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs }
  const muted: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const body: TextStyle = { ...t.type.small, color: t.color.tinte }
  const strong: TextStyle = { ...t.type.labelStrong, color: t.color.tinte }
  const figure: TextStyle = { ...t.type.figure, color: t.color.tinte, fontVariant: ['tabular-nums'] }
  const pill: TextStyle = {
    ...t.type.captionStrong,
    color: t.color.tinte,
    borderWidth: 1,
    borderColor: t.color.linie,
    borderRadius: t.radius.pille,
    paddingHorizontal: t.space.s2,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  }
  const pillBescheid: TextStyle = { backgroundColor: t.color.okWeich }
  const pillSchaetzung: TextStyle = { backgroundColor: t.color.warnWeich, borderStyle: 'dashed' }
  const pillOffen: TextStyle = { backgroundColor: 'transparent', borderStyle: 'dotted', color: t.color.tinte2 }
  const pillEck: TextStyle = { backgroundColor: t.color.kiWeich }
  const pillLstb: TextStyle = { backgroundColor: t.color.funkeWeich }
  const pillAbweichung: TextStyle = { backgroundColor: t.color.fehlerWeich }
  const owlBox: ViewStyle = { flexDirection: 'row', gap: t.space.s2, alignItems: 'flex-start', backgroundColor: t.color.kiWeich, borderRadius: t.radius.s, paddingHorizontal: t.space.s3, paddingVertical: t.space.s2 }
  const owlLabel: TextStyle = { ...t.type.meta, color: t.color.kiTinte, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs, paddingTop: 2 }
  const owlText: TextStyle = { ...t.type.small, color: t.color.kiTinte, flex: 1 }
  const detail: ViewStyle = { borderWidth: t.space.kontur, borderColor: t.color.linie, borderRadius: t.radius.s, padding: t.space.s3, backgroundColor: t.color.grund, gap: 6 }
  const detailHead: ViewStyle = { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: t.space.s2, flexWrap: 'wrap' }
  const detailYear: TextStyle = { ...t.type.itemTitle, color: t.color.tinte }
  const line: ViewStyle = { flexDirection: 'row', justifyContent: 'space-between', gap: t.space.s3 }
  const lineSum: ViewStyle = { borderTopWidth: 1, borderTopColor: t.color.linieWeich, paddingTop: 4 }
  const lineLabel: TextStyle = { ...t.type.small, color: t.color.tinte, flexShrink: 1 }
  const lineValue: TextStyle = { ...t.type.metaLarge, color: t.color.tinte, textAlign: 'right', fontVariant: ['tabular-nums'] }
  const trend: TextStyle = { ...t.type.meta, color: t.color.tinte2 }
  const trendGood: TextStyle = { color: t.color.ok }
  const trendBad: TextStyle = { color: t.color.fehler }
  const hint: TextStyle = { ...t.type.small, color: t.color.tinte, backgroundColor: t.color.warnWeich, borderRadius: t.radius.s, paddingHorizontal: t.space.s3, paddingVertical: 6 }
  return {
    card, cardTitle, sub, eyebrow, muted, body, strong, figure, pill, pillBescheid, pillSchaetzung, pillOffen, pillEck, pillLstb, pillAbweichung, owlBox, owlLabel, owlText,
    detail, detailHead, detailYear, line, lineSum, lineLabel, lineValue, trend, trendGood, trendBad, hint,
  }
}
