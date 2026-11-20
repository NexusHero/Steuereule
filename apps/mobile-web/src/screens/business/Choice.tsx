import { Option, type OptionProps } from '@steuereule/ui'

/** An option that sizes to its content, for chips in a row (the UI package's Option is a full-width row). */
export function Choice({ style, ...rest }: OptionProps) {
  return <Option {...rest} style={[{ width: 'auto', marginBottom: 0, flexShrink: 0 }, style]} />
}
