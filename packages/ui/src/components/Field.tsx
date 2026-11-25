import { View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { Children, cloneElement, isValidElement, type ReactNode } from 'react'
import { useTheme } from '../theme/useTheme'
import { Input, type InputProps } from './Input'

export interface FieldProps {
  readonly label: string
  readonly error?: string
  readonly children: ReactNode
}

/**
 * The visible label is also the input's accessible name (WEB-19): a single `Input` child without an
 * `accessibilityLabel` of its own gets the label, so a screen reader never meets a nameless field.
 * Composite children (pickers, amount rows) name their own controls and are left alone.
 */
function namedByLabel(children: ReactNode, label: string): ReactNode {
  if (Children.count(children) !== 1 || !isValidElement<InputProps>(children) || children.type !== Input) return children
  if (children.props.accessibilityLabel !== undefined) return children
  return cloneElement(children, { accessibilityLabel: label })
}

export function Field({ label, error, children }: FieldProps) {
  const t = useTheme()
  const wrap: ViewStyle = { marginBottom: t.space.s3 }
  const labelStyle: TextStyle = {
    fontSize: t.size.s,
    fontWeight: t.weight.fett,
    color: t.color.tinte,
    marginBottom: t.space.s1,
  }
  const errorStyle: TextStyle = { color: t.color.fehler, fontSize: t.size.s, marginTop: t.space.s1 }
  return (
    <View style={wrap}>
      <Text style={labelStyle}>{label}</Text>
      {namedByLabel(children, label)}
      {error !== undefined && error !== '' ? (
        <Text style={errorStyle} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  )
}
