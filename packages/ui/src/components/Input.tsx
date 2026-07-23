// Text input (fk-input) — 2px ink contour, radius-s. Email/password/text variants map to the RN
// keyboard + secure-entry props so it works native and on web (RN-Web).
import { TextInput, type TextStyle } from 'react-native'
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
  /** Mono/tabular rendering for number-heavy fields (design-system rule: every number carries tabular-nums). */
  readonly mono?: boolean
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
}: InputProps) {
  const t = useTheme()
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
  }
  return (
    <TextInput
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={t.color.tinte2}
      secureTextEntry={type === 'password'}
      keyboardType={KEYBOARD_TYPE[type]}
      autoCapitalize="none"
      autoCorrect={false}
      onSubmitEditing={onSubmit}
      style={style}
    />
  )
}
