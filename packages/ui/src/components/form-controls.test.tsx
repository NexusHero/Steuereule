import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Text } from 'react-native'
import { Input } from './Input'
import { Feld } from './Feld'
import { Chip } from './Chip'
import { renderUi } from '../test-utils'

describe('Input', () => {
  it('reports typed text via onChange', () => {
    const onChange = vi.fn()
    renderUi(<Input value="" onChange={onChange} placeholder="du@beispiel.de" />)
    fireEvent.change(screen.getByPlaceholderText('du@beispiel.de'), { target: { value: 'a@b.de' } })
    expect(onChange).toHaveBeenCalledWith('a@b.de')
  })

  it('masks a password field', () => {
    renderUi(<Input type="password" value="secret" onChange={() => {}} testID="pw" />)
    // RN-Web renders secureTextEntry as type=password
    expect(screen.getByTestId('pw').getAttribute('type')).toBe('password')
  })

  it('gives a numeric field the numeric keyboard mode', () => {
    renderUi(<Input type="numeric" value="" onChange={() => {}} testID="num" />)
    expect(screen.getByTestId('num').getAttribute('inputmode')).toBe('numeric')
  })

  it('renders mono/tabular-nums for tax-number fields', () => {
    renderUi(<Input value="12 345" onChange={() => {}} testID="mono" mono />)
    const el = screen.getByTestId('mono') as HTMLElement
    expect(el.style.fontFamily).toContain('Space Mono')
  })
})

describe('Feld', () => {
  it('renders the label and the child control', () => {
    renderUi(
      <Feld label="E-Mail">
        <Text>control</Text>
      </Feld>,
    )
    expect(screen.getByText('E-Mail')).toBeTruthy()
    expect(screen.getByText('control')).toBeTruthy()
  })

  it('shows the error line when present, hides it otherwise', () => {
    const { rerender } = renderUi(
      <Feld label="Passwort" fehler="Mindestens 6 Zeichen.">
        <Text>x</Text>
      </Feld>,
    )
    expect(screen.getByText('Mindestens 6 Zeichen.')).toBeTruthy()
    rerender(
      <Feld label="Passwort">
        <Text>x</Text>
      </Feld>,
    )
    expect(screen.queryByText('Mindestens 6 Zeichen.')).toBeNull()
  })
})

describe('Chip', () => {
  it('fires onPress', () => {
    const onPress = vi.fn()
    renderUi(<Chip onPress={onPress}>Erstmal als Gast umschauen</Chip>)
    fireEvent.click(screen.getByText('Erstmal als Gast umschauen'))
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('renders in the active (lime-filled) state', () => {
    // Active fills the chip with lime; assert it still renders + stays pressable.
    const onPress = vi.fn()
    renderUi(
      <Chip aktiv onPress={onPress}>
        an
      </Chip>,
    )
    fireEvent.click(screen.getByText('an'))
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('renders the pro (nacht) variant', () => {
    renderUi(<Chip variante="pro">pro</Chip>)
    expect(screen.getByText('pro')).toBeTruthy()
  })

  it('applies_the_caller_supplied_style_alongside_its_own', () => {
    // Regression: `style` was accepted but silently dropped (oxlint no-unused-vars, ADR-0019
    // finding) — the DS spec (components/actions/Chip.d.ts) declares it as part of the contract.
    renderUi(
      <Chip testID="tag" style={{ marginTop: 12 }}>
        tag
      </Chip>,
    )
    expect((screen.getByTestId('tag') as HTMLElement).style.marginTop).toBe('12px')
  })
})
