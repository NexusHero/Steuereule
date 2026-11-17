import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feld, Input, useTheme } from '@steuereule/ui'
import { integerFrom } from './integer'
import { unclearableFieldStyles } from './screenStyles'

interface UnclearableNumberFieldProps {
  readonly label: string
  readonly state: { readonly kind: string; readonly value?: number }
  readonly placeholder: string
  readonly unclearLabel: string
  readonly testID?: string
  readonly onRecorded: (value: number) => void
  readonly onUnclear: () => void
}

/** A whole-number field the user can also answer with "unclear". */
export function UnclearableNumberField({ label, state, placeholder, unclearLabel, testID, onRecorded, onUnclear }: UnclearableNumberFieldProps) {
  const s = unclearableFieldStyles(useTheme())
  const [text, setText] = useState(state.kind === 'erfasst' ? String(state.value) : '')

  function commit() {
    const value = integerFrom(text)
    if (value === null) return
    if (state.kind === 'erfasst' && state.value === value) return
    onRecorded(value)
  }

  return (
    <Feld label={label}>
      <View style={s.feldRow}>
        <Input
          type="numeric"
          mono
          value={state.kind === 'unklar' ? '' : text}
          onChange={setText}
          placeholder={placeholder}
          onSubmit={commit}
          onBlur={commit}
          accessibilityLabel={`${label} (${placeholder})`}
          {...(testID ? { testID } : {})}
        />
        <Pressable accessibilityRole="button" onPress={onUnclear} style={s.unklarButton}>
          <Text style={state.kind === 'unklar' ? s.unklarActive : s.unklarLabel}>{unclearLabel}</Text>
        </Pressable>
      </View>
    </Feld>
  )
}
