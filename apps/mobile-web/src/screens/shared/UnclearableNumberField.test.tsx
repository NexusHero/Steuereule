import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../i18n/app-i18n'
import { UnclearableNumberField } from './UnclearableNumberField'

function renderField(state: { kind: string; value?: number }) {
  const onRecorded = vi.fn()
  const onUnclear = vi.fn()
  render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <UnclearableNumberField label="Jahresbetrag" state={state} placeholder="€" unclearLabel="Kann ich nicht lesen" whole onRecorded={onRecorded} onUnclear={onUnclear} />
      </ThemeProvider>
    </I18nextProvider>,
  )
  return { input: screen.getByLabelText(/Jahresbetrag/) as HTMLInputElement, onRecorded, onUnclear }
}

/** WEB-13: the field never shows something other than what is stored or about to be saved. */
describe('UnclearableNumberField', () => {
  it('an emptied field shows the stored value again instead of looking cleared', () => {
    const { input, onRecorded, onUnclear } = renderField({ kind: 'erfasst', value: 1200 })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(input.value).toBe('1200')
    expect(onRecorded).not.toHaveBeenCalled()
    expect(onUnclear).not.toHaveBeenCalled()
  })

  it('an empty field without a stored value stays empty and saves nothing', () => {
    const { input, onRecorded } = renderField({ kind: 'offen' })
    fireEvent.blur(input)
    expect(input.value).toBe('')
    expect(onRecorded).not.toHaveBeenCalled()
  })

  it('a changed value is saved', () => {
    const { input, onRecorded } = renderField({ kind: 'erfasst', value: 1200 })
    fireEvent.change(input, { target: { value: '1300' } })
    fireEvent.blur(input)
    expect(onRecorded).toHaveBeenCalledWith(1300)
  })
})
