// Interview-Antwortoption (fk-opt) — ported from the design system unchanged (Option.jsx /
// Option.d.ts, `finanzo-funke-design-system/project/components/forms/`): one large answer
// button per row, selected = lime fill + hard shadow. `aria-pressed` carries selection state
// (`gewaehlt`), not the Pressable's own transient press — the DS component is exactly that
// binary: chosen or not.
import { Pressable, Text, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import { type ReactNode } from 'react'
import { useTheme } from '../theme/useTheme'

export interface OptionProps {
  /** Selected — lime fill + hard shadow (komponenten.css `.fk-opt[aria-pressed="true"]`). */
  readonly gewaehlt?: boolean
  readonly onPress?: () => void
  readonly style?: StyleProp<ViewStyle>
  readonly children: ReactNode
  readonly testID?: string
}

export function Option({ gewaehlt = false, onPress, style, children, testID }: OptionProps) {
  const t = useTheme()
  const container: ViewStyle = {
    width: '100%',
    minHeight: 52,
    justifyContent: 'center',
    padding: t.space.s4,
    marginBottom: t.space.s3,
    backgroundColor: gewaehlt ? t.color.funke : t.color.karte,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
    ...(gewaehlt ? t.shadow.hartS : null),
  }
  const label: TextStyle = {
    textAlign: 'left',
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.m,
    color: t.color.tinte,
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      aria-pressed={gewaehlt}
      onPress={onPress}
      style={({ pressed }) => [
        container,
        // Unselected press feedback only — the selected look already carries its own
        // permanent shadow (komponenten.css `:hover`, the closest RN-portable analogue
        // to a touch/press affordance on the still-unselected row).
        pressed && !gewaehlt && { transform: [{ translateX: -1 }, { translateY: -1 }], ...t.shadow.hartS },
        style,
      ]}
    >
      {typeof children === 'string' ? <Text style={label}>{children}</Text> : children}
    </Pressable>
  )
}
