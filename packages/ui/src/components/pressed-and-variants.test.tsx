import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Text } from 'react-native'
import { Button } from './Button'
import { Chip } from './Chip'
import { Option } from './Option'
import { renderUi } from '../test-utils'

/** Holding the control down: react-native-web's Pressable marks it pressed on a held Space key. */
function press(element: HTMLElement) {
  fireEvent.keyDown(element, { key: ' ' })
}

describe('Chip', () => {
  it('shows a check mark only for the chosen chip', () => {
    const { rerender } = renderUi(<Chip testID="chip">Pendlerpauschale</Chip>)
    expect(screen.queryByText('✓')).toBeNull()
    rerender(<Chip testID="chip" active>Pendlerpauschale</Chip>)
    expect(screen.getByText('✓')).toBeTruthy()
  })

  it.each(['standard', 'src', 'pro'] as const)('renders the %s variant with its label and reports presses', (variant) => {
    const onPress = vi.fn()
    renderUi(<Chip testID="chip" variant={variant} onPress={onPress}>Etikett</Chip>)
    fireEvent.click(screen.getByTestId('chip'))
    expect(onPress).toHaveBeenCalledOnce()
    expect(screen.getByText('Etikett')).toBeTruthy()
  })

  it('uses a different surface for each variant, and the lime fill whenever it is active', () => {
    const bg = (props: { variant?: 'standard' | 'src' | 'pro'; active?: boolean }) => {
      const { unmount } = renderUi(<Chip testID="chip" {...props}>x</Chip>)
      const value = getComputedStyle(screen.getByTestId('chip')).backgroundColor
      unmount()
      return value
    }
    const standard = bg({})
    const src = bg({ variant: 'src' })
    const pro = bg({ variant: 'pro' })
    const active = bg({ variant: 'pro', active: true })
    expect(new Set([standard, src, pro]).size).toBe(3)
    expect(active).not.toBe(pro)
    expect(active).toBe(bg({ active: true }))
  })

  it('dims while pressed', () => {
    renderUi(<Chip testID="chip">Etikett</Chip>)
    const chip = screen.getByTestId('chip')
    press(chip)
    expect(getComputedStyle(chip).opacity).toBe('0.7')
  })

  it('renders an element child as it is', () => {
    renderUi(<Chip active><Text>eigenes Kind</Text></Chip>)
    expect(screen.getByText('eigenes Kind')).toBeTruthy()
  })
})

describe('Button pressed states', () => {
  it('moves the primary button down onto its shadow while pressed', () => {
    renderUi(<Button testID="btn">Weiter</Button>)
    const btn = screen.getByTestId('btn')
    press(btn)
    expect(getComputedStyle(btn).transform).toContain('translate')
  })

  it('dims a secondary button while pressed instead of moving it', () => {
    renderUi(<Button testID="btn" variant="ghost">Zurück</Button>)
    const btn = screen.getByTestId('btn')
    press(btn)
    expect(getComputedStyle(btn).opacity).toBe('0.7')
  })

  it('does nothing when a disabled button is pressed', () => {
    const onPress = vi.fn()
    renderUi(<Button testID="btn" disabled onPress={onPress}>Weiter</Button>)
    const btn = screen.getByTestId('btn')
    press(btn)
    fireEvent.click(btn)
    expect(onPress).not.toHaveBeenCalled()
    expect(getComputedStyle(btn).opacity).toBe('0.4')
  })
})

describe('Option', () => {
  it('outlines an unselected option in ink while pressed, but leaves the chosen one alone', () => {
    const onPress = vi.fn()
    const { rerender } = renderUi(<Option testID="opt" onPress={onPress}>Ja</Option>)
    const unselected = screen.getByTestId('opt')
    const before = unselected.style.borderTopColor
    press(unselected)
    expect(unselected.style.borderTopColor).not.toBe(before)
    fireEvent.click(unselected)
    expect(onPress).toHaveBeenCalledOnce()

    // A chosen option already carries the ink contour: pressing it changes nothing.
    rerender(<Option testID="opt" selected onPress={onPress}>Ja</Option>)
    const chosen = screen.getByTestId('opt')
    const chosenBefore = chosen.style.borderTopColor
    press(chosen)
    expect(chosen.style.borderTopColor).toBe(chosenBefore)
  })
})
