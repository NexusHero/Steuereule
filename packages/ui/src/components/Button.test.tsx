import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'
import { renderUi } from '../test-utils'

describe('Button', () => {
  it('renders_its_label', () => {
    renderUi(<Button>Nächster Schritt</Button>)
    expect(screen.getByText('Nächster Schritt')).toBeTruthy()
  })

  it('the_ink_variant_carries_no_lime_and_no_offset_shadow', () => {
    renderUi(
      <>
        <Button testID="ink" variant="tinte">Senden</Button>
        <Button testID="lime">Weiter</Button>
      </>,
    )
    const ink = (screen.getByTestId('ink') as HTMLElement).style
    const lime = (screen.getByTestId('lime') as HTMLElement).style
    expect(ink.backgroundColor).not.toBe(lime.backgroundColor)
    expect(ink.backgroundColor).toBe((screen.getByText('Weiter') as HTMLElement).style.color)
    expect(ink.boxShadow).toBe('')
    expect(lime.boxShadow).not.toBe('')
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

  it('keeps_its_own_min_height_alongside_the_caller_style_and_never_lets_it_shrink', () => {
    renderUi(
      <Button testID="cta" style={{ marginTop: 24, minHeight: 10 }}>
        Los
      </Button>,
    )
    const el = screen.getByTestId('cta') as HTMLElement
    expect(el.style.marginTop).toBe('24px')
    expect(el.style.minHeight).toBe('52px')
  })

  it('lets_a_caller_raise_the_min_height', () => {
    renderUi(<Button testID="cta" style={{ minHeight: 80 }}>Los</Button>)
    expect((screen.getByTestId('cta') as HTMLElement).style.minHeight).toBe('80px')
  })

  it('keeps_the_disabled_dimming_when_the_caller_passes_opacity', () => {
    renderUi(
      <Button testID="cta" disabled style={{ opacity: 1, marginTop: 24 }}>
        Los
      </Button>,
    )
    const el = screen.getByTestId('cta') as HTMLElement
    expect(el.style.opacity).toBe('0.4')
    expect(el.style.marginTop).toBe('24px')
  })

  it('keeps_the_press_affordance_when_the_caller_passes_transform_or_opacity', () => {
    renderUi(
      <Button testID="cta" style={{ transform: [{ translateX: 0 }], shadowOpacity: 1 }}>
        Los
      </Button>,
    )
    const el = screen.getByTestId('cta')
    fireEvent.keyDown(el, { key: ' ' })
    expect(getComputedStyle(el).transform).toBe('translateX(3px) translateY(3px)')
  })
})
