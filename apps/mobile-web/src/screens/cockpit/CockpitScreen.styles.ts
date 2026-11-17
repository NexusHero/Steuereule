// How the cockpit looks: tiles, estimate, next step.
import { type ViewStyle, type TextStyle } from 'react-native'
import { type UiTheme } from '@steuereule/ui'

export function makeStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.overview.narrow
  const wideScreen: ViewStyle = t.layout.overview.wide
  const appbar: ViewStyle = {
    gap: t.space.s2,
    paddingBottom: t.space.s3,
  }
  const appbarTitleRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const appbarTitle: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
  }
  // Full width under the title: the chips wrap inside the screen (#450 Teil 4), in two lines at 375 px.
  const yearRow: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: t.space.s1,
    width: '100%',
  }
  const progress: ViewStyle = { width: '100%', gap: t.space.s1, marginTop: t.space.s3 }
  const progressBar: ViewStyle = { flexDirection: 'row', gap: 4 }
  const progressSegment: ViewStyle = { flex: 1, height: 8, borderRadius: 4, backgroundColor: t.color.linieWeich }
  const progressSegmentDone: ViewStyle = { ...progressSegment, backgroundColor: t.color.ok }
  const progressText: TextStyle = { ...t.type.small, color: t.color.tinte2 }
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
  const secondaryGrid: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space.s2,
    marginTop: t.space.s3,
    width: '100%',
  }
  const secondaryGridItem: ViewStyle = {
    flexGrow: 1,
    flexBasis: 200,
  }
  const missingBox: ViewStyle = {
    marginTop: t.space.s3,
    padding: t.space.s3,
    borderRadius: t.radius.m,
    backgroundColor: t.color.warnWeich,
    borderWidth: 1,
    borderColor: t.color.warn,
    gap: t.space.s2,
    width: '100%',
  }
  const missingToggleRow: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: t.space.s2,
  }
  const missingToggleText: TextStyle = {
    ...t.type.captionStrong,
    color: t.color.tinte,
  }
  const missingChipRow: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space.s2,
  }
  const missingChip: ViewStyle = {
    paddingHorizontal: t.space.s2,
    paddingVertical: 4,
    borderRadius: t.radius.pille,
    backgroundColor: t.color.karte,
    borderWidth: 1,
    borderColor: t.color.warn,
  }
  const missingChipText: TextStyle = {
    ...t.type.captionStrong,
    color: t.color.tinte,
  }
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

  return { progress, progressBar, progressSegment, progressSegmentDone, progressText, runningYearNotice, runningYearText, screen, wideScreen, appbar, appbarTitleReihe: appbarTitleRow, appbarTitle, jahrReihe: yearRow, uebernahmeZeile: takeoverRow, uebernahmeZeileText: takeoverRowText, heading, help, cta, secondaryCta, secondaryGrid, secondaryGridItem, missingBox, missingToggleRow, missingToggleText, missingChipRow, missingChip, missingChipText, berater, emptyBlock, heroLabel, refundLabel, heroValue, heroValueSmall, effectLine, heroDivider, openItems, offenePosten: openItemCount, refundLater, gatedHeading, gatedBody, euleBannerCard, euleBannerRow, euleBannerCopy, euleBannerTitle, euleBannerEffect, euleBannerProvenance, euleBannerDismissBtn, euleBannerDismissText }
}
