// Regression coverage for the "green eyes, no blink" bug (splash owl): the eyelid layer must
// render retracted (eyes OPEN) at rest when no `lidStyle` is supplied, and must still accept a
// caller-supplied `lidStyle` to drive a blink. See SplashScreen.tsx for the entrance that plays
// the blink; this file only pins OwlMark's own presentational contract.
import { describe, it, expect } from 'vitest'
import { render, act } from '@testing-library/react'
import { Animated } from 'react-native'
import { ThemeProvider } from '@steuereule/ui'
import { OwlMark } from './OwlMark'

// react-native-web renders inline `transform`/`transformOrigin` styles onto the wrapping <div> for
// dynamic style values (see the test-only react-native-svg stub — Svg/Rect/Circle become plain
// Views), so we can assert on the rendered markup directly rather than reaching into RN internals.
function lidLayerHtml(container: HTMLElement) {
  // Layer order in OwlMark is head, glasses, lid (last, drawn on top) — the third `position:
  // absolute` child of the outer wrapper.
  const layers = container.querySelectorAll(':scope > div > div[style*="position: absolute"]')
  return layers[2]?.getAttribute('style') ?? ''
}

describe('OwlMark', () => {
  it('renders the eyelids retracted (eyes OPEN) at rest when no lidStyle is given', () => {
    const { container } = render(
      <ThemeProvider mode="light">
        <OwlMark />
      </ThemeProvider>,
    )
    const style = lidLayerHtml(container)
    // scaleY(0) anchored at the top = fully retracted = eyes visible, never the green lids
    // covering the pupils (the bug: lids used to render fully opaque/covering by default).
    expect(style).toContain('transform: scaleY(0)')
    expect(style).toContain('transform-origin: center top')
  })

  it('lets a consumer override the lid layer to drive a blink', () => {
    const { container } = render(
      <ThemeProvider mode="light">
        <OwlMark lidStyle={{ transform: [{ scaleY: 1 }], transformOrigin: 'center top' }} />
      </ThemeProvider>,
    )
    const style = lidLayerHtml(container)
    expect(style).toContain('transform: scaleY(1)')
  })

  // Regression for the "the whole entrance is inert in the real browser" bug: SplashScreen feeds
  // OwlMark's layers a live `Animated.Value`, not a static number. On react-native-web, a plain
  // (non-animated) `View` handed an `Animated.Value` inside its style never resolves it — the
  // style freezes at whatever the *object itself* stringifies to (`scaleY([object Object])`,
  // effectively `none`) for the component's entire lifetime, and never updates when the value
  // changes. Only `Animated.View` (or `Animated.createAnimatedComponent`) subscribes to the value
  // and pushes real, live CSS to the DOM node. This must hold for every layer OwlMark exposes for
  // animation (head, glasses, lid) — asserted here for the lid, since that's the layer the bug
  // report was about, using the same live-Animated.Value path SplashScreen actually uses.
  it('resolves a live Animated.Value on the lid layer to a real, live transform (not a plain View)', () => {
    const lidAnim = new Animated.Value(0)
    const { container } = render(
      <ThemeProvider mode="light">
        <OwlMark lidStyle={{ transform: [{ scaleY: lidAnim }], transformOrigin: 'center top' }} />
      </ThemeProvider>,
    )
    // Rest: scaleY(0) should already be a concrete, resolved number — not the Animated.Value
    // object leaking through as `[object Object]`.
    expect(lidLayerHtml(container)).toContain('transform: scaleY(0)')
    expect(lidLayerHtml(container)).not.toContain('[object Object]')

    // Mutating the value (exactly what SplashScreen's Animated.timing does every frame) must
    // reach the DOM without a React re-render — that's the whole point of Animated.Value.
    act(() => {
      lidAnim.setValue(1)
    })
    expect(lidLayerHtml(container)).toContain('transform: scaleY(1)')
  })
})
