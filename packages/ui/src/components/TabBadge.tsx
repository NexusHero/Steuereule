import { View, type ViewStyle } from 'react-native'
import { useTheme } from '../theme/useTheme'

const DOT = 8

/** The name of a tab that has something waiting: its label, then what waits ("Eule, neue Antwort"). */
export function tabName(label: string, badge: string | undefined): string | undefined {
  return badge === undefined ? undefined : `${label}, ${badge}`
}

/**
 * The mark of a tab that has something waiting: an ink dot. Ink, not lime: lime is
 * the selection, and the dot has to show on the lime pill as well. The words are in the tab's name
 * (`tabName`), so the dot itself is hidden from assistive tech.
 */
export function TabBadge({ onAccent = false, inline = false }: { readonly onAccent?: boolean; readonly inline?: boolean }) {
  const t = useTheme()
  // In a row with the label beside the icon the dot ends the row; over a stacked icon it sits at the icon's corner.
  const place: ViewStyle = inline ? { marginLeft: 'auto' } : { position: 'absolute', top: 6, right: '28%' }
  const dot: ViewStyle = {
    ...place,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: onAccent && t.mode === 'dark' ? t.color.nacht : t.color.tinte,
  }
  return <View style={dot} aria-hidden testID="tab-badge" />
}
