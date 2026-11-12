import { useState } from 'react'
import { Platform, TextInput, type TextInputProps, type TextStyle } from 'react-native'
import { autoCompleteProps, type InputAutoComplete } from '../lib/autoComplete'
import { useTheme } from '../theme/useTheme'

export type InputType = 'text' | 'email' | 'password' | 'numeric'

export interface InputProps {
  readonly type?: InputType
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
  readonly onSubmit?: () => void
  readonly testID?: string
  readonly accessibilityLabel?: string
  readonly mono?: boolean
  readonly onFocus?: () => void
  readonly onBlur?: () => void
  /**
   * Autofill hint (#451). Numeric fields default to `off`: amounts must never be filled from
   * the browser's memory. Text fields without a hint leave the browser's own heuristics alone.
   */
  readonly autoComplete?: InputAutoComplete
  /** `characters` for codes that are written in capitals (IBAN). Defaults to `none`. */
  readonly autoCapitalize?: 'none' | 'characters'
}

const KEYBOARD_TYPE: Record<InputType, 'default' | 'email-address' | 'number-pad'> = {
  text: 'default',
  email: 'email-address',
  password: 'default',
  numeric: 'number-pad',
}

export function Input({
  type = 'text',
  value,
  onChange,
  placeholder,
  onSubmit,
  testID,
  accessibilityLabel,
  mono = false,
  onFocus,
  onBlur,
  autoComplete,
  autoCapitalize = 'none',
}: InputProps) {
  const t = useTheme()
  const [isFocused, setIsFocused] = useState(false)

  const style: TextStyle = {
    width: '100%',
    minHeight: 52,
    paddingHorizontal: t.space.s4,
    paddingVertical: t.space.s3,
    color: t.color.tinte,
    backgroundColor: t.color.karte,
    borderWidth: 2,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
    fontFamily: mono ? t.font.mono : t.font.text,
    fontSize: mono ? t.size.l : t.size.m,
    ...(mono ? { letterSpacing: 0.04 * t.size.l, fontVariant: ['tabular-nums'] as const } : {}),
    ...(isFocused ? t.shadow.hartS : {}),
    ...({ outlineStyle: 'none', outlineWidth: 0 } as any),
  }
  const hint = autoComplete ?? (type === 'numeric' ? 'off' : undefined)
  const autofill = hint === undefined ? {} : (autoCompleteProps(hint, Platform.OS) as Pick<TextInputProps, 'autoComplete' | 'textContentType'>)
  return (
    <TextInput
      testID={testID}
      {...autofill}
      accessibilityLabel={accessibilityLabel}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={t.color.tinte2}
      secureTextEntry={type === 'password'}
      keyboardType={KEYBOARD_TYPE[type]}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      onSubmitEditing={onSubmit}
      onFocus={() => {
        setIsFocused(true)
        onFocus?.()
      }}
      onBlur={() => {
        setIsFocused(false)
        onBlur?.()
      }}
      style={style}
    />
  )
}
