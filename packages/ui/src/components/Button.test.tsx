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

  it('applies_the_caller_supplied_style_alongside_its_own', () => {
    // Regression: `style` was accepted but silently dropped (oxlint no-unused-vars, ADR-0019
    // finding) — every one of Button's 27 real call sites (30 rendered instances, #177 census)
    // passes spacing through here.
    renderUi(
      <Button testID="cta" style={{ marginTop: 24 }}>
        Los
      </Button>,
    )
    expect((screen.getByTestId('cta') as HTMLElement).style.marginTop).toBe('24px')
  })

  it('carries_the_ds_mandated_full_width_contract', () => {
    // `.fk-btn { width: 100% }` (komponenten.css:12, #177). This is a contract assertion, not
    // a layout assertion: jsdom performs no layout, so getBoundingClientRect() would return
    // zeros regardless of whether the style is applied — asserting the *style*, not the
    // rendered box, is the only thing this test layer can honestly prove. The real-layout
    // proof lives in e2e/responsive/breakpoint-layout.mjs.
    renderUi(<Button testID="cta">Los</Button>)
    expect((screen.getByTestId('cta') as HTMLElement).style.width).toBe('100%')
  })

  it('a_caller_supplied_width_overrides_the_container_default_in_the_style_cascade', () => {
    // Proves spread order, not layout: `style` is spread last in Button's style array,
    // so a caller-supplied `width` reaches the DOM node over the container default
    // (#177). This does NOT by itself prove the DS's opt-out idiom (JahrTab.jsx:76,
    // `width: 'auto'` on a `.fk-btn`) actually works — under an `alignSelf: 'stretch'`
    // implementation this same assertion would still pass while the button kept
    // stretching (stretch applies exactly when width is 'auto'). That's why the
    // container uses `width: '100%'`, not `alignSelf: 'stretch'` (see Button.tsx) —
    // this test only pins that the cascade itself doesn't silently drop the override.
    renderUi(
      <Button testID="cta" style={{ width: 'auto' }}>
        Los
      </Button>,
    )
    expect((screen.getByTestId('cta') as HTMLElement).style.width).toBe('auto')
  })
})
