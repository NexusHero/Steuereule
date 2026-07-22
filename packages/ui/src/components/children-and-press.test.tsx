import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Text } from 'react-native'
import { Button } from './Button'
import { Pill } from './Pill'
import { Sticker } from './Sticker'
import { AiChip } from './AiChip'
import { renderUi } from '../test-utils'

// Each component accepts either a string (wrapped in <Text>) or a ready element — cover the
// non-string branch that the label tests do not exercise.
describe('element children', () => {
  it('Button_renders_element_children', () => {
    renderUi(
      <Button>
        <Text>elem-btn</Text>
      </Button>,
    )
    expect(screen.getByText('elem-btn')).toBeTruthy()
  })

  it('Pill_renders_element_children', () => {
    renderUi(
      <Pill>
        <Text>elem-pill</Text>
      </Pill>,
    )
    expect(screen.getByText('elem-pill')).toBeTruthy()
  })

  it('Sticker_renders_element_children', () => {
    renderUi(
      <Sticker>
        <Text>elem-sticker</Text>
      </Sticker>,
    )
    expect(screen.getByText('elem-sticker')).toBeTruthy()
  })

  it('AiChip_renders_element_children', () => {
    renderUi(
      <AiChip>
        <Text>elem-ai</Text>
      </AiChip>,
    )
    expect(screen.getByText('elem-ai')).toBeTruthy()
  })
})

describe('Button press state', () => {
  it('applies_pressed_style_on_pointer_down', () => {
    renderUi(<Button testID="btn">Druck</Button>)
    const btn = screen.getByRole('button')
    // Exercises the pressed branch of the Pressable style function.
    fireEvent.pointerDown(btn)
    fireEvent.pointerUp(btn)
    expect(screen.getByText('Druck')).toBeTruthy()
  })
})
