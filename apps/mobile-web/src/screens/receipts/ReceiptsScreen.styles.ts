// How the receipts screen looks.
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
  const appbarTitle: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
  }
  const uploadCard: ViewStyle = {
    gap: t.space.s3,
    marginBottom: t.space.s3,
  }
  const uploadHeading: TextStyle = {
    ...t.type.meta,
    color: t.color.funkeHell,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * t.size.xs,
  }
  const uploadBody: TextStyle = {
    ...t.type.small,
    color: t.color.nachtText,
    opacity: 0.9,
  }
  const uploadControls: ViewStyle = {
    gap: t.space.s2,
  }
  const uploadKindLabel: TextStyle = {
    ...t.type.captionStrong,
    color: t.color.nachtText,
  }
  const uploadOkText: TextStyle = {
    ...t.type.label,
    color: t.color.funkeHell,
  }
  const uploadErrText: TextStyle = {
    ...t.type.label,
    color: t.color.warn,
  }
  const emptyBlock: ViewStyle = { alignItems: 'center', paddingVertical: t.space.s6 }
  const emptyHeading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
    textAlign: 'center',
    marginBottom: t.space.s2,
  }
  const emptyBody: TextStyle = {
    ...t.type.body,
    color: t.color.tinte2,
    textAlign: 'center',
  }
  const cardHead: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: t.space.s3,
  }
  const cardTitle: TextStyle = {
    ...t.type.bodyStrong,
    flex: 1,
    color: t.color.tinte,
  }
  const fileBadge: TextStyle = {
    ...t.type.captionStrong,
    marginTop: t.space.s2,
    color: t.color.ok,
  }
  const dates: ViewStyle = { marginTop: t.space.s3, gap: t.space.s1 }
  const dateLine: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const mono: TextStyle = { ...t.type.metaLarge, fontVariant: ['tabular-nums'] }
  const assignmentMuted: TextStyle = { ...t.type.small, color: t.color.tinte2, marginTop: t.space.s3 }
  const assignmentSettled: TextStyle = { ...t.type.label, color: t.color.tinte, marginTop: t.space.s3 }
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
    ...t.type.label,
    color: t.color.warn,
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
  const conflictHeading: TextStyle = { ...t.type.labelStrong, color: t.color.warn }
  const conflictBody: TextStyle = { ...t.type.small, color: t.color.tinte2 }

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
