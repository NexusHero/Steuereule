// OPS-16: the running tax year comes from the server's clock, not from a year written into the client.
// The suite pins the server answer to 2026 (test-setup.ts); these tests move it to 2027.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { server } from '../test-msw-server'
import { createAppI18n } from '../i18n/app-i18n'
import { Appbar } from '../screens/cockpit/CockpitHeader'
import { ShellStateProvider, useShellState } from '../navigation/ShellState'
import { isSelectableYear } from '../navigation/guards'
import { defaultTaxYear, isRunningTaxYear, runningTaxYear, selectableTaxYears, setServerRunningTaxYear } from './taxYear'
import { useServerTaxYearSync } from './useServerTaxYearSync'

afterEach(() => {
  vi.useRealTimers()
})

function ShellYear() {
  return <span data-testid="shell-year">{useShellState().taxYear}</span>
}

function Synced({ withShell = false }: { readonly withShell?: boolean }) {
  useServerTaxYearSync()
  return (
    <>
      <Appbar year={defaultTaxYear()} onYearChange={() => {}} isRefreshing={false} />
      {withShell ? (
        <ShellStateProvider onRegister={() => {}} onLogin={() => {}} onSignedOut={() => {}}>
          <ShellYear />
        </ShellStateProvider>
      ) : null}
    </>
  )
}

function renderSynced(withShell = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <Synced withShell={withShell} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('the tax-year clock (OPS-16)', () => {
  it('in 2027 the server makes 2027 the running year, offers 2027 to 2023 and starts new users in 2026', () => {
    setServerRunningTaxYear(2027)
    expect(runningTaxYear()).toBe(2027)
    expect(selectableTaxYears()).toEqual([2027, 2026, 2025, 2024, 2023])
    expect(defaultTaxYear()).toBe(2026)
    // 2026 is no longer the running year: its printout is open, not locked as „läuft“.
    expect(isRunningTaxYear(2026)).toBe(false)
    expect(isRunningTaxYear(2027)).toBe(true)
    expect(isSelectableYear(2027)).toBe(true)
    expect(isSelectableYear(2022)).toBe(false)
  })

  it('without a server answer the device clock in German time stands in, never a fixed year', () => {
    setServerRunningTaxYear(null)
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-12-31T22:59:00Z') })
    expect(runningTaxYear()).toBe(2026)
    vi.setSystemTime(new Date('2026-12-31T23:00:00Z'))
    expect(runningTaxYear()).toBe(2027)
    expect(defaultTaxYear()).toBe(2026)
  })

  it('reads the year from GET /v1/capabilities, and the year chips and the start year follow it', async () => {
    server.use(http.get('*/v1/capabilities', () => HttpResponse.json({ selbststaendig: false, runningTaxYear: 2027 })))
    renderSynced(true)
    expect(screen.getByTestId('shell-year').textContent).toBe('2025')
    await waitFor(() => expect(screen.getByTestId('jahr-2027').textContent).toBe('2027 · läuft'))
    expect(screen.getByTestId('jahr-2026').textContent).toBe('2026')
    expect(screen.queryByTestId('jahr-2022')).toBeNull()
    expect(screen.getByTestId('shell-year').textContent).toBe('2026')
  })

  it('keeps the device year when an older API answers without the field', async () => {
    let answered = false
    server.use(
      http.get('*/v1/capabilities', () => {
        answered = true
        return HttpResponse.json({ selbststaendig: false })
      }),
    )
    renderSynced()
    await waitFor(() => expect(answered).toBe(true))
    await act(async () => {})
    expect(runningTaxYear()).toBe(2026)
  })
})

describe('no running year written into the client (OPS-16 lock)', () => {
  it('the clock module names no year, and no source brings back a year constant', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const clock = readFileSync(join(__dirname, 'taxYear.ts'), 'utf8')
    expect(clock).not.toMatch(/\b20\d\d\b/)
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path)
      }
    }
    walk(join(__dirname, '..'))
    const offenders = files.filter((f) => /\b(CURRENT_TAX_YEAR|SELECTABLE_TAX_YEARS|DEFAULT_TAX_YEAR)\b/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
