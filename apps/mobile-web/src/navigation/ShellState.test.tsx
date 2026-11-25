// K2 (UX review 2026-11): a new user starts in the last completed tax year, not in the running
// one — the running year has no official forms yet. A year the user chose explicitly is kept.
import { afterEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Text } from 'react-native'
import { ShellStateProvider, useShellState } from './ShellState'
import { defaultTaxYear, isRunningTaxYear, runningTaxYear } from '../config/taxYear'

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
    expect(defaultTaxYear()).toBe(runningTaxYear() - 1)
    renderShell()
    expect(screen.getByTestId('year').textContent).toBe(String(defaultTaxYear()))
  })

  it('keeps a year the user chose explicitly, the running year included', () => {
    const first = renderShell()
    act(() => setYear?.(runningTaxYear()))
    expect(screen.getByTestId('year').textContent).toBe(String(runningTaxYear()))
    first.unmount()

    renderShell()
    expect(screen.getByTestId('year').textContent).toBe(String(runningTaxYear()))
  })

  it('names the running year', () => {
    expect(isRunningTaxYear(runningTaxYear())).toBe(true)
    expect(isRunningTaxYear(defaultTaxYear())).toBe(false)
  })
})
