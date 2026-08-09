import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Text } from 'react-native'
import { Option } from './Option'
import { renderUi } from '../test-utils'

describe('Option', () => {
  it('renders_its_label', () => {
    renderUi(<Option>Angestellt</Option>)
    expect(screen.getByText('Angestellt')).toBeTruthy()
  })

  it('renders_element_children', () => {
    renderUi(
      <Option>
        <Text>elem-option</Text>
      </Option>,
    )
    expect(screen.getByText('elem-option')).toBeTruthy()
  })

  it('fires_onPress_when_pressed', () => {
    const onPress = vi.fn()
    renderUi(<Option onPress={onPress}>Angestellt</Option>)
    fireEvent.click(screen.getByText('Angestellt'))
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('exposes_button_role', () => {
    renderUi(<Option>Angestellt</Option>)
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('carries_selection_state_via_aria_pressed_not_aria_selected', () => {
    // The DS component (Option.jsx) marks selection with `aria-pressed`, not `aria-selected` —
    // pin the exact attribute so a well-meaning "use accessibilityState.selected instead" edit
    // goes red rather than silently changing the exposed semantics.
    renderUi(<Option gewaehlt>Angestellt</Option>)
    const el = screen.getByRole('button') as HTMLElement
    expect(el.getAttribute('aria-pressed')).toBe('true')
    expect(el.getAttribute('aria-selected')).toBeNull()
  })

  it('is_not_pressed_when_unselected', () => {
    renderUi(<Option>Angestellt</Option>)
    expect((screen.getByRole('button') as HTMLElement).getAttribute('aria-pressed')).toBe('false')
  })

  it('applies_the_caller_supplied_style_alongside_its_own', () => {
    renderUi(
      <Option testID="opt" style={{ marginTop: 12 }}>
        Angestellt
      </Option>,
    )
    expect((screen.getByTestId('opt') as HTMLElement).style.marginTop).toBe('12px')
  })
})
