// The lock of WEB-28 and its class (ADR-0102 style, per screen): render a screen while every request the
// API gets answers 500, then assert that it shows a failure state and that nothing it does — not even a
// press on every button and a commit of every field — sends a write. A screen that turns a failed load into
// an empty form fails here: its "Weiter" or its blur-save PUTs the blanks over the stored data.
//
// For tests only.
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect } from 'vitest'
import { server } from './test-msw-server'

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface EveryQueryFails {
  /** `METHOD path` of every request that was not a read. */
  readonly writes: () => readonly string[]
  /** `METHOD path` of every request at all, for a test's own diagnosis. */
  readonly requests: () => readonly string[]
}

/** Answers every API request with 500 from now on (until the per-test reset) and records the writes. */
export function failEveryRequest(status = 500): EveryQueryFails {
  const writes: string[] = []
  const requests: string[] = []
  server.use(
    http.all('*', ({ request }) => {
      const url = new URL(request.url)
      const line = `${request.method} ${url.pathname}`
      requests.push(line)
      if (!READ_METHODS.has(request.method)) writes.push(line)
      return HttpResponse.json({ statusCode: status, message: 'Internal server error' }, { status })
    }),
  )
  return { writes: () => [...writes], requests: () => [...requests] }
}

/** The screen shows a failure: the shared LoadFailedState / ErrorState heading or an alert. */
export async function expectFailureShown(): Promise<void> {
  await waitFor(() => {
    const failure = screen.queryAllByTestId('fehler-zustand').length + screen.queryAllByRole('alert').length
    expect(failure, 'the screen shows no failure state while every request answers 500').toBeGreaterThan(0)
  })
}

/**
 * Presses every enabled button and commits every text field once, the way a user who did not notice the
 * failure would carry on. Errors thrown by a press (a navigation callback the test did not wire) are ignored:
 * the assertion is about requests, not about the press.
 */
export async function pokeEverything(): Promise<void> {
  for (const input of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
    if (input.disabled || input.readOnly) continue
    try {
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: '1' } })
      fireEvent.blur(input)
    } catch {
      // see above
    }
  }
  for (const button of screen.queryAllByRole('button')) {
    if (button.getAttribute('aria-disabled') === 'true' || (button as HTMLButtonElement).disabled) continue
    try {
      fireEvent.click(button)
    } catch {
      // see above
    }
  }
  // Let debounced saves and settled promises send what they would send.
  await new Promise((resolve) => setTimeout(resolve, 50))
}

/**
 * The whole lock: a failure is shown, and pressing everything sends no write. `allowWrites` names writes that
 * carry no stored data (e.g. a telemetry ping) — each one a visible exception in the test that needs it.
 */
export async function expectFailsClosed(failing: EveryQueryFails, options: { readonly allowWrites?: readonly RegExp[] } = {}): Promise<void> {
  await expectFailureShown()
  await pokeEverything()
  const allowed = options.allowWrites ?? []
  const writes = failing.writes().filter((line) => !allowed.some((pattern) => pattern.test(line)))
  expect(writes, 'a screen whose load failed sent a write').toEqual([])
}
