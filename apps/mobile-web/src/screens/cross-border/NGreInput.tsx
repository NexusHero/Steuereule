import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Feld, Input } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { wholeEurosFrom } from '../shared/wholeEuros'

/** One field of the Anlage N-Gre facts: saved on Enter or blur; an amount is rounded to whole units as stored. */
export function NGreInput({
  label,
  initial,
  controlledValue,
  onControlledChange,
  numeric = false,
  testID,
  onCommit,
}: {
  readonly label: string
  readonly initial: string
  readonly controlledValue?: string
  readonly onControlledChange?: (text: string) => void
  readonly numeric?: boolean
  readonly testID: string
  readonly onCommit: (text: string) => void
}) {
  const [internalText, setInternalText] = useState(initial)
  const text = controlledValue !== undefined ? controlledValue : internalText
  function setText(next: string) {
    if (onControlledChange) onControlledChange(next)
    else setInternalText(next)
  }
  const { t: tr } = useTranslation(APP_NS)
  const [unreadable, setUnreadable] = useState(false)
  function commit() {
    const trimmed = text.trim()
    if (!numeric || trimmed === '') {
      setUnreadable(false)
      if (trimmed !== initial) onCommit(trimmed)
      return
    }
    // An amount typed as printed („948,60“) is rounded to the whole amount the form takes, and shown as stored.
    const amount = wholeEurosFrom(trimmed)
    setUnreadable(amount === null)
    if (amount === null) return
    const stored = String(amount)
    if (stored !== trimmed) setText(stored)
    if (stored !== initial) onCommit(stored)
  }
  return (
    <Feld label={label} {...(unreadable ? { error: tr('betrag.unlesbar') } : {})}>
      <Input
        type={numeric ? 'numeric' : 'text'}
        value={text}
        onChange={setText}
        onSubmit={commit}
        onBlur={commit}
        accessibilityLabel={label}
        testID={testID}
      />
    </Feld>
  )
}
