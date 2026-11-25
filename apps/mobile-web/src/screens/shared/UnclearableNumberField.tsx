import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feld, Input, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { integerFrom } from './integer'
import { wholeEurosOrUnreadable, type CommittedAmount } from './amountField'
import { unclearableFieldStyles } from './screenStyles'

interface UnclearableNumberFieldProps {
  readonly label: string
  readonly state: { readonly kind: string; readonly value?: number }
  readonly placeholder: string
  readonly unclearLabel: string
  readonly testID?: string
  /** A count or a year (digits only) instead of a euro amount typed the German way („18.000“). */
  readonly whole?: boolean
  readonly onRecorded: (value: number) => void
  readonly onUnclear: () => void
}

function wholeOrUnreadable(text: string): CommittedAmount {
  if (text.trim() === '') return null
  return integerFrom(text) ?? 'unreadable'
}

/** A whole-number field the user can also answer with "unclear". */
export function UnclearableNumberField({ label, state, placeholder, unclearLabel, testID, whole = false, onRecorded, onUnclear }: UnclearableNumberFieldProps) {
  const s = unclearableFieldStyles(useTheme())
  const { t: tr } = useTranslation(APP_NS)
  const stored = state.kind === 'erfasst' && state.value !== undefined ? state.value : null
  const [text, setText] = useState(stored === null ? '' : String(stored))
  const [unreadable, setUnreadable] = useState(false)
  // The stored value is the field's starting point and follows the server after a save.
  useEffect(() => {
    setText(stored === null ? '' : String(stored))
  }, [state.kind, stored])

  function commit() {
    const value = whole ? wholeOrUnreadable(text) : wholeEurosOrUnreadable(text)
    // WEB-12: text the app cannot read is named at the field instead of silently not saved.
    setUnreadable(value === 'unreadable')
    // An emptied field saves nothing (the answer is a value or „Kann ich nicht lesen“), so it shows the stored
    // value again instead of looking cleared while the server keeps it.
    if (value === null && stored !== null) setText(String(stored))
    if (value === null || value === 'unreadable') return
    if (stored === value) return
    onRecorded(value)
  }

  return (
    <Feld label={label} {...(unreadable ? { error: tr(whole ? 'arbeitstage.zahlUnlesbar' : 'betrag.unlesbar') } : {})}>
      <View style={s.feldRow}>
        <Input
          type="numeric"
          mono
          // WEB-13: what is typed after „Kann ich nicht lesen“ is shown, and that is what a commit saves.
          value={text}
          onChange={(next) => {
            setText(next)
            setUnreadable(false)
          }}
          placeholder={placeholder}
          onSubmit={commit}
          onBlur={commit}
          accessibilityLabel={`${label} (${placeholder})`}
          {...(testID ? { testID } : {})}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setText('')
            setUnreadable(false)
            onUnclear()
          }}
          style={s.unklarButton}
        >
          <Text style={state.kind === 'unklar' ? s.unklarActive : s.unklarLabel}>{unclearLabel}</Text>
        </Pressable>
      </View>
    </Feld>
  )
}
