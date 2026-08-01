import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@steuereule/ui'
import { QrMark } from './QrMark'

function renderQr(value: string) {
  return render(
    <ThemeProvider mode="light">
      <QrMark value={value} accessibilityLabel="QR-Code zum Anmelden mit dem Handy" />
    </ThemeProvider>,
  )
}

describe('QrMark', () => {
  it('renders an accessible image for the given value', () => {
    renderQr('https://steuereule.example/geraet?user_code=K7QX-9F2M')
    expect(screen.getByLabelText('QR-Code zum Anmelden mit dem Handy')).toBeTruthy()
  })

  it('encodes different values into different module patterns', () => {
    const { unmount: unmountA } = renderQr('https://steuereule.example/geraet?user_code=AAAA-1111')
    const cellsA = screen.getByTestId('qr-mark').children.length
    unmountA()

    const { unmount: unmountB } = renderQr(
      'https://steuereule.example/geraet?user_code=AAAA-1111&extra=a-genuinely-different-and-much-longer-payload-to-force-a-different-qr-version',
    )
    const cellsB = screen.getByTestId('qr-mark').children.length
    unmountB()

    // Not asserting exact counts (that's the encoder's own concern, not this component's) — just
    // that two different inputs are not silently rendering the same, hard-coded pattern.
    expect(cellsA).not.toBe(cellsB)
  })

  it('renders the same value deterministically across mounts', () => {
    const { unmount: unmountFirst } = renderQr('https://steuereule.example/geraet?user_code=K7QX-9F2M')
    const cellsFirst = screen.getByTestId('qr-mark').children.length
    unmountFirst()

    renderQr('https://steuereule.example/geraet?user_code=K7QX-9F2M')
    const cellsSecond = screen.getByTestId('qr-mark').children.length
    expect(cellsFirst).toBe(cellsSecond)
  })
})
