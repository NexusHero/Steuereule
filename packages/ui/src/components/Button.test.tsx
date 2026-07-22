import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'
import { renderUi } from '../test-utils'

describe('Button', () => {
  it('renders_its_label', () => {
    renderUi(<Button>Nächster Schritt</Button>)
    expect(screen.getByText('Nächster Schritt')).toBeTruthy()
  })

  it('fires_onPress_when_pressed', () => {
    const onPress = vi.fn()
    renderUi(<Button onPress={onPress}>Los</Button>)
    fireEvent.click(screen.getByText('Los'))
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('does_not_fire_when_disabled', () => {
    const onPress = vi.fn()
    renderUi(
      <Button onPress={onPress} disabled>
        Los
      </Button>,
    )
    fireEvent.click(screen.getByText('Los'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('exposes_button_role', () => {
    renderUi(<Button>Los</Button>)
    expect(screen.getByRole('button')).toBeTruthy()
  })
})
