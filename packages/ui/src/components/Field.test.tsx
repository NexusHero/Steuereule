import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { Field } from './Field'
import { Input } from './Input'
import { Chip } from './Chip'
import { renderUi } from '../test-utils'

describe('Field', () => {
  it('gives its input the visible label as accessible name (WEB-19)', () => {
    renderUi(
      <Field label="E-Mail-Adresse">
        <Input type="email" value="" onChange={() => {}} />
      </Field>,
    )
    expect(screen.getByLabelText('E-Mail-Adresse')).toBeTruthy()
  })

  it('keeps an accessible name the input already has', () => {
    renderUi(
      <Field label="Passwort">
        <Input type="password" value="" onChange={() => {}} accessibilityLabel="Neues Passwort" />
      </Field>,
    )
    expect(screen.getByLabelText('Neues Passwort')).toBeTruthy()
    expect(screen.queryByLabelText('Passwort')).toBeNull()
  })
})

describe('Chip', () => {
  it('is at least 44 points high, the smallest touch target (WEB-23)', () => {
    renderUi(<Chip testID="chip">Gast</Chip>)
    const style = getComputedStyle(screen.getByTestId('chip'))
    expect(Number.parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44)
  })
})
