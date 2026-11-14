// K2 (UX review 2026-11): a new user starts in the last completed tax year, not in the running
// one — the running year has no official forms yet. A year the user chose explicitly is kept.
import { afterEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Text } from 'react-native'
import { ShellStateProvider, useShellState } from './ShellState'
import { CURRENT_TAX_YEAR, DEFAULT_TAX_YEAR, isRunningTaxYear } from '../config/taxYear'

afterEach(() => sessionStorage.clear())

let setYear: ((year: number) => void) | null = null

function Probe() {
  const { taxYear, setTaxYear } = useShellState()
  setYear = setTaxYear
  return <Text testID="year">{String(taxYear)}</Text>
}

function renderShell() {
  return render(
    <ShellStateProvider onRegister={() => {}} onLogin={() => {}} onSignedOut={() => {}}>
      <Probe />
    </ShellStateProvider>,
  )
}

describe('ShellState tax year', () => {
  it('defaults to the last completed year', () => {
    expect(DEFAULT_TAX_YEAR).toBe(CURRENT_TAX_YEAR - 1)
    renderShell()
    expect(screen.getByTestId('year').textContent).toBe(String(DEFAULT_TAX_YEAR))
  })

  it('keeps a year the user chose explicitly, the running year included', () => {
    const first = renderShell()
    act(() => setYear?.(CURRENT_TAX_YEAR))
    expect(screen.getByTestId('year').textContent).toBe(String(CURRENT_TAX_YEAR))
    first.unmount()

    renderShell()
    expect(screen.getByTestId('year').textContent).toBe(String(CURRENT_TAX_YEAR))
  })

  it('names the running year', () => {
    expect(isRunningTaxYear(CURRENT_TAX_YEAR)).toBe(true)
    expect(isRunningTaxYear(DEFAULT_TAX_YEAR)).toBe(false)
  })
})
