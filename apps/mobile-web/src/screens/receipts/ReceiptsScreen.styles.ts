// How the receipts screen looks.
import { type ViewStyle, type TextStyle } from 'react-native'
import { WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'

export function makeStyles(t: UiTheme) {
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wideScreen: ViewStyle = { ...screen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const appbar: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: t.space.s4,
  }
  const appbarTitle: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['2xl'],
    color: t.color.tinte,
  }
  const uploadCard: ViewStyle = {
    gap: t.space.s3,
    marginBottom: t.space.s3,
  }
  const uploadHeading: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    color: t.color.funkeHell,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * t.size.xs,
  }
  const uploadBody: TextStyle = {
    color: t.color.nachtText,
    opacity: 0.9,
    fontFamily: t.font.text,
    fontSize: t.size.s,
  }
  const uploadControls: ViewStyle = {
    gap: t.space.s2,
  }
  const uploadKindLabel: TextStyle = {
    color: t.color.nachtText,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.xs,
  }
  const uploadOkText: TextStyle = {
    color: t.color.funkeHell,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
  }
  const uploadErrText: TextStyle = {
    color: t.color.warn,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
  }
  const emptyBlock: ViewStyle = { alignItems: 'center', paddingVertical: t.space.s6 }
  const emptyHeading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
    textAlign: 'center',
    marginBottom: t.space.s2,
  }
  const emptyBody: TextStyle = {
    color: t.color.tinte2,
    fontFamily: t.font.text,
    fontSize: t.size.m,
    textAlign: 'center',
  }
  const cardHead: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: t.space.s3,
  }
  const cardTitle: TextStyle = {
    flex: 1,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.m,
    color: t.color.tinte,
  }
  const fileBadge: TextStyle = {
    marginTop: t.space.s2,
    color: t.color.ok,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.xs,
  }
  const dates: ViewStyle = { marginTop: t.space.s3, gap: t.space.s1 }
  const dateLine: TextStyle = { color: t.color.tinte2, fontSize: t.size.s }
  const mono: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.s, fontVariant: ['tabular-nums'] }
  const assignmentMuted: TextStyle = { color: t.color.tinte2, fontSize: t.size.s, marginTop: t.space.s3 }
  const assignmentSettled: TextStyle = { color: t.color.tinte, fontWeight: t.weight.fett, fontSize: t.size.s, marginTop: t.space.s3 }
  const proposalRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, marginTop: t.space.s3, flexWrap: 'wrap' }
  const actionRow: ViewStyle = { flexDirection: 'row', gap: t.space.s3, marginTop: t.space.s3, flexWrap: 'wrap' }
  const cardFooter: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.s2,
    marginTop: t.space.s3,
    flexWrap: 'wrap',
  }
  const compactButton: ViewStyle = {
    width: 'auto',
    minHeight: 40,
    paddingHorizontal: t.space.s4,
  }
  const deleteConfirmRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.s2,
    flexWrap: 'wrap',
  }
  const deleteConfirmText: TextStyle = {
    color: t.color.warn,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
  }
  const conflictBox: ViewStyle = {
    marginTop: t.space.s3,
    borderWidth: 2,
    borderColor: t.color.warn,
    borderRadius: t.radius.s,
    padding: t.space.s3,
    backgroundColor: t.color.warnWeich,
    gap: t.space.s2,
  }
  const conflictHeading: TextStyle = { color: t.color.warn, fontWeight: t.weight.schwer, fontSize: t.size.s }
  const conflictBody: TextStyle = { color: t.color.tinte2, fontSize: t.size.s }

  return {
    screen,
    wideScreen,
    appbar,
    appbarTitle,
    uploadCard,
    uploadHeading,
    uploadBody,
    uploadControls,
    uploadKindLabel,
    uploadOkText,
    uploadErrText,
    emptyBlock,
    emptyHeading,
    emptyBody,
    cardHead,
    cardTitle,
    fileBadge,
    dates,
    dateLine,
    mono,
    zuordnungMuted: assignmentMuted,
    zuordnungSettled: assignmentSettled,
    vorschlagRow: proposalRow,
    actionRow,
    cardFooter,
    compactButton,
    deleteConfirmRow,
    deleteConfirmText,
    konfliktBox: conflictBox,
    konfliktHeading: conflictHeading,
    konfliktBody: conflictBody,
  }
}
