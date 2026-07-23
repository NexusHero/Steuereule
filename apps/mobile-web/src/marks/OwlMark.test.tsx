// Regression coverage for the "green eyes, no blink" bug (splash owl): the eyelid layer must
// render retracted (eyes OPEN) at rest when no `lidStyle` is supplied, and must still accept a
// caller-supplied `lidStyle` to drive a blink. See SplashScreen.tsx for the entrance that plays
// the blink; this file only pins OwlMark's own presentational contract.
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
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
})
