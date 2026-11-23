import type { TextStyle, ViewStyle } from 'react-native'
import type { UiTheme } from '@steuereule/ui'

/** Styles shared by every part of the Grenzgänger mask. */
export function makeStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, marginBottom: t.space.s3 }
  const heading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const mark: TextStyle = { color: t.color.funke }
  const help: TextStyle = { ...t.type.body, color: t.color.tinte2, marginBottom: t.space.s3 }
  const sectionTitle: TextStyle = { ...t.type.cardTitle, color: t.color.tinte, marginBottom: t.space.s2 }
  const statusCard: ViewStyle = { marginTop: t.space.s4 }
  const statusRow: TextStyle = { ...t.type.body, color: t.color.tinte, marginBottom: t.space.s1 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  const uploadCard: ViewStyle = {
    marginBottom: t.space.s3,
    padding: t.space.s3,
    backgroundColor: t.color.karte,
    borderWidth: 1.5,
    borderColor: t.color.funke,
  }
  const uploadHeaderRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: t.space.s3,
  }
  const uploadTitle: TextStyle = { ...t.type.emphasis, color: t.color.tinte, marginBottom: t.space.s1 }
  const uploadBody: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const uploadStatusOk: TextStyle = { ...t.type.small, color: t.color.ok, marginTop: t.space.s2 }
  const uploadStatusError: TextStyle = { ...t.type.small, color: t.color.warn, marginTop: t.space.s2 }
  const missingFieldsCard: ViewStyle = {
    marginBottom: t.space.s4,
    padding: t.space.s3,
    backgroundColor: t.color.karte,
    borderWidth: 1.5,
    borderColor: t.color.warn,
  }
  const missingHeaderRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: t.space.s2,
  }
  const missingBadgeText: TextStyle = { ...t.type.captionStrong, color: t.color.tinte }
  const missingChipsRow: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }
  const missingChip: ViewStyle = {
    paddingHorizontal: t.space.s2,
    paddingVertical: t.space.s1,
    borderRadius: t.radius.s,
    backgroundColor: t.color.karte,
    borderWidth: 1,
    borderColor: t.color.linie,
  }
  const missingChipText: TextStyle = { ...t.type.caption, color: t.color.tinte }
  const requiredFieldWrapper: ViewStyle = {
    paddingLeft: t.space.s2,
    borderLeftWidth: 3,
    borderLeftColor: t.color.funke,
    marginBottom: t.space.s1,
  }
  const requiredBadgeRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  }
  const requiredBadgeText: TextStyle = {
    ...t.type.captionStrong,
    color: t.color.tinte2,
    textTransform: 'uppercase',
  }
  const liveSumBanner: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: t.space.s2,
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    marginBottom: t.space.s2,
    borderRadius: t.radius.s,
    backgroundColor: t.color.funkeHell,
    borderWidth: 1,
    borderColor: t.color.funke,
  }
  const liveSumText: TextStyle = { ...t.type.small, color: t.color.tinte }
  const liveSumApplyBtn: ViewStyle = {
    paddingHorizontal: t.space.s2,
    paddingVertical: 4,
    borderRadius: t.radius.s,
    backgroundColor: t.color.funke,
  }
  const liveSumApplyText: TextStyle = { ...t.type.captionStrong, color: t.color.nacht }
  const employerPickerBox: ViewStyle = {
    marginBottom: t.space.s3,
    padding: t.space.s3,
    borderRadius: t.radius.s,
    backgroundColor: t.color.karte,
  }
  const employerPickerLabel: TextStyle = { ...t.type.small, color: t.color.tinte2, marginBottom: t.space.s2 }
  const employerChipsRow: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }
  return {
    screen,
    wideScreen,
    headerRow,
    heading,
    mark,
    help,
    sectionTitle,
    statusCard,
    standRow: statusRow,
    cta,
    uploadCard,
    uploadHeaderRow,
    uploadTitle,
    uploadBody,
    uploadStatusOk,
    uploadStatusError,
    missingFieldsCard,
    missingHeaderRow,
    missingBadgeText,
    missingChipsRow,
    missingChip,
    missingChipText,
    requiredFieldWrapper,
    requiredBadgeRow,
    requiredBadgeText,
    liveSumBanner,
    liveSumText,
    liveSumApplyBtn,
    liveSumApplyText,
    employerPickerBox,
    employerPickerLabel,
    employerChipsRow,
  }
}
