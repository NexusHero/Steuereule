import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTheme, type UiTheme } from '@steuereule/ui'

interface ItemNoticeProps {
  /** The derived item's amount in whole euros; `undefined` while the item is still open. */
  readonly amount: number | undefined
  readonly openLabel: string
  readonly heading: string
  readonly source: string
}

/** The item a mask derives from its fields — or the note that it is still open. */
export function ItemNotice({ amount, openLabel, heading, source }: ItemNoticeProps) {
  const s = makeStyles(useTheme())

  if (amount === undefined) {
    return <Text style={s.itemsOpen}>{openLabel}</Text>
  }
  return (
    <View style={s.itemsBlock}>
      <Text style={s.itemsHeading}>{heading}</Text>
      <Text style={s.itemAmount}>{`${amount} €`}</Text>
      <Text style={s.itemSource}>{source}</Text>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const itemsBlock: ViewStyle = { marginVertical: t.space.s3, padding: t.space.s3, borderWidth: t.space.kontur, borderColor: t.color.linie, borderRadius: t.radius.s }
  const itemsHeading: TextStyle = { ...t.type.itemTitle, color: t.color.tinte, marginBottom: t.space.s1 }
  const itemAmount: TextStyle = { ...t.type.headline, color: t.color.tinte }
  const itemSource: TextStyle = { ...t.type.small, color: t.color.tinte2, marginTop: t.space.s1 }
  const itemsOpen: TextStyle = { ...t.type.body, color: t.color.tinte2, marginVertical: t.space.s3 }
  return { itemsBlock, itemsHeading, itemAmount, itemSource, itemsOpen }
}
