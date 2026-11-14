// How the cockpit looks: tiles, estimate, next step.
import { type ViewStyle, type TextStyle } from 'react-native'
import { type UiTheme } from '@steuereule/ui'

export function makeStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.overview.narrow
  const wideScreen: ViewStyle = t.layout.overview.wide
  const appbar: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: t.space.s4,
  }
  const appbarTitleRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const appbarTitle: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
  }
  const yearRow: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: t.space.s1,
    maxWidth: '55%',
    // Without shrinking, the chips pushed past the right edge at 375 px (#450 Teil 4).
    flexShrink: 1,
    minWidth: 0,
  }
  const takeoverRow: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: t.space.s3,
    marginTop: t.space.s3,
  }
  const takeoverRowText: TextStyle = {
    flex: 1,
    flexWrap: 'wrap',
    ...t.type.small,
    color: t.color.tinte,
  }
  const heading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
    marginBottom: t.space.s2,
    textAlign: 'center',
  }
  const help: TextStyle = {
    ...t.type.body,
    color: t.color.tinte2,
    marginBottom: t.space.s3,
    textAlign: 'center',
  }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  const secondaryCta: ViewStyle = { marginTop: t.space.s3 }
  // The advisor card sits right under the next step — advice up front, not at the bottom.
  const berater: ViewStyle = { marginTop: t.space.s4, width: '100%' }
  const emptyBlock: ViewStyle = { alignItems: 'center', paddingVertical: t.space.s6 }
  const heroLabel: TextStyle = {
    ...t.type.meta,
    color: t.color.funkeHell,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * t.size.xs,
    marginBottom: t.space.s2,
  }
  const heroValue: TextStyle = {
    ...t.type.title,
    color: t.color.funke,
    fontVariant: ['tabular-nums'],
  }
  /** The refund headline's label, in normal case so the label and figure read as one sentence. */
  const refundLabel: TextStyle = { ...heroLabel, ...t.type.metaLarge, textTransform: 'none', letterSpacing: 0 }
  /** The income once the refund leads the hero (UX review H1): still visible, no longer the headline. */
  const heroValueSmall: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.nachtText,
    fontVariant: ['tabular-nums'],
  }
  const effectLine: TextStyle = {
    ...t.type.label,
    color: t.color.funkeHell,
    marginTop: t.space.s2,
  }
  const heroDivider: ViewStyle = { height: 1, backgroundColor: t.color.nachtText, opacity: 0.2, marginVertical: t.space.s3 }
  const openItems: TextStyle = {
    ...t.type.small,
    color: t.color.nachtText,
    opacity: 0.75,
    marginTop: t.space.s2,
    marginBottom: t.space.s3,
  }
  const openItemCount: TextStyle = {
    ...t.type.small,
    color: t.color.nachtText,
    opacity: 0.85,
    marginTop: t.space.s2,
  }
  const refundLater: TextStyle = {
    ...t.type.caption,
    color: t.color.nachtText,
    opacity: 0.6,
    marginTop: t.space.s2,
  }
  const gatedHeading: TextStyle = {
    ...t.type.subhead,
    color: t.color.funke,
    marginBottom: t.space.s2,
  }
  const gatedBody: TextStyle = {
    ...t.type.body,
    color: t.color.nachtText,
    marginBottom: t.space.s2,
  }
  const euleBannerCard: ViewStyle = {
    marginBottom: t.space.s4,
  }
  const euleBannerRow: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: t.space.s3,
  }
  const euleBannerCopy: ViewStyle = {
    flex: 1,
    gap: 4,
  }
  const euleBannerTitle: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.m,
    color: t.color.tinte,
  }
  const euleBannerEffect: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
    color: t.color.ok,
  }
  const euleBannerProvenance: TextStyle = {
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.xs,
    color: t.color.kiTinte,
  }
  const euleBannerDismissBtn: ViewStyle = {
    paddingHorizontal: t.space.s2,
    paddingVertical: 4,
  }
  const euleBannerDismissText: TextStyle = {
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.xs,
    color: t.color.tinte2,
  }
  // K2: the running year's prepare mode — calm, a frame and plain ink, no signal colour.
  const runningYearNotice: ViewStyle = {
    borderWidth: 1,
    borderColor: t.color.tinte2,
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    marginBottom: t.space.s3,
  }
  const runningYearText: TextStyle = { ...t.type.small, color: t.color.tinte }

  return { runningYearNotice, runningYearText, screen, wideScreen, appbar, appbarTitleReihe: appbarTitleRow, appbarTitle, jahrReihe: yearRow, uebernahmeZeile: takeoverRow, uebernahmeZeileText: takeoverRowText, heading, help, cta, secondaryCta, berater, emptyBlock, heroLabel, refundLabel, heroValue, heroValueSmall, effectLine, heroDivider, openItems, offenePosten: openItemCount, refundLater, gatedHeading, gatedBody, euleBannerCard, euleBannerRow, euleBannerCopy, euleBannerTitle, euleBannerEffect, euleBannerProvenance, euleBannerDismissBtn, euleBannerDismissText }
}
