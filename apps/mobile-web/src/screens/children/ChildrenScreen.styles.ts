// How the children mask looks.
import { type TextStyle, type ViewStyle } from 'react-native'
import { type UiTheme } from '@steuereule/ui'

export function makeStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', marginBottom: t.space.s4 }
  const heading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const help: TextStyle = { ...t.type.body, color: t.color.tinte2, marginBottom: t.space.s4 }
  const summaryCard: ViewStyle = {
    padding: t.space.s4,
    marginBottom: t.space.s4,
    backgroundColor: t.color.karte,
    borderWidth: t.space.kontur,
    borderColor: t.color.funke,
    borderRadius: t.radius.m,
  }
  const summaryTitle: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const summaryRow: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: t.space.s1,
  }
  const summaryLabel: TextStyle = {
    ...t.type.body,
    color: t.color.tinte2,
  }
  const summaryValue: TextStyle = {
    ...t.type.bodyStrong,
    color: t.color.tinte,
  }
  const summarySubLabel: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
    paddingLeft: t.space.s2,
  }
  const summarySubValue: TextStyle = {
    ...t.type.small,
    color: t.color.tinte,
  }
  const childCard: ViewStyle = {
    padding: t.space.s4,
    marginBottom: t.space.s3,
    backgroundColor: t.color.karte,
    borderRadius: t.radius.m,
  }
  const childHeader: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: t.space.s2,
  }
  const childName: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.tinte,
  }
  const deleteButton: TextStyle = {
    ...t.type.small,
    color: t.color.fehler,
  }
  const childActions: ViewStyle = { flexDirection: 'row', gap: t.space.s3 }
  const editButton: TextStyle = { ...t.type.small, color: t.color.tinte }
  const gap: TextStyle = { ...t.type.small, color: t.color.fehler, marginTop: t.space.s2 }
  const chips: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }
  const copyBox: ViewStyle = { gap: t.space.s2, marginBottom: t.space.s4 }
  const officeBox: ViewStyle = { gap: t.space.s2, marginTop: -t.space.s2, marginBottom: t.space.s3 }
  const suggestion: TextStyle = { ...t.type.captionStrong, color: t.color.ki, marginTop: -t.space.s2, marginBottom: t.space.s3 }
  const childDetail: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
    marginVertical: 2,
  }
  const formCard: ViewStyle = {
    padding: t.space.s4,
    marginVertical: t.space.s4,
    backgroundColor: t.color.karte,
    borderRadius: t.radius.m,
  }
  const formTitle: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.tinte,
    marginBottom: t.space.s3,
  }
  const addButton: ViewStyle = {
    marginTop: t.space.s3,
  }
  const toggleButton: ViewStyle = {
    marginVertical: t.space.s3,
  }
  const cta: ViewStyle = {
    marginTop: t.space.s5,
    marginBottom: t.space.s6,
  }
  return {
    screen,
    wideScreen,
    headerRow,
    heading,
    help,
    summaryCard,
    summaryTitle,
    summaryRow,
    summaryLabel,
    summaryValue,
    summarySubLabel,
    summarySubValue,
    kindCard: childCard,
    kindHeader: childHeader,
    kindName: childName,
    deleteButton,
    kindActions: childActions,
    editButton,
    luecke: gap,
    chips,
    copyBox,
    officeBox,
    suggestion,
    kindDetail: childDetail,
    formCard,
    formTitle,
    addButton,
    toggleButton,
    cta,
  }
}
